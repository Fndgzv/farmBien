import { Component, ElementRef, OnInit, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { PedidosService } from '../../services/pedidos.service';
import { AuthService } from '../../services/auth.service';
import { ClienteService } from '../../services/cliente.service';
import { PedidoTicketComponent } from '../../impresiones/pedido-ticket/pedido-ticket.component';

import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faMinus, faPlus, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';

import { trigger, state, style, transition, animate } from '@angular/animations';


@Component({
  selector: 'app-pedidos',
  standalone: true,
  templateUrl: './pedidos.component.html',
  styleUrls: ['./pedidos.component.css'],
  imports: [FontAwesomeModule, FormsModule, CommonModule, PedidoTicketComponent],
  animations: [
    trigger('expandCollapse', [
      state('true', style({ height: '*', opacity: 1, padding: '*', overflow: 'hidden' })),
      state('false', style({ height: '0px', opacity: 0, padding: '0px', overflow: 'hidden' })),
      transition('true <=> false', animate('300ms ease-in-out'))
    ])
  ]

})


export class PedidosComponent implements OnInit {
  @ViewChild('contenedorTicket', { static: false }) contenedorTicket!: ElementRef;
  @ViewChild(PedidoTicketComponent) pedidoTicketComp!: PedidoTicketComponent;

  pedidos: any[] = [];
  filtroFolio: string = '';
  filtroDescripcion: string = '';
  filtroFechaPedido: string = '';

  esAdmin: boolean = false;
  pedidoDetalleAbiertoId: string | null = null;
  nombreCliente: string = '';
  idCliente: string = '';
  totalMonedero = 0;

  farmaciaId: string | null = null;
  farmaciaNombre: string = '';
  farmaciaTelefono: string = '';
  farmaciaDireccion: string = '';

  usuarioId: string = '';
  usuarioRol: string = '';
  usuarioNombre: string = '';

  firmaAutorizada: string = '';

  yaImprimio = false;
  mostrarTicket: boolean = false;
  paraImpresion: any = null;
  paraGuardar: any = null;
  folioGenerado: string | null = null;

  constructor(private library: FaIconLibrary,
    private pedidosService: PedidosService,
    private authService: AuthService,
    private clienteService: ClienteService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone) {
    // Registra íconos
    this.library.addIcons(
      faPlus, faMinus, faEyeSlash
    );
  }


  ngOnInit(): void {

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
      return;
    }

    if (farmacia) {
      this.farmaciaId = farmacia._id;
      this.farmaciaNombre = farmacia.nombre;
      this.farmaciaTelefono = farmacia.telefono;
      this.farmaciaDireccion = farmacia.direccion;
    }

    const usuario = this.authService.getUserData();
    const rol = usuario?.rol;
    const userName = usuario?.nombre;

    const usuarioId = usuario?.id;
    this.usuarioId = usuarioId;
    this.usuarioRol = rol;
    this.usuarioNombre = userName;

    this.authService.obtenerFirma(farmacia._id).subscribe({
      next: (resp) => {
        this.firmaAutorizada = resp.firma;
      },
      error: (err) => {
        console.error('❌ Error al obtener firma de farmacia:', err);
        Swal.fire('Error', 'No se pudo obtener la firma de la farmacia', 'error');
      }
    });

  }

  formatearFecha(fechaStr: string): string {
    const fecha = new Date(fechaStr);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
  }

  obtenerPedido(folio: string) {
    if (!this.farmaciaId) return;
    this.filtroFolio = folio.trim();
    // Solo disparamos la búsqueda cuando haya exactamente 6 caracteres alfanuméricos
    if (/^[A-Za-z0-9]{6}$/.test(this.filtroFolio)) {
      this.pedidosService
        .obtenerPedidos(this.farmaciaId, undefined, undefined, this.filtroFolio, 'inicial')
        .subscribe({
          next: resp => {
            this.pedidos = resp.pedidos;
            console.log('pedido folio:', this.filtroFolio, ": ", this.pedidos);
          },
          error: err => {
            console.error('Error al buscar por folio:', err);
            this.pedidos = [];
          }
        });
    } else {
      // antes de 6 chars o si borró el input, limpio el arreglo
      this.pedidos = [];
    }
  }

  async buscarSinFolio() {
    if (!this.farmaciaId) return;

    const fecha = this.filtroFechaPedido;
    const descripcion = this.filtroDescripcion?.trim();

    if (!fecha || !descripcion) {
      await Swal.fire('Campos incompletos', 'Debes proporcionar fecha y descripción para buscar sin folio.', 'warning');
      return;
    }

    if (descripcion.length < 5) {
      await Swal.fire('Descripción muy corta', 'Ingresa al menos 5 caracteres.', 'info');
      return;
    }

    this.pedidosService
      .obtenerPedidos(this.farmaciaId, fecha, undefined, undefined, 'inicial', descripcion)
      .subscribe({
        next: resp => {
          this.filtroFechaPedido = '';
          this.filtroDescripcion = '';
          if (!resp.pedidos || resp.pedidos.length === 0) {
            Swal.fire('No encontrado', `El día ${fecha} no existe un pedido de ${descripcion}`, 'info');
            this.pedidos = [];
          } else {
            this.pedidos = resp.pedidos;
          }
        },
        error: err => {
          console.error('Error al buscar sin folio:', err);
          Swal.fire('Error', 'Ocurrió un error al buscar pedidos.', 'error');
          this.pedidos = [];
          this.filtroFechaPedido = '';
          this.filtroDescripcion = '';
        }
      });
  }

  limpiarFiltro() {
    this.filtroFolio = '';
    this.buscarSinFolio();
  }

  async limpiarFiltroCompleto() {
    this.filtroFolio = '';
    this.filtroFechaPedido = '';
    this.filtroDescripcion = '';
    this.pedidos = [];
  }

  async CancelarPedido(pedido: any) {
    this.pedidoDetalleAbiertoId = null;
    if (pedido.estado === 'entregado') {
      Swal.fire({
        icon: 'success',
        title: 'En pedidos entregados, NO se aceptan cancelaciones',
        html: `Fecha: ${this.formatearFecha(pedido.fechaEntrega)}<br><br>` +
          `Entregado por: ${pedido.usuarioSurtio.nombre}`,
        confirmButtonText: 'Aceptar',
        allowOutsideClick: false,
        allowEscapeKey: false,
      });
      return;
    }
    if (pedido.estado === 'cancelado') {
      Swal.fire({
        icon: 'success',
        title: 'El pedido ya fue cancelado con anterioridad.',
        html: `Fecha: ${this.formatearFecha(pedido.fechaCancelacion)}<br><br>` +
          `Cancelado por: ${pedido.usuarioCancelo.nombre}`,
        confirmButtonText: 'Aceptar',
        allowOutsideClick: false,
        allowEscapeKey: false,
      });
      return;
    }

    if (!pedido.cliente) {
      this.nombreCliente = 'Público general';
    } else { this.nombreCliente = pedido.cliente.nombre; }

    const resp = await Swal.fire({
      icon: 'question',
      title: `Cancelar: ${pedido.folio}`,
      html:
        `<p><strong>Cliente:</strong></p>` +
        `<p><strong>${this.nombreCliente}</strong></p>` +
        `<p><strong>¿Realmente deseas CANCELAR el pedido de:</strong></p>` +
        `<p><strong>${pedido.descripcion}?</strong></p>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
      allowOutsideClick: false,
      allowEscapeKey: false,

    });

    if (resp.isConfirmed) {

      // Solicitar firma antes de cancelar
      let firmaInput = await Swal.fire({
        title: 'Autorización requerida',
        html: `
        <p style="color: rgb(3, 7, 83)";>Debes devolver en efectivo: <strong>$${(pedido.aCuenta - pedido.pagoACuenta.vale).toFixed(2)}</strong></p>
        <p style="color: rgb(3, 7, 83)";>Debes devolver en monedero: <strong>$${pedido.pagoACuenta.vale.toFixed(2)}</strong></p>
        <div id="firma-container"></div>
      `,
        didOpen: () => {
          const input = document.createElement('input');
          input.setAttribute('type', 'text');
          input.setAttribute('id', 'firma-autorizada');
          input.setAttribute('placeholder', 'Ingrese la firma');
          input.setAttribute('autocomplete', 'off');
          input.setAttribute('autocorrect', 'off');
          input.setAttribute('autocapitalize', 'off');
          input.setAttribute('spellcheck', 'false');
          input.setAttribute('class', 'swal2-input');
          input.setAttribute('style', 'font-family: text-security-disc, sans-serif; -webkit-text-security: disc;');
          input.setAttribute('name', 'firma_' + Date.now()); // nombre único para evitar autofill
          input.focus(); // 🔹 enfoca automáticamente
          document.getElementById('firma-container')?.appendChild(input);
        },
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Verificar',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        allowEscapeKey: false,
        preConfirm: async () => {

          const confirmButton = Swal.getConfirmButton();
          if (confirmButton) confirmButton.disabled = true;

          const input = (document.getElementById('firma-autorizada') as HTMLInputElement)?.value?.trim();

          await new Promise(resolve => setTimeout(resolve, 200)); // pequeña pausa visual

          if (!input) {
            Swal.showValidationMessage('Debes ingresar la firma para continuar.');
            if (confirmButton) confirmButton.disabled = false;
            return false;
          }

          if (input !== this.firmaAutorizada) {
            Swal.showValidationMessage('Firma incorrecta. Verifica con el encargado.');
            if (confirmButton) confirmButton.disabled = false;
            return false;
          }
          return true;
        },
      });


      if (firmaInput.isConfirmed) {
        const body = { folio: pedido.folio };

        this.pedidosService.cancelarPedido(body).subscribe({
          next: () => {
            Swal.fire({
              icon: 'success',
              title: 'Pedido cancelado correctamente',
              confirmButtonText: 'Aceptar',
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
            this.limpiarFiltroCompleto();
          },
          error: (err) => {
            console.error('Error al cancelar pedido:', err);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: err.error?.mensaje || 'No se pudo cancelar el pedido'
            });
          }
        });
      }
    }

  }

  async surtirPedido(pedido: any) {

    this.pedidoDetalleAbiertoId = null;
    if (pedido.estado === 'entregado') {
      Swal.fire({
        icon: 'success',
        title: 'El pedido ya fue entregado',
        html: `Fecha: ${this.formatearFecha(pedido.fechaEntrega)}<br><br>` +
          `Entregado por: ${pedido.usuarioSurtio.nombre}`,
        confirmButtonText: 'Aceptar',
        allowOutsideClick: false,
        allowEscapeKey: false,
      });
      return;
    }

    if (!pedido.cliente) {
      this.nombreCliente = 'Público general';
      this.idCliente = '';
      this.totalMonedero = 0;
    } else {
      this.nombreCliente = pedido.cliente.nombre;
      this.idCliente = pedido.cliente._id;
      this.totalMonedero = pedido.cliente.totalMonedero;
    }

    const pagoFaltante = await this.mostrarModalPago(pedido.resta, 'Captura del resto', 'Faltante', 'Guardar');
    if (!pagoFaltante) return;

    const body = {
      folio: pedido.folio,
      pagoResta: {
        efectivo: pedido.resta - (pagoFaltante.tarjeta + pagoFaltante.transferencia + pagoFaltante.vale),
        tarjeta: pagoFaltante.tarjeta,
        transferencia: pagoFaltante.transferencia,
        vale: pagoFaltante.vale
      }
    }

    this.pedidosService.surtirPedido(body).subscribe({
      next: async (resp) => {
        await Swal.fire({
          icon: 'success',
          title: 'Éxito',
          html: `<h3>Pedido surtido y registrado correctamente</h3>`,
          confirmButtonText: 'Continuar',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        this.limpiarFiltro();

      },
      error: (err) => {
        console.error('Error al surtir pedido:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err.error?.mensaje || 'No se pudo surtir el pedido'
        });
      }
    });

  }

  async agregarPedido() {
    this.pedidoDetalleAbiertoId = null;
    const cliente = await this.capturarCliente();
    if (cliente === null) return;

    const clienteId = cliente === 'sin-cliente' ? null : cliente._id;

    if (cliente === 'sin-cliente') {
      this.nombreCliente = 'Público general';
      this.totalMonedero = 0;
    } else {
      this.nombreCliente = cliente.nombre;
      this.totalMonedero = cliente.totalMonedero;
    }

    const datosPedido = await this.solicitarDatosPedido();
    if (!datosPedido) return;

    const { descripcion, total, anticipo } = datosPedido;

    const pagoACuenta = await this.mostrarModalPago(anticipo, 'Captura del pago a cuenta', 'Anticipo', 'Imprimir');

    if (!pagoACuenta) return;

    const aCuenta = pagoACuenta.efectivo + pagoACuenta.tarjeta + pagoACuenta.transferencia + pagoACuenta.vale;

    // Si ya hay un folio generado previamente, lo reutilizamos
    const folio = this.folioGenerado || this.generarFolioLocal();
    this.folioGenerado = folio; // guardarlo para futuros intentos

    this.paraGuardar = {
      folio: this.folioGenerado,
      farmacia: this.farmaciaId,
      clienteId,
      usuarioPidio: this.usuarioId,
      descripcion,
      total,
      aCuenta,
      pagoACuenta,
    };

    this.paraImpresion = {
      pedido: this.paraGuardar,
      farmaNombre: this.farmaciaNombre,
      farmaDireccion: this.farmaciaDireccion,
      farmaTelefono: this.farmaciaTelefono,
      userName: this.usuarioNombre,
      client: this.nombreCliente
    }

    this.mostrarTicket = true;

    // 🔄 Forzar render y ejecutar impresión segura
    this.cdr.detectChanges(); // Asegura que <app-pedido-ticket> se renderice

    setTimeout(() => {
      const contenido = document.getElementById('ticketPedido');
      if (contenido) {
        window.print();
        this.mostrarTicket = false;
        this.confirmarImpresion();
      } else {
        console.warn('❌ Ticket aún no está renderizado');
      }
    }, 300);

  }

  confirmarImpresion() {
    Swal.fire({
      icon: 'question',
      title: '¿Se imprimió correctamente el ticket?',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar pedido',
      cancelButtonText: 'No, reintentar'
    }).then(result => {
      if (result.isConfirmed) {
        this.guardarPedido();
      } else {
        Swal.fire('Atención', 'El pedido no fue registrado, tendrá que volver a capturarlo.', 'info');
      }
    });
  }


  guardarPedido() {
    this.pedidosService.agregarPedido(this.paraGuardar).subscribe({
      next: async (resp) => {
        await Swal.fire({
          icon: 'success',
          title: 'Éxito',
          html: `<h3><strong>Pedido agregado correctamente</strong></h3>`,
          confirmButtonText: 'Aceptar',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        this.limpiarFiltroCompleto();
      },
      error: (err) => {
        const mensajeBack = err.error?.mensaje || err.error?.message || 'Falla en el sistema';
        Swal.fire({
          icon: 'error',
          title: 'Error al registrar pedido',
          html: `<p>${mensajeBack}</p>
                  <p><strong>No se registró el pedido</strong></p>`,
          confirmButtonText: 'Continuar',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
      }
    });
  }

  generarFolioLocal() {
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');

    const fechaStr = `${year}${month}`;

    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let cadenaAleatoria = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * caracteres.length);
      cadenaAleatoria += caracteres[randomIndex];
    }

    return `FBPed${fechaStr}-${cadenaAleatoria}`;
  }

  async solicitarDatosPedido(): Promise<{ descripcion: string; total: number; anticipo: number } | null> {
    const { value: formValues } = await Swal.fire({
      title: 'Nuevo pedido',
      html:
        `<p style = "color: blue"><strong>${this.nombreCliente}</strong></p>` +
        `<input id="swal-input-descripcion" class="swal2-input" placeholder="Descripción del pedido">` +
        `<input id="swal-input-total" class="swal2-input" type="number" min="0" placeholder="Total $">` +
        `<input id="swal-input-anticipo" class="swal2-input" type="number" min="0" placeholder="Anticipo $">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false,

      preConfirm: () => {
        const descripcion = (document.getElementById('swal-input-descripcion') as HTMLInputElement).value.trim();
        const totalStr = (document.getElementById('swal-input-total') as HTMLInputElement).value.trim();
        const total = parseFloat(totalStr);
        const anticipoStr = (document.getElementById('swal-input-anticipo') as HTMLInputElement).value.trim();
        const anticipo = parseFloat(anticipoStr);

        if (!descripcion || isNaN(total) || total <= 0 || isNaN(anticipo) || anticipo <= 0) {
          Swal.showValidationMessage('Completa todos los campos correctamente');
          return;
        }

        if (anticipo > total) {
          Swal.showValidationMessage('El anticipo no puede ser mayor que el total a pagar');
          return;
        }

        return { descripcion, total, anticipo };
      }
    });

    return formValues || null;
  }

  async mostrarModalPago(pago: number, tituloStr: string, queSePaga: string, txtAccion: string):
    Promise<{ efectivo: number; tarjeta: number; transferencia: number; vale: number; } | null> {
    const { value: formValues } = await Swal.fire({
      title: tituloStr,
      html:
        `<p style = "color: blue"><strong>${this.nombreCliente}</strong></p>` +
        `<h2><strong>${queSePaga} a pagar:</strong> $${pago}</h2>` +
        `<input id="swal-efectivo" type="number" class="swal2-input" placeholder="Efectivo" min="0">` +
        `<input id="swal-tarjeta" type="number" class="swal2-input" placeholder="Tarjeta" min="0">` +
        `<input id="swal-transferencia" type="number" class="swal2-input" placeholder="Transferencia" min="0">` +
        (this.totalMonedero > 0
          ? `<label style="color: rgb(3, 7, 83); font-weight: bold; font-size: large; display: block; margin-top: 14px;">
                    Tiene en monedero: $${this.totalMonedero.toFixed(2)}
            </label>
            <input id="swal-vale" type="number" class="swal2-input" style="margin-top: 2px; width: 50%"
              placeholder="monedero"
              min="0"
              max="${this.totalMonedero}">`
          : ''),
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: txtAccion,
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false,
      preConfirm: () => {
        const efectivo = parseFloat((document.getElementById('swal-efectivo') as HTMLInputElement).value) || 0;
        const tarjeta = parseFloat((document.getElementById('swal-tarjeta') as HTMLInputElement).value) || 0;
        const transferencia = parseFloat((document.getElementById('swal-transferencia') as HTMLInputElement).value) || 0;
        const inputVale = document.getElementById('swal-vale') as HTMLInputElement | null;
        const vale = inputVale ? parseFloat(inputVale.value) || 0 : 0;
        const pagoElectronico = tarjeta + transferencia + vale;

        if (vale > this.totalMonedero) {
          Swal.showValidationMessage(`El monto del monedero no puede ser mayor a $${this.totalMonedero.toFixed(2)}`);
          return false;
        }

        if (pagoElectronico > pago) {
          Swal.showValidationMessage(`El pago con tarjeta + transferencia + monedero = $${pagoElectronico} no puede exceder de ($${pago})`);
          return;
        }

        if (pagoElectronico === pago && efectivo > 0) {
          Swal.showValidationMessage(`Revisa bien los montos, el pago es excesivo`);
          return;
        }

        if (pagoElectronico + efectivo < pago) {
          Swal.showValidationMessage(`El pago aún no es suficiente`);
          return;
        }
        return {
          efectivo,
          tarjeta,
          transferencia,
          vale
        };
      }
    });

    if (formValues) {
      const totalPagado = formValues.efectivo + formValues.tarjeta + formValues.transferencia + formValues.vale;
      const cambio = totalPagado - pago;
      formValues.efectivo = formValues.efectivo - cambio;

      if (cambio > 0) {
        await Swal.fire({
          icon: 'info',
          html: `<h1><strong>$${cambio.toFixed(2)}</strong></h1>`,
          title: `favor de entregar el cambio`,
          confirmButtonText: 'Aceptar',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
      }
    }

    return formValues || null;
  }

  async capturarCliente(): Promise<any | null> {
    while (true) {
      const result = await Swal.fire({
        title: 'Buscar cliente',
        input: 'text',
        inputLabel: 'Teléfono del cliente (opcional)',
        inputPlaceholder: 'Ej. 5544332211',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Buscar cliente',
        denyButtonText: 'Continuar sin cliente',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        allowEscapeKey: false,
        inputValidator: (value) => {
          const cleaned = value?.trim();
          if (!cleaned) return null; // campo vacío permitido
          if (!/^\d{10}$/.test(cleaned)) {
            return 'El teléfono debe contener exactamente 10 dígitos numéricos.';
          }
          return null;
        }

      });

      if (result.isDismissed) return null;

      if (result.isDenied) return 'sin-cliente';

      const telefonoLimpio = result.value?.trim();
      if (!telefonoLimpio) continue;

      const cliente = await this.buscarClientePorTelefono(telefonoLimpio);

      if (cliente) {
        const confirmar = await Swal.fire({
          title: 'Cliente encontrado',
          html: `<p style = "color: blue"><strong>${cliente.nombre}</strong></p><p>¿Deseas continuar con este cliente?</p>`,
          icon: 'info',
          showCancelButton: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
          confirmButtonText: 'Sí, continuar',
          cancelButtonText: 'Volver a capturar'
        });

        if (confirmar.isConfirmed) return cliente;
      } else {
        const deseaCrear = await this.preguntarCrearCliente(telefonoLimpio);
        if (deseaCrear) {
          const nuevoCliente = await this.mostrarModalAltaCliente(telefonoLimpio);
          if (nuevoCliente) return nuevoCliente;
        }
      }
    }
  }


  async buscarClientePorTelefono(telefono: string): Promise<any | null> {
    try {
      const cliente = await firstValueFrom(this.clienteService.buscarClientePorTelefono(telefono));
      return cliente;
    } catch (error) {
      return null; // Si no existe
    }
  }


  async preguntarCrearCliente(telefono: string): Promise<boolean> {
    const res = await Swal.fire({
      title: 'Cliente no encontrado',
      text: `¿Deseas dar de alta un nuevo cliente con el teléfono ${telefono}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, crear',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false
    });

    return res.isConfirmed;
  }

  async mostrarModalAltaCliente(telefono: string): Promise<any | null> {
    const { value: formValues } = await Swal.fire({
      title: 'Nuevo cliente',
      html:
        `<input id="swal-input-nombre" class="swal2-input" placeholder="Paterno Materno Nombre">` +
        `<input id="swal-input-domicilio" class="swal2-input" placeholder="Domicilio">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false,
      preConfirm: () => {
        const nombre = (document.getElementById('swal-input-nombre') as HTMLInputElement).value.trim();
        const domicilio = (document.getElementById('swal-input-domicilio') as HTMLInputElement).value.trim();

        if (!nombre) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return;
        }

        return { nombre, domicilio };
      }
    });

    if (!formValues) return null;

    const nuevoCliente = {
      nombre: formValues.nombre,
      telefono,
      domicilio: formValues.domicilio
    };

    try {
      const clienteCreado = await firstValueFrom(this.clienteService.crearCliente(nuevoCliente));

      Swal.fire('Éxito', 'Cliente registrado correctamente', 'success');
      return clienteCreado;
    } catch (error) {
      Swal.fire('Error', 'No se pudo registrar el cliente', 'error');
      return null;
    }
  }


  abrirDetallePedido(pedido: any) {
    this.pedidoDetalleAbiertoId = pedido._id;
  }

  cerrarDetallePedido(pedido: any) {
    this.pedidoDetalleAbiertoId = null;
  }

}

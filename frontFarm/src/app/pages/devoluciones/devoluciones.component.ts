import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faMinus, faPlus, faTimes } from '@fortawesome/free-solid-svg-icons';
import { trigger, state, style, transition, animate } from '@angular/animations';

import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
import { ClienteService } from '../../services/cliente.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { DevolucionService } from '../../services/devolucion.service';
import { DevolucionTicketComponent } from '../../impresiones/devolucion-ticket/devolucion-ticket.component';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'app-devoluciones',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule, DevolucionTicketComponent, MatTooltip],
  animations: [
    trigger('expandCollapse', [
      state('true', style({ height: '*', opacity: 1, padding: '*', overflow: 'hidden' })),
      state('false', style({ height: '0px', opacity: 0, padding: '0px', overflow: 'hidden' })),
      transition('true <=> false', animate('300ms ease-in-out'))
    ])
  ],
  templateUrl: './devoluciones.component.html',
  styleUrls: ['./devoluciones.component.css']
})

export class DevolucionesComponent implements OnInit {
  @ViewChild('contenedorTicket', { static: false }) contenedorTicket!: ElementRef;

  ventas: any[] = [];
  esCliente = false;
  pagoVentaEnEfectivo = 0;
  pagoVentaEnElectronico = 0;
  filtroFolio: string = '';
  farmaciaId: string = '';
  farmaciaNombre: string = '';
  farmaciaDireccion: string = '';
  farmaciaTelefono: string = '';
  usuarioId: string = '';
  usuarioRol: string = '';
  usuarioNombre: string = '';
  ventaDetalleAbiertoId: string | null = null;
  idCliente: string | null = null;
  nombreCliente: string | null = null;

  motivosDevolucion: string[] = [
    "Cliente cambió de opinión",
    "Error en la receta médica",
    "Presentación incorrecta",
    "Cantidad errónea entregada",
    "Producto duplicado en la venta",
    "Precio incorrecto en ticket",
    "Producto caducado", "Producto en mal estado", "Producto no surtible", "Error en producto entregado",
  ];

  firmaAutorizada: string = '';

  mostrarTicket: boolean = false;
  paraImpresion: any = null;
  paraGuardar: any = null;

  faTimes = faTimes;

  constructor(
    private devolucionService: DevolucionService,
    private clienteService: ClienteService,
    private FarmaciaService: FarmaciaService,
    private library: FaIconLibrary, private authService: AuthService,) {
    this.library.addIcons(faPlus, faMinus, faTimes); // Registra íconos
  }

  ngOnInit(): void {
    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se ha seleccionado una farmacia activa', 'error');
      return;
    }
    this.farmaciaId = farmacia._id;
    this.farmaciaNombre = farmacia.nombre;
    this.farmaciaDireccion = farmacia.direccion;
    this.farmaciaTelefono = farmacia.telefono;

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

  onFolioChange(folio: string) {
    this.filtroFolio = folio.trim();
    this.idCliente = null;

    // Solo disparamos la búsqueda cuando haya exactamente 6 caracteres alfanuméricos
    if (/^[A-Za-z0-9]{6}$/.test(this.filtroFolio)) {
      this.devolucionService
        .obtenerVentasRecientes(this.farmaciaId, this.filtroFolio)
        .subscribe({
          next: list => {
            // list es un array con 0 ó 1 ventas
            if (list.length === 0) {
              this.ventas = [];
              this.pagoVentaEnEfectivo = 0;
              this.pagoVentaEnElectronico = 0;
              this.esCliente = false;
              return;
            }

            const venta = list[0];
            this.ventas = [venta];

            // Ahora sí puedes leer formaPago SOBRE el objeto venta
            this.pagoVentaEnEfectivo = venta.formaPago.efectivo || 0;
            this.pagoVentaEnElectronico =
              (venta.formaPago.tarjeta || 0)
              + (venta.formaPago.transferencia || 0)
              + (venta.formaPago.vale || 0);

            // determinar si es cliente
            this.esCliente = venta.cliente ? true : false;
            if (this.esCliente) this.idCliente = venta.cliente._id;
          },
          error: err => {
            console.error('Error al buscar por folio:', err);
            this.ventas = [];
            this.pagoVentaEnEfectivo = 0;
            this.pagoVentaEnElectronico = 0;
            this.esCliente = false;
          }
        });
    } else {
      // antes de 6 chars o si borró el input, limpio el arreglo y montos
      this.ventas = [];
      this.pagoVentaEnEfectivo = 0;
      this.pagoVentaEnElectronico = 0;
      this.esCliente = false;
    }
  }

  /** Redondeo amable */
  private toNum = (v: any) => Number(v ?? 0) || 0;
  private round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  // === NUEVO: detecta cómo se pagó la venta y devuelve proporción para monedero ===
  private calcularProporcionVale(venta: any): {
    pagoMonedero: number; pagoEfectivo: number; pagoTarjeta: number; pagoTransferencia: number;
    totalPagado: number; proporcionVale: number;
  } {

    const pagoMonedero = this.toNum(venta?.formaPago.vale);
    const pagoEfectivo = this.toNum(venta?.formaPago.efectivo);
    const pagoTarjeta = this.toNum(venta?.formaPago.tarjeta);
    const pagoTransferencia = this.toNum(venta?.formaPago.transferencia);

    const totalPagado = this.round2(pagoMonedero + pagoEfectivo + pagoTarjeta + pagoTransferencia);

    let proporcionVale = 0;
    if (totalPagado > 0 && pagoMonedero > 0) {
      proporcionVale = Math.max(0, Math.min(1, pagoMonedero / totalPagado));
    }
    return { pagoMonedero, pagoEfectivo, pagoTarjeta, pagoTransferencia, totalPagado, proporcionVale };
  }

  // === NUEVO: estima reverso de monedero regalado por las líneas devueltas ===
  private calcReversoMonedero(venta: any, seleccion: any[]): number {
    // venta.productos: cada renglón debe tener monederoCliente y cantidad
    let egreso = 0;
    for (const dev of seleccion) {
      const idSel = dev.producto?._id ?? dev.producto; // tolerante a forma
      const lineaVenta = (venta.productos || []).find((lv: any) =>
        String(lv.producto?._id ?? lv.producto) === String(idSel)
      );
      if (!lineaVenta) continue;

      const monederoLinea = this.toNum(lineaVenta.monederoCliente);
      const cantVendida = this.toNum(lineaVenta.cantidad);
      const cantDevuelta = this.toNum(dev.cantidadDevuelta);

      if (monederoLinea > 0 && cantVendida > 0 && cantDevuelta > 0) {
        egreso += monederoLinea * (cantDevuelta / cantVendida);
      }
    }
    return this.round2(egreso);
  }

  async confirmarDevolucion(venta: any): Promise<void> {
    // 1) Productos seleccionados con cantidad > 0
    const productosSeleccionados = (venta.productos || []).filter((p: any) =>
      p.seleccionado && this.toNum(p.cantidadDevuelta) > 0
    );

    if (productosSeleccionados.length === 0) {
      await Swal.fire('Aviso', 'Selecciona al menos un producto con cantidad válida', 'info');
      return;
    }

    const sinMotivo = productosSeleccionados.filter((p: any) =>
      p.motivoIndex == null ||
      typeof p.motivoIndex !== 'number' ||
      p.motivoIndex < 0 ||
      !this.motivosDevolucion?.[p.motivoIndex]
    );

    if (sinMotivo.length > 0) {
      const listaNombres = sinMotivo.map((p: any) => p.producto.nombre).join(', ');
      await Swal.fire(
        'Aviso',
        `Debes indicar un motivo de devolución para: ${listaNombres}`,
        'warning'
      );
      return;
    }

    // 2) Total a devolver (precio ya trae descuentos aplicados)
    const totalADevolver = this.round2(
      productosSeleccionados.reduce((acc: number, p: any) =>
        acc + (this.toNum(p.cantidadDevuelta) * this.toNum(p.precio)), 0)
    );

    // 3) Proporción de pago con monedero en la venta original
    const { proporcionVale } = this.calcularProporcionVale(venta);

    // Reembolso proporcional
    const totalDevolverVales = this.round2(totalADevolver * proporcionVale);
    const totalDevolverEfectivo = this.round2(totalADevolver - totalDevolverVales);

    // 4) Cliente (requerido SOLO si hay parte a monedero)
    this.esCliente = !!venta?.cliente;
    if (this.esCliente) {
      this.idCliente = venta.cliente._id;
      this.nombreCliente = venta.cliente.nombre;
    } else {
      this.idCliente = null;
      this.nombreCliente = '';
    }

    if (!this.esCliente && totalDevolverVales > 0) {
      const hayCliente = await this.capturarTelefono();
      if (!hayCliente) return; // cancelado
      this.esCliente = true;
      this.idCliente = hayCliente._id;
      this.nombreCliente = hayCliente.nombre;
    }

    // 5) Estimar impacto de monedero para el ticket (ingreso por vale y reverso de monedero regalado)
    let saldoAntes = 0;
    if (this.esCliente && this.idCliente) {
      try {
        const cli = await firstValueFrom(this.clienteService.getClienteById(this.idCliente));
        saldoAntes = this.toNum(cli?.totalMonedero);
      } catch { saldoAntes = 0; }
    }

    const reversoEstimado = this.calcReversoMonedero(venta, productosSeleccionados);
    const egresoReal = this.round2(Math.min(reversoEstimado, saldoAntes + totalDevolverVales));

    const monederoIngreso = totalDevolverVales; // proporcional al pago con vale
    const monederoReverso = egresoReal;         // no dejamos saldo negativo
    const monederoCambioNeto = this.round2(monederoIngreso - monederoReverso);
    const saldoDespues = this.round2(saldoAntes + monederoCambioNeto);

    // 6) Firma para autorizar
    const firmaInput = await Swal.fire({
      title: 'Autorización requerida',
      html: `
      <p style="color: blue"><strong>Cliente: </strong>${this.nombreCliente || '—'}</p>
      <h4>Debes devolver en total: <strong>$${totalADevolver.toFixed(2)}</strong></h4>
      <h2>Monedero: <strong>$${totalDevolverVales.toFixed(2)}</strong></h2>
      <h2 style="color: red">Efectivo: <strong>$${totalDevolverEfectivo.toFixed(2)}</strong></h2>
      <div id="firma-container"></div>
    `,
      didOpen: () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'firma-autorizada';
        input.placeholder = 'Ingrese la firma';
        input.autocomplete = 'off';
        //input.autocorrect = 'off' as any;
        (input as any).autocapitalize = 'off';
        input.spellcheck = false;
        input.className = 'swal2-input';
        (input.style as any).fontFamily = 'text-security-disc, sans-serif';
        (input.style as any).webkitTextSecurity = 'disc';
        input.name = 'firma_' + Date.now();
        input.focus();
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
        await new Promise(r => setTimeout(r, 200));

        if (!input) {
          Swal.showValidationMessage('Debes ingresar la firma para continuar.');
          if (confirmButton) confirmButton.disabled = false;
          return false;
        }
        try {
          const res = await firstValueFrom(this.FarmaciaService.verificarFirma(this.farmaciaId!, input));
          if (!res.autenticado) {
            Swal.showValidationMessage('Firma incorrecta. Verifica con el encargado.');
            if (confirmButton) confirmButton.disabled = false;
            return false;
          }
          return true;
        } catch (e) {
          console.error('❌ Error al verificar firma:', e);
          Swal.showValidationMessage('Error al verificar la firma. Intenta más tarde.');
          if (confirmButton) confirmButton.disabled = false;
          return false;
        }
      },
    });

    if (!firmaInput.isConfirmed) return;

    // 7) Payload para backend (CON motivos)
    this.paraGuardar = {
      folioVenta: venta.folio,
      farmaciaQueDevuelve: this.farmaciaId,
      idCliente: this.idCliente,
      productosDevueltos: productosSeleccionados.map((p: any) => {
        const motivoDescripcion = this.motivosDevolucion[p.motivoIndex];
        return {
          producto: p.producto._id ?? p.producto,
          cantidad: this.toNum(p.cantidadDevuelta),
          motivoIndex: p.motivoIndex,
          motivo: motivoDescripcion, // requerido por el backend
          precioXCantidad: this.round2(this.toNum(p.cantidadDevuelta) * this.toNum(p.precio)), // requerido por el backend
        };
      }),
    };


    // 8) Estructura para impresión (pre-save, cálculo gemelo al backend)
    this.paraImpresion = {
      devolucion: {
        folioVenta: venta.folio,
        fecha: new Date(),
        productos: productosSeleccionados.map((p: any) => ({
          productoNombre: p.producto?.nombre,
          barrasYNombre: `${(p.producto?.codigoBarras || '').slice(-3)} ${p.producto?.nombre || ''}`,
          cantidad: this.toNum(p.cantidadDevuelta),
          precio: this.toNum(p.precio),
          importe: this.round2(this.toNum(p.cantidadDevuelta) * this.toNum(p.precio)),
          motivo: this.motivosDevolucion[p.motivoIndex],
        })),
      },
      cliente: this.nombreCliente || '—',
      totalADevolver,
      totalDevolverEfectivo,
      totalDevolverVales,

      // Monedero
      monederoIngreso,          // + por devolución (vale devuelto)
      monederoReverso,          // - reverso de monedero regalado
      monederoSaldoAntes: saldoAntes,
      monederoSaldoDespues: saldoDespues,
      monederoCambioNeto,

      usuario: this.usuarioNombre,
      farmacia: {
        nombre: this.farmaciaNombre,
        direccion: this.farmaciaDireccion,
        telefono: this.farmaciaTelefono
      },
    };

    // 9) Mostrar e imprimir
    this.mostrarTicket = true;
    setTimeout(() => {
      if (this.contenedorTicket) {
        this.imprimirTicketReal();
      }
    }, 200);
  }

  imprimirTicketReal() {
    window.print();

    this.mostrarTicket = false;

    Swal.fire({
      icon: 'question',
      title: '¿Se imprimió correctamente el ticket?',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar devolución',
      cancelButtonText: 'No, reintentar'
    }).then(result => {
      if (result.isConfirmed) {
        this.guardarDespuesDeImpresion();
      } else {
        Swal.fire('Atención', 'La devolución no ha sido registrada. Puedes reintentar la impresión.', 'info');
      }
    });
  }

  guardarDespuesDeImpresion() {

    this.devolucionService.registrarDevolucion(this.paraGuardar).subscribe({
      next: (res) => {
        Swal.fire('Éxito', res.mensaje || 'Devolución registrada correctamente', 'success');
        this.ventaDetalleAbiertoId = null;
        this.limpiarFolio();

      },
      error: (err) => {
        Swal.fire('Error', err.error?.mensaje || 'No se pudo registrar la devolución', 'error');
      }
    });
  }

  async capturarTelefono(): Promise<any | null> {
    while (true) {
      const result = await Swal.fire({
        title: 'Buscar al cliente que nos compró',
        input: 'text',
        inputLabel: 'Teléfono del cliente',
        inputPlaceholder: 'Ej. 5544332211',
        showCancelButton: true,
        confirmButtonText: 'Buscar cliente',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        allowEscapeKey: false,
        inputValidator: (value) => {
          const cleaned = value?.trim();
          if (!cleaned) return 'El teléfono es obligatorio';
          if (!/^\d{10}$/.test(cleaned)) {
            return 'El teléfono debe contener exactamente 10 dígitos numéricos.';
          }
          return null;
        }

      });

      if (result.isDismissed) return null;

      const telefonoLimpio = result.value?.trim();
      if (!telefonoLimpio) continue;

      const cliente = await this.buscarClientePorTelefono(telefonoLimpio);

      if (cliente) {
        const confirmar = await Swal.fire({
          title: 'Cliente encontrado',
          html: `<p><strong>${cliente.nombre}</strong></p>
          <p>¿Es el cliente que esta haciendo la devolución?</p>`,
          icon: 'info',
          showCancelButton: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
          confirmButtonText: 'Sí, continuar',
          cancelButtonText: 'Volver a capturar'
        });

        if (confirmar.isConfirmed) return cliente;
      } else {
        const nuevoCliente = await this.altaCliente(telefonoLimpio);
        if (nuevoCliente) return nuevoCliente;
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

  async altaCliente(telefono: string): Promise<any | null> {
    const { value: formValues } = await Swal.fire({
      title: 'Nuevo cliente',
      html:
        `<label><strong>Teléfono: </strong>${telefono}</label>` +
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


  abrirDetalleVenta(venta: any) {
    this.ventaDetalleAbiertoId = venta._id;
    venta.productos.forEach((p: any) => {
      p.seleccionado = false;
      p.cantidadDevuelta = 1;
      p.motivo = null;
    });
  }

  cerrarDetalleVenta(venta: any) {
    this.ventaDetalleAbiertoId = null;
  }

  esPromocionNoReembolsable(tipo: string, categoria: string): boolean {
    //Tipo de promoción
    return tipo?.includes('2x1') || tipo?.includes('3x2') || tipo?.includes('4x3')
      || categoria === 'Recargas' || categoria === 'Servicio Médico';
  }

  limpiarFolio() {
    this.filtroFolio = '';
    this.ventas = [];
    this.mostrarTicket = false;
  }

}





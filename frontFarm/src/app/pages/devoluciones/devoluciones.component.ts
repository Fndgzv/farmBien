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
import { DevolucionService } from '../../services/devolucion.service';
import { DevolucionTicketComponent } from '../../impresiones/devolucion-ticket/devolucion-ticket.component';


@Component({
  selector: 'app-devoluciones',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule, DevolucionTicketComponent],
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

  async confirmarDevolucion(venta: any): Promise<void> {
    // 1) Primero obtén SOLO los productos seleccionados con cantidad > 0
    const productosSeleccionados = venta.productos.filter((p: any) =>
      p.seleccionado && p.cantidadDevuelta > 0
    );

    console.log('productos seleccionados', productosSeleccionados);


    // 2) Si no hay ninguno, avisamos
    if (productosSeleccionados.length === 0) {
      await Swal.fire(
        'Aviso',
        'Selecciona al menos un producto con cantidad válida',
        'info'
      );
      return;
    }

    // 3) Ahora filtro los que NO tengan un índice válido
    const sinMotivo = productosSeleccionados.filter((p: any) =>
      p.motivoIndex == null      // null o undefined
      || typeof p.motivoIndex !== 'number'
      || p.motivoIndex < 0
    );

    if (sinMotivo.length > 0) {
      // muestro los nombres para mayor claridad
      const listaNombres = sinMotivo
        .map((p: any) => p.producto.nombre)
        .join(', ');
      await Swal.fire(
        'Aviso',
        `Debes indicar un motivo de devolución para: ${listaNombres}`,
        'warning'
      );
      return;
    }

    const totalADevolver = productosSeleccionados.reduce(
      (acc: number, p: any) => acc + (p.cantidadDevuelta * p.precio),
      0
    );

    // Total en efectivo: sólo motivos ≥ 6
    let totalDevolverEfectivo = productosSeleccionados.reduce(
      (acc: number, p: any) =>
        p.motivoIndex >= 6
          ? acc + p.cantidadDevuelta * p.precio
          : acc,
      0
    );

    // Total al monedero: sólo motivos < 6
    let totalDevolverVales = productosSeleccionados.reduce(
      (acc: number, p: any) =>
        p.motivoIndex < 6
          ? acc + p.cantidadDevuelta * p.precio
          : acc,
      0
    );

    // determinar si es cliente
    this.esCliente = venta.cliente ? true : false;

    if (this.esCliente) {
      this.idCliente = venta.cliente._id;
      this.nombreCliente = venta.cliente.nombre;

    } else {
      this.idCliente = null;
      this.nombreCliente = '';
    }

    if (!this.esCliente && totalDevolverVales > 0) {

      const hayCliente = await this.capturarTelefono();

      if (!hayCliente) return; // Cancelado o error

      this.esCliente = true;
      this.idCliente = hayCliente._id;
      this.nombreCliente = hayCliente.nombre;
    }

    // Solicitar firma antes de devolver
    let firmaInput = await Swal.fire({
      title: 'Autorización requerida',
      html: `
      <p style = "color: blue"><strong>Cliente: </strong>${this.nombreCliente}</p>
      <h4>Debes devolver en total: <strong>$${totalADevolver.toFixed(2)}</strong></h4>
      <h2>Efectivo: <strong>$${totalDevolverEfectivo.toFixed(2)}</strong></h2>
      <h2>Monedero: <strong>$${totalDevolverVales.toFixed(2)}</strong></h2  >
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

console.log('productos seleccionados', productosSeleccionados);


    if (firmaInput.isConfirmed) {
      this.paraGuardar = {
        folioVenta: venta.folio,
        farmaciaQueDevuelve: this.farmaciaId,
        idCliente: this.idCliente,
        productosDevueltos: productosSeleccionados.map((p: any) => {
          const motivoDescripcion = this.motivosDevolucion[p.motivoIndex];
          return {
            producto: p.producto._id,
            cantidad: p.cantidadDevuelta,
            motivoIndex: p.motivoIndex,
            motivo: motivoDescripcion,
            precioXCantidad: p.cantidadDevuelta * p.precio,
            productoNombre: p.producto.nombre,
            precio: p.precio,
            barrasYNombre: `${p.producto.codigoBarras.slice(-3)} ${p.producto.nombre}`,
          }
        }),
      };

      this.paraImpresion = {
        devolucion: this.paraGuardar,
        cliente: this.nombreCliente,
        totalADevolver: totalADevolver,
        totalDevolverEfectivo: totalDevolverEfectivo,
        totalDevolverVales: totalDevolverVales,
        usuario: this.usuarioNombre,
        farmacia: {
          nombre: this.farmaciaNombre,
          direccion: this.farmaciaDireccion,
          telefono: this.farmaciaTelefono
        },
      }
      this.mostrarTicket = true;

      setTimeout(() => {
        if (this.contenedorTicket) {
          this.imprimirTicketReal();
        }
      }, 200);

    }
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





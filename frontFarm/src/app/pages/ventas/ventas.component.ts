// ventas.component.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { VentasService } from '../../services/ventas.service';
import { ProductoService } from '../../services/producto.service';
import { ClienteService } from '../../services/cliente.service';
import { TicketService } from '../../services/ticket.service';
import { VentaTicketComponent } from '../../impresiones/venta-ticket/venta-ticket.component';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

import Swal from 'sweetalert2';
import { VentaService } from '../../services/venta.service';


@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    VentaTicketComponent
  ],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css'
})


export class VentasComponent implements OnInit {

  telefonoCliente: string = '';
  nombreCliente: string = '';
  cliente: string = '';
  montoMonederoCliente = 0;
  usarMonedero = false;

  hayProducto: boolean = false;

  ventaForm: FormGroup;
  carrito: any[] = [];
  precioEnFarmacia = 0;
  total: number = 0;
  totalArticulos: number = 0;
  totalDescuento: number = 0;
  totalAlmonedero = 0;
  ventasPausadas: any[] = [];
  captionButtomReanudar: string = '';
  montoTarjeta: number = 0;
  montoTransferencia: number = 0;
  montoVale: number = 0;
  efectivoRecibido: number = 0;
  cambio: number = 0;
  inputsHabilitados = false;

  tipoDescuento: string = '';
  cadDesc: string = '';
  ptjeDescuento: number = 0;
  alMonedero = 0;
  productoAplicaMonedero = false;
  aplicaGratis = false;

  ocultarEfectivo: boolean = false;
  ocultaTarjeta: boolean = false;
  ocultaTransferencia: boolean = false;
  ocultaVale: boolean = false;
  mostrarModalPago: boolean = false;

  codigoBarras: string = '';
  busquedaProducto: string = '';
  productosFiltrados: any[] = [];
  productos: any[] = [];

  farmaciaId: string = '';
  farmaciaNombre: string = '';
  farmaciaDireccion: string = '';
  farmaciaTelefono: string = '';

  nombreUs: string = '';

  mostrarModalConsultaPrecio: boolean = false;
  codigoConsulta: string = '';
  productoConsultado: any = null;

  aplicaInapam: boolean = false;
  yaPreguntoInapam: boolean = false;

  fechaIni: Date = new Date();
  fechaFin: Date = new Date();

  faTimes = faTimes;

  ventaParaImpresion: any = null;
  mostrarTicket: boolean = false;
  folioVentaGenerado: string | null = null;

  venta: any = null;
  ventaEnProceso: boolean = false;

  constructor(
    private fb: FormBuilder,
    private ventasService: VentasService,
    private productoService: ProductoService,
    private clienteService: ClienteService,
    private ticketService: TicketService,
    private library: FaIconLibrary,
    private ventaService: VentaService,
  ) {
    this.ventaForm = this.fb.group({
      cliente: [''],
      producto: [''],
      cantidad: [1]
    });
  }

  ngOnInit() {
    this.obtenerProductos();

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (farmacia) {
      this.farmaciaId = farmacia._id;
      this.farmaciaNombre = farmacia.nombre;
      this.farmaciaDireccion = farmacia.direccion;
      this.farmaciaTelefono = farmacia.telefono;
    }

    const storeUs = localStorage.getItem('user_nombre');
    this.nombreUs = storeUs ? storeUs : '';

    this.ventasPausadas = this.ventaService.getVentasPausadas();
  }

  ngOnDestroy(): void {

    if ( this.carrito.length > 0 ) {
      this.pausarVenta();
    }

    if (this.ventasPausadas.length > 0) {
      this.ventaService.setVentasPausadas(this.ventasPausadas);
    } else {
      this.ventaService.limpiarVentasPausadas();
    }

  }


  nombreDiaSemana(dia: number): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[dia] || '';
  }

  buscarCliente() {
    if (this.telefonoCliente.length === 10) {
      this.clienteService.buscarClientePorTelefono(this.telefonoCliente).subscribe({
        next: (cliente: any) => {
          if (cliente && cliente.nombre) {
            this.nombreCliente = cliente.nombre;
            this.ventaForm.controls['cliente'].setValue(cliente._id);
            this.cliente = cliente._id;
            this.montoMonederoCliente = cliente.totalMonedero;
          } else {
            this.mostrarModalCrearCliente();
          }
        },
        error: (error) => {
          console.error("❌ Error al buscar cliente:", error);
          this.mostrarModalCrearCliente();
        }
      });
    }
  }


  mostrarModalCrearCliente() {
    Swal.fire({
      icon: 'warning',
      title: 'Cliente no encontrado',
      text: '¿Desea registrar un nuevo cliente?',
      showCancelButton: true,
      confirmButtonText: 'Crear Cliente',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false
    }).then((result) => {
      if (result.isConfirmed) {
        this.abrirFormularioNuevoCliente();
      } else {
        this.limpiarCliente();
      }
    });
  }


  abrirFormularioNuevoCliente() {
    Swal.fire({
      title: 'Registrar Cliente',
      html:
        '<input id="nuevoNombreCliente" class="swal2-input" style="width: 80%;" placeholder="Ap. paterno Ap. materno Nombre(s)">',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false,
      preConfirm: () => {
        const nombreCliente = (document.getElementById('nuevoNombreCliente') as HTMLInputElement).value;
        if (!nombreCliente) {
          Swal.showValidationMessage('El nombre es obligatorio');
        }
        return { nombre: nombreCliente, telefono: this.telefonoCliente, totalMonedero: this.montoMonederoCliente };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.registrarNuevoCliente(result.value);

      } else if (result.dismiss === Swal.DismissReason.cancel) {
        // 🔹 Si se cancela, limpiar el input de teléfono y nombre
        this.limpiarCliente();
      }
    });
  }

  registrarNuevoCliente(nuevoCliente: any) {
    this.clienteService.crearCliente(nuevoCliente).subscribe({
      next: (response: any) => {
        if (response && response.nombre && response._id) {  // Validar que response tenga datos
          this.nombreCliente = response.nombre;
          this.ventaForm.controls['cliente'].setValue(response._id);
          Swal.fire({
            icon: 'success',
            title: 'Cliente registrado',
            text: `El cliente ${response.nombre} ha sido registrado correctamente.`,
            timer: 1500,
            showConfirmButton: false
          });

          this.cliente = response._id;
          this.montoMonederoCliente = 0;

        } else {
          console.error("⚠️ Respuesta inesperada del backend:", response);
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo registrar el cliente. Respuesta inesperada.',
            confirmButtonText: 'OK',
            allowOutsideClick: false,
            allowEscapeKey: false,
          });
        }
      },
      error: (error) => {
        console.error('❌ Error al registrar cliente:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo registrar el cliente. Inténtelo de nuevo.',
          confirmButtonText: 'OK',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
      }
    });
  }


  limpiarCliente() {
    this.cliente = '';
    this.telefonoCliente = '';
    this.nombreCliente = '';
    this.montoMonederoCliente = 0;
    this.ventaForm.controls['cliente'].setValue('');
  }

  limpiarBarras() {
    this.codigoConsulta = '';
    this.productoConsultado = null;
  }

  limpiarProducto() {
    // Limpiar el valor del input de código de barras
    this.codigoBarras = '';

    // Limpiar el valor del input de búsqueda del producto
    this.busquedaProducto = '';

    // Limpiar el valor del select (devolverlo a su estado inicial)
    const select = document.querySelector('select') as HTMLSelectElement;
    select.value = ''; // Esto restablece la selección

    // Opcionalmente, también podrías reiniciar el array de productos filtrados si lo consideras necesario
    this.productosFiltrados = this.productos; // Esto es solo si quieres restablecer los filtros

    // Llamar al filtro de productos para resetear la visualización
    this.filtrarProductos();
  }


  filtrarProductos() {
    if (!this.busquedaProducto.trim()) {
      this.productosFiltrados = this.productos;
      return;
    }

    const termino = this.busquedaProducto.toLowerCase();
    this.productosFiltrados = this.productos.filter(producto =>
      producto.nombre.toLowerCase().includes(termino)
    );
  }

  seleccionarProducto(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const productoId = selectElement.value;

    const producto = this.productos.find(p => p._id === productoId);

    if (producto) {
      this.existenciaProducto(this.farmaciaId, producto._id, 1).then(() => {
        if (!this.hayProducto) return;

        this.agregarProductoAlCarrito(producto);

      }).catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      });
    }
  }


  pausarVenta() {
    this.ventasPausadas.push({
      cliente: this.ventaForm.value.cliente,
      productos: [...this.carrito],
      telefonoCliente: this.telefonoCliente || null,
      nombreCliente: this.nombreCliente || null,
      montoMonederoCliente: this.montoMonederoCliente || null,
      total: this.total,
      totalArticulos: this.totalArticulos,
      totalDescuento: this.totalDescuento,
      totalAlmonedero: this.totalAlmonedero,
      captionButtomReanudar: this.captionButtomReanudar
    });
    this.carrito = [];
    this.total = 0;
    this.totalArticulos = 0;
    this.totalDescuento = 0;
    this.totalAlmonedero = 0;
    this.telefonoCliente = '';
    this.nombreCliente = '';
    this.montoMonederoCliente = 0;
    this.captionButtomReanudar = '';
  }

  reanudarVenta(index: number) {
    if (this.carrito.length) this.pausarVenta();
    const venta = this.ventasPausadas[index];
    this.ventaForm.patchValue({ cliente: venta.cliente });
    this.carrito = [...venta.productos];
    this.telefonoCliente = venta.telefonoCliente;
    this.nombreCliente = venta.nombreCliente;
    this.montoMonederoCliente = venta.montoMonederoCliente;
    this.total = venta.total;
    this.totalArticulos = venta.totalArticulos;
    this.totalDescuento = venta.totalDescuento;
    this.totalAlmonedero = venta.totalAlmonedero;
    this.captionButtomReanudar = venta.captionButtomReanudar;
    this.ventasPausadas.splice(index, 1);
  }


  obtenerProductos() {
    this.productoService.obtenerProductos().subscribe({
      next: (data) => this.productos = data,
      error: (error) => console.error('Error al obtener productos', error)
    });
  }


  agregarProductoPorCodigo() {
    const producto = this.productos.find(p => p.codigoBarras === this.codigoBarras);
    if (!producto) {
      Swal.fire('Producto no encontrado', 'Verifica el código de barras', 'warning');
    } else {

      this.existenciaProducto(this.farmaciaId, producto._id, 1).then(() => {
        if (!this.hayProducto) {
          this.codigoBarras = '';
          return
        }
        this.agregarProductoAlCarrito(producto);

      }).catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      });
    }
    this.codigoBarras = '';
  }

  async agregarProductoAlCarrito(producto: any) {

    const existente = this.carrito.find(p => p.producto === producto._id && !p.esGratis);
    if (existente) {
      this.existenciaProducto(this.farmaciaId, producto._id, existente.cantidad + 1).then(() => {
        if (!this.hayProducto) return;
        existente.cantidad += 1;
        if (this.esPromocionPorCantidad(existente.tipoDescuento)) {
          this.validarProductoGratis(existente.producto);
        }

        this.calcularTotal();

      }).catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      });

    } else {
      let precioFinal = this.precioEnFarmacia;

      if (this.descuentoMenorA25(producto)) await this.preguntaINAPAM(producto);

      if (producto.categoria === 'Recargas' || producto.categoria === 'Servicio Médico') {
        this.ptjeDescuento = 0;
        this.productoAplicaMonedero = false;
        this.cadDesc = '';
        this.tipoDescuento = '';
      } else this.descuentoYpromo(producto);

      precioFinal *= (100 - this.ptjeDescuento) / 100;

      if (this.productoAplicaMonedero) {
        this.alMonedero = precioFinal * 0.02;
        if (this.tipoDescuento === '') {
          this.tipoDescuento = 'Cliente';
          this.cadDesc = '2%';
        } else {
          this.tipoDescuento = `${this.tipoDescuento}-Cliente`;
          this.cadDesc = `${this.cadDesc} + 2%`;
        }
      }

      this.tipoDescuento = this.limpiarPromocion(this.tipoDescuento)

      if (this.captionButtomReanudar === '') this.captionButtomReanudar = producto.nombre;

      this.carrito.push({
        producto: producto._id,
        codBarras: producto.codigoBarras,
        nombre: producto.nombre,
        cantidad: 1,
        precioFinal,
        precioOriginal: this.precioEnFarmacia,
        tipoDescuento: this.tipoDescuento,
        cadDesc: this.cadDesc,
        alMonedero: this.alMonedero,
        descuentoUnitario: this.precioEnFarmacia - precioFinal,
        iva: producto.iva ? precioFinal * 0.16 : 0,
        cantidadPagada: 1,
        farmacia: this.farmaciaId,
        promoCantidadRequerida: producto.promoCantidadRequerida
      });
    }

    if (this.aplicaGratis) this.validarProductoGratis(producto._id);

    this.calcularTotal();
  }


  limpiarPromocion(promo: string) {
    const str = (promo || '').toString();
    return str.startsWith('-') ? str.slice(1) : str;
  }

  async preguntaINAPAM(producto: any) {
    if (producto.descuentoINAPAM && !this.yaPreguntoInapam) {
      this.yaPreguntoInapam = true;

      const result = await Swal.fire({
        icon: 'question',
        title: '¿Tiene credencial INAPAM vigente?',
        html: `<h4>Me la puede mostrar por favor</h4>
                <p style = "color: green";>Revisa que su credencial de INAPAM:</p>
                <p style = "color: green";> * Pertenezca al cliente</p>
                <p style = "color: green";> * No este vencida</p>`,
        showCancelButton: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'Sí cumple',
        cancelButtonText: 'No cumple'
      });
      // Aquí se asegura que el valor se actualiza solo después de recibir la respuesta
      this.aplicaInapam = result.isConfirmed;
    }
  }


  descuentoMenorA25(producto: any): boolean {
    const fechahoy = new Date();
    const hoy = fechahoy.getDay();  // numero dia 1, 2, ...  Lunes, Martes, ...
    let descuentoXDia = 0;
    switch (hoy) {
      case 0:
        descuentoXDia = producto?.descuentoDomingo ?? null;
        break;
      case 1:
        descuentoXDia = producto?.descuentoLunes ?? null;
        break;
      case 2:
        descuentoXDia = producto?.descuentoMartes ?? null;
        break;
      case 3:
        descuentoXDia = producto?.descuentoMiercoles ?? null;
        break;
      case 4:
        descuentoXDia = producto?.descuentoJueves ?? null;
        break;
      case 5:
        descuentoXDia = producto?.descuentoViernes ?? null;
        break;
      case 6:
        descuentoXDia = producto?.descuentoSabado ?? null;
        break;
      default:
        descuentoXDia = 0;
    }

    if (!descuentoXDia) return true;
    if (descuentoXDia < 25) return true; else return false;

  }

  descuentoYpromo(producto: any) {
    const fechahoy = this.soloFecha(new Date());

    const hoy = fechahoy.getDay();

    this.tipoDescuento = "";
    this.cadDesc = '';
    this.ptjeDescuento = 0;
    this.productoAplicaMonedero = this.cliente.length > 0;
    this.alMonedero = 0;
    this.fechaIni = this.soloFecha(new Date(fechahoy));
    this.fechaFin = this.soloFecha(new Date(fechahoy));
    this.aplicaGratis = true;
    let conDescuento = false;
    if (producto.promoCantidadRequerida &&
      this.soloFecha(new Date(producto.inicioPromoCantidad)) <= this.soloFecha(fechahoy) &&
      this.soloFecha(new Date(producto.finPromoCantidad)) >= this.soloFecha(fechahoy)) {
      conDescuento = false
      this.aplicaGratis = false;
      this.cadDesc = '';
      this.tipoDescuento = `${producto.promoCantidadRequerida}x${producto.promoCantidadRequerida - 1}`
      this.productoAplicaMonedero = false;
      if (producto.promoCantidadRequerida === 2) this.aplicaGratis = true;

      if (this.aplicaInapam && producto.descuentoINAPAM) {
        this.ptjeDescuento = 5;
        this.tipoDescuento += `-INAPAM`;
        this.cadDesc = '5%';
      }

    } else {
      let descuentoXDia = 0;
      let hayDescuentoXDia = false;
      // indagar descuento por día
      switch (hoy) {
        case 1:
          this.fechaIni = producto?.promoLunes?.inicio ?? null;
          this.fechaFin = producto?.promoLunes?.fin ?? null;
          descuentoXDia = producto?.promoLunes?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoLunes?.monedero ?? null;
          break;
        case 2:
          this.fechaIni = producto?.promoMartes?.inicio ?? null;
          this.fechaFin = producto?.promoMartes?.fin ?? null;
          descuentoXDia = producto?.promoMartes?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoMartes?.monedero ?? null;
          break;
        case 3:
          this.fechaIni = producto?.promoMiercoles?.inicio ?? null;
          this.fechaFin = producto?.promoMiercoles?.fin ?? null;
          descuentoXDia = producto?.promoMiercoles?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoMiercoles?.monedero ?? null;
          break;
        case 4:
          this.fechaIni = producto?.promoJueves?.inicio ?? null;
          this.fechaFin = producto?.promoJueves?.fin ?? null;
          descuentoXDia = producto?.promoJueves?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoJueves?.monedero ?? null;
          break;
        case 5:
          this.fechaIni = producto?.promoViernes?.inicio ?? null;
          this.fechaFin = producto?.promoViernes?.fin ?? null;
          descuentoXDia = producto?.promoViernes?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoViernes?.monedero ?? null;
          break;
        case 6:
          this.fechaIni = producto?.promoSabado?.inicio ?? null;
          this.fechaFin = producto?.promoSabado?.fin ?? null;
          descuentoXDia = producto?.promoSabado?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoSadado?.monedero ?? null;
          break;
        case 0:
          this.fechaIni = producto?.promoDomingo?.inicio ?? null;
          this.fechaFin = producto?.promoDomingo?.fin ?? null;
          descuentoXDia = producto?.promoDomingo?.porcentaje ?? null;
          this.productoAplicaMonedero = producto?.promoDomingo?.monedero ?? null;
          break;
      }

      if (!descuentoXDia || descuentoXDia <= 0) {
        this.fechaIni = this.soloFecha(new Date(fechahoy));  // crea un clon de 'hoy'
        this.fechaIni.setDate(this.fechaIni.getDate() + 5); // súmale 5 días
        this.fechaIni = this.soloFecha(this.fechaIni);
      } else {
        hayDescuentoXDia = true;
      }

      if (hayDescuentoXDia && this.soloFecha(new Date(this.fechaIni)) <= fechahoy && this.soloFecha(new Date(this.fechaFin)) >= fechahoy) {
        this.tipoDescuento = this.nombreDiaSemana(hoy);
        this.ptjeDescuento = descuentoXDia;
        this.cadDesc = `${descuentoXDia}%`;
        this.productoAplicaMonedero = this.productoAplicaMonedero && this.cliente.length > 0;
      }

      if (producto.promoDeTemporada &&
        this.soloFecha(new Date(producto.promoDeTemporada.inicio)) <= fechahoy &&
        this.soloFecha(new Date(producto.promoDeTemporada.fin)) >= fechahoy) {
        let ptjeTem = producto.promoDeTemporada.porcentaje;
        if (ptjeTem > this.ptjeDescuento) {
          this.ptjeDescuento = ptjeTem;
          this.tipoDescuento = 'Temporada';
          this.cadDesc = `${ptjeTem}%`;
          this.productoAplicaMonedero = producto.promoDeTemporada.monedero && this.cliente.length > 0;
        }
      }

      if (this.ptjeDescuento > 0) {
        if (this.ptjeDescuento < 25 && this.aplicaInapam && producto.descuentoINAPAM) {
          let pf = this.precioEnFarmacia * (1 - this.ptjeDescuento / 100) * 0.95;
          this.ptjeDescuento = (1 - (pf / this.precioEnFarmacia)) * 100;
          this.tipoDescuento += `-INAPAM`;
          this.cadDesc += `+ 5%`;
          this.productoAplicaMonedero = this.cliente.length > 0;
        }
      } else if (this.aplicaInapam && producto.descuentoINAPAM) {
        this.ptjeDescuento = 5;
        this.tipoDescuento = 'INAPAM';
        this.cadDesc = '5%';
        this.productoAplicaMonedero = this.cliente.length > 0;
      }

      if (this.ptjeDescuento <= 0) this.productoAplicaMonedero = this.cliente.length > 0;

    }

  }


  soloFecha(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }


  eliminarProducto(index: number) {
    const producto = this.carrito[index];
    if (producto.esGratis) {
      this.carrito.splice(index, 1);
    } else {
      const idProducto = producto.producto;
      this.carrito.splice(index, 1);
      const indexGratis = this.carrito.findIndex(p => p.producto === idProducto && p.esGratis);
      if (indexGratis !== -1) {
        this.carrito.splice(indexGratis, 1);
      }
    }
    this.calcularTotal();
  }



  incrementarCantidad(index: number) {
    const producto = this.carrito[index];
    if (!producto.esGratis) {

      this.existenciaProducto(this.farmaciaId, producto.producto, producto.cantidad + 1).then(() => {
        if (!this.hayProducto) return;

        producto.cantidad += 1;

        if (this.esPromocionPorCantidad(producto.tipoDescuento)) {
          this.validarProductoGratis(producto.producto);
        }

        this.calcularTotal();
      }).catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      });

    }
    this.calcularTotal();
  }


  decrementarCantidad(index: number) {
    const producto = this.carrito[index];

    if (producto.cantidad > 1 && !producto.esGratis) {
      producto.cantidad--;

      if (this.esPromocionPorCantidad(producto.tipoDescuento)) {
        this.validarProductoGratis(producto.producto);
      }

      this.calcularTotal();
    } else if (producto.cantidad === 1 && !producto.esGratis) {
      producto.cantidad--;
      this.eliminarProducto(index);
    }
  }

  esPromocionPorCantidad(tipoDescuento: string): boolean {
    const promos = ['2x1', '3x2', '4x3'];
    return promos.some(p => tipoDescuento?.startsWith(p));
  }


  validarProductoGratis(productoId: string) {

    const productoNormal = this.carrito.find(p => p.producto === productoId && !p.esGratis);

    if (!productoNormal || !productoNormal.promoCantidadRequerida) return;

    const totalCantidad = productoNormal.cantidad;
    const promoRequerida = productoNormal.promoCantidadRequerida;
    const yaExisteGratis = this.carrito.some(p => p.producto === productoId && p.esGratis);

    if (totalCantidad >= (promoRequerida - 1)) {

      const cantidadGratis = Math.floor(totalCantidad / (promoRequerida - 1));

      this.existenciaProducto(this.farmaciaId, productoId, totalCantidad + cantidadGratis);
      if (!this.hayProducto) return;

      if (!yaExisteGratis) {
        this.carrito.push({
          producto: productoNormal.producto,
          nombre: productoNormal.nombre,
          cantidad: 1,
          precioFinal: 0,
          precioOriginal: productoNormal.precioOriginal,
          tipoDescuento: `${promoRequerida}x${promoRequerida - 1}-Gratis`,
          cadDesc: `100%`,
          alMonedero: 0,
          descuentoUnitario: productoNormal.precioOriginal,
          iva: 0,
          lote: productoNormal.lote,
          fechaCaducidad: productoNormal.fechaCaducidad,
          cantidadPagada: 0,
          esGratis: true,
          controlesDeshabilitados: true,
          lotes: productoNormal.lotes,
          farmacia: this.farmaciaId
        });
      } else {
        // colocar la cantidad gratis en el renglon correspondiente
        const productoGratis = this.carrito.find(p => p.producto === productoId && p.esGratis);
        if (productoGratis) {
          productoGratis.cantidad = cantidadGratis; // Actualizar la cantidad de producto gratis
          productoGratis.cadDesc = "100%";
          productoGratis.tipoDescuento = `${promoRequerida}x${promoRequerida - 1}-Gratis`;
        }
      }
    } else {
      // eliminar producto gratis si ya no cumple la promo
      const indexGratis = this.carrito.findIndex(p => p.producto === productoId && p.esGratis);
      if (indexGratis !== -1) {
        this.carrito.splice(indexGratis, 1);
      }
    }
  }

  calcularTotal() {
    this.total = this.carrito.reduce((acc, p) => acc + (p.precioFinal * p.cantidad), 0);
    this.total = parseFloat(this.total.toFixed(2));
    this.totalDescuento = this.carrito.reduce((acc, p) => acc + (p.descuentoUnitario * p.cantidad), 0);
    this.totalArticulos = this.carrito.reduce((acc, p) => acc + (p.cantidad), 0);
    this.totalAlmonedero = this.carrito.reduce((acc, p) => acc + (p.alMonedero * p.cantidad), 0);
  }

  cancelarVenta() {
    this.captionButtomReanudar = '';
    this.carrito = [];
    this.total = 0;
    this.totalArticulos = 0;
    this.totalDescuento = 0;
    this.totalAlmonedero = 0;
    this.aplicaInapam = false;
    this.yaPreguntoInapam = false;

    this.folioVentaGenerado = null;

    this.limpiarCliente();

    this.montoTarjeta = 0;
    this.montoTransferencia = 0;
    this.montoVale = 0;
    this.efectivoRecibido = 0;
    this.cambio = 0;
  }

  abrirModalPago() {
    Swal.fire({
      icon: 'question',
      title: '¿DESEA AGREGAR ALGO MÁS?',
      showCancelButton: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      confirmButtonText: 'NO, ir a cobrar',
      cancelButtonText: 'SI, agregar más productos'
    }).then(result => {
      if (result.isConfirmed) {
        this.usarMonedero = false;
        this.mostrarModalPago = true;
        this.montoTarjeta = 0;
        this.montoTransferencia = 0;
        this.montoVale = 0;
        this.efectivoRecibido = 0;
        this.cambio = 0;
        this.calcularTotal();
      }
    });

  }

  calculaCambio() {
    if (this.montoTarjeta + this.montoTransferencia + this.montoVale >= this.total) {
      this.efectivoRecibido = 0;
      this.cambio = 0;
    } else if (this.total - this.efectivoRecibido - this.montoTarjeta - this.montoTransferencia - this.montoVale < 0) {
      this.cambio = this.efectivoRecibido - (this.total - (this.montoTarjeta + this.montoTransferencia + this.montoVale));
    } else this.cambio = 0
  }

  pagoTarjeta() {
    if (this.montoTarjeta >= this.total) {
      this.montoTarjeta = this.total;
      this.efectivoRecibido = 0;
      this.montoTransferencia = 0;
      this.montoVale = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else if (this.montoTarjeta + this.montoTransferencia + this.montoVale >= this.total) {
      this.montoTarjeta = this.total - this.montoTransferencia - this.montoVale;
      this.efectivoRecibido = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else {
      this.ocultarEfectivo = false;
      this.ocultaTransferencia = false;
      this.ocultaVale = false;
      this.ocultaTarjeta = false;
      this.calculaCambio();
    }
  }

  pagoTransferencia() {
    if (this.montoTransferencia >= this.total) {
      this.montoTransferencia = this.total;
      this.efectivoRecibido = 0;
      this.montoTarjeta = 0;
      this.montoVale = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else if (this.montoTarjeta + this.montoTransferencia + this.montoVale >= this.total) {
      this.montoTransferencia = this.total - this.montoTarjeta - this.montoVale;
      this.efectivoRecibido = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else {
      this.ocultarEfectivo = false;
      this.ocultaTarjeta = false;
      this.ocultaTransferencia = false;
      this.ocultaVale = false;
      this.calculaCambio();
    }
  }

  pagoVale() {
    if (this.montoVale >= this.total) {
      this.montoVale = this.total;
      this.efectivoRecibido = 0;
      this.montoTarjeta = 0;
      this.montoTransferencia = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else if (this.montoTarjeta + this.montoTransferencia + this.montoVale >= this.total) {
      this.montoVale = this.total - this.montoTarjeta - this.montoTransferencia;
      this.efectivoRecibido = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else {
      this.ocultarEfectivo = false;
      this.ocultaTarjeta = false;
      this.ocultaTransferencia = false;
      this.ocultaVale = false;
      this.calculaCambio();
    }
  }

  onToggleMonedero() {
    if (this.usarMonedero) {
      // 3a) Si tiene suficiente para cubrir TODO el total de la venta:
      if (this.montoMonederoCliente >= this.total) {
        this.montoVale = this.total;
      } else {
        // 3b) Si su monedero es menor que el total, sólo puede usar lo que tenga
        this.montoVale = this.montoMonederoCliente;
      }
    } else {
      // si desmarcó el checkbox, simplemente regresamos montoVale a cero
      this.habilitarInputs();
    }
    this.pagoVale();
  }

  // Lógica para habilitar inputs y limpiar valores
  habilitarInputs() {
    this.ocultarEfectivo = false;
    this.ocultaTarjeta = false;
    this.ocultaTransferencia = false;
    this.ocultaVale = false;
    this.inputsHabilitados = false;
    this.montoVale = 0;
    this.usarMonedero = false;
  }

  inhabilitarInputs() {
    this.ocultarEfectivo = true;
    this.ocultaTarjeta = true;
    this.ocultaTransferencia = true;
    this.ocultaVale = true;
    this.inputsHabilitados = true;
  }

  // Cancelar y regresar a venta activa
  cancelarPago() {
    this.efectivoRecibido = 0;
    this.montoTarjeta = 0;
    this.montoTransferencia = 0;
    this.montoVale = 0;
    this.cambio = 0;
    this.mostrarModalPago = false;
  }

  // Finalizar venta e imprimir ticket
  finalizarVenta() {
    this.efectivoRecibido = Math.max(0, this.efectivoRecibido);
    this.montoTarjeta = Math.max(0, this.montoTarjeta);
    this.montoTransferencia = Math.max(0, this.montoTransferencia);
    this.montoVale = Math.max(0, this.montoVale);

    const totalPagado = this.efectivoRecibido + this.montoTarjeta + this.montoTransferencia + this.montoVale;
    const pagosDigitales = this.montoTarjeta + this.montoTransferencia + this.montoVale;

    if (pagosDigitales > this.total) {
      Swal.fire('Error', 'El monto con tarjeta, transferencia y/o monedero no puede exceder el total.', 'error');
      return;
    }

    if (totalPagado < this.total) {
      Swal.fire('Pago incompleto', 'La suma de pagos no cubre el total de la venta.', 'warning');
      return;
    }

    // Si ya hay un folio generado previamente, lo reutilizamos 
    const folio = this.folioVentaGenerado || this.generarFolioLocal();
    this.folioVentaGenerado = folio; // guardarlo para futuros intentos

    const productos = this.carrito.map(p => ({
      producto: p.producto,
      nombre: p.nombre,
      barrasYNombre: `${p.codBarras.slice(-3)} ${p.nombre}`,
      cantidad: p.cantidad,
      precio: p.precioFinal,
      totalRen: p.precioFinal * p.cantidad,
      precioOriginal: p.precioOriginal,
      iva: p.iva,
      tipoDescuento: p.tipoDescuento,
      descuento: (p.descuentoUnitario ?? 0) * p.cantidad,
      cadenaDescuento: p.cadDesc ?? '',
      monederoCliente: (p.almonedero ?? 0) * p.cantidad,
    }));

    this.ventaParaImpresion = {
      folio: this.folioVentaGenerado,
      cliente: this.nombreCliente,
      farmacia: {
        nombre: this.farmaciaNombre,
        direccion: this.farmaciaDireccion,
        telefono: this.farmaciaTelefono
      },
      productos,
      cantidadProductos: this.totalArticulos,
      total: this.total,
      totalDescuento: this.totalDescuento,
      totalMonederoCliente: this.totalAlmonedero,
      formaPago: {
        efectivo: this.total - this.montoTarjeta - this.montoTransferencia - this.montoVale,
        tarjeta: this.montoTarjeta,
        transferencia: this.montoTransferencia,
        vale: this.montoVale
      },
      AsiQuedaMonedero: this.montoMonederoCliente - this.montoVale + this.totalAlmonedero,
      fecha: new Date().toISOString(),
      usuario: this.nombreUs
    };

    this.mostrarTicket = true;

    setTimeout(() => {
      window.print();
      this.mostrarTicket = false;

      Swal.fire({
        icon: 'question',
        title: '¿Se imprimió correctamente el ticket?',
        showCancelButton: true,
        confirmButtonText: 'Sí, guardar venta',
        cancelButtonText: 'No, reintentar'
      }).then(result => {
        if (result.isConfirmed) {
          this.guardarVentaDespuesDeImpresion(folio);
        } else {
          Swal.fire('Atención', 'La venta no ha sido registrada. Puedes reintentar la impresión.', 'info');
        }
      });
    }, 100);


  }

  // Limpiar datos de venta para nueva transacción
  limpiarVenta() {
    this.carrito = [];
    this.total = 0;
    this.totalArticulos = 0;
    this.totalDescuento = 0;
    this.totalAlmonedero = 0;
    this.limpiarCliente();
    this.montoTarjeta = 0;
    this.montoTransferencia = 0;
    this.montoVale = 0;
    this.efectivoRecibido = 0;
    this.cambio = 0;
    this.aplicaInapam = false;
    this.yaPreguntoInapam = false;
  }


  generarFolioLocal(): string {
    const fecha = new Date();

    // Parte 1: Letras FB
    const baseFolio = 'FB';

    // Parte 2: Fecha en formato aaaammdd
    const fechaFormateada = fecha.toISOString().split('T')[0].replace(/-/g, '');

    // Parte 3: Cadena aleatoria de 6 caracteres con letras mayúsculas, minúsculas y números
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let cadenaAleatoria = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * caracteres.length);
      cadenaAleatoria += caracteres[randomIndex];
    }

    // Unir todas las partes
    const folio = `${baseFolio}${fechaFormateada}-${cadenaAleatoria}`;

    return folio;
  }

  guardarVentaDespuesDeImpresion(folio: string) {
    const productosPayload = this.carrito.map(p => ({
      producto: p.producto,
      cantidad: p.cantidad,
      precio: p.precioFinal,
      totalRen: p.precioFinal * p.cantidad,
      precioOriginal: p.precioOriginal,
      iva: p.iva,
      tipoDescuento: p.tipoDescuento,
      descuento: (p.descuentoUnitario ?? 0) * p.cantidad
    }));

    const venta = {
      folio: folio,
      clienteId: this.cliente,
      productos: productosPayload,
      aplicaInapam: this.aplicaInapam,
      efectivo: this.total - this.montoTarjeta - this.montoTransferencia - this.montoVale,
      tarjeta: this.montoTarjeta,
      transferencia: this.montoTransferencia,
      importeVale: this.montoVale,
      farmacia: this.farmaciaId
    };

    this.ventasService.crearVenta(venta).subscribe({
      next: (response) => {
        Swal.fire('Venta Registrada', 'Venta finalizada correctamente', 'success');
        this.folioVentaGenerado = null;
        this.limpiarVenta();
        this.mostrarModalPago = false;
      },
      error: (error) => {
        const mensaje = error?.error?.mensaje || 'Error al finalizar la venta';
        Swal.fire('Error', mensaje, 'error');

        const esErrorDeVale = mensaje.includes('**');
        if (!esErrorDeVale) {
          this.mostrarModalPago = false;
          this.limpiarVenta();
        }
      }
    });
  }

  abrirModalConsultaPrecio() {
    this.mostrarModalConsultaPrecio = true;
    this.codigoConsulta = '';
    this.productoConsultado = null;
  }

  cerrarModalConsultaPrecio() {
    this.mostrarModalConsultaPrecio = false;
  }

  consultarPrecio() {
    if (!this.codigoConsulta.trim()) return;

    this.productoService.consultarPrecioPorCodigo(this.farmaciaId, this.codigoConsulta).subscribe({
      next: (data) => {
        if (!data || data.nombre === undefined) {
          this.productoConsultado = {
            nombre: "Producto no encontrado",
            precioNormal: null,

            promo1: null,
            precioLunes: null,
            lunesMasInapam: null,

            promo2: null,
            precioMartes: null,
            martesMasInapam: null,

            promo3: null,
            precioMiercoles: null,
            miercolesMasInapam: null,

            promo4: null,
            precioJueves: null,
            juevesMasInapam: null,

            promo5: null,
            precioViernes: null,
            viernesMasInapam: null,

            promo6: null,
            precioSabado: null,
            sabadoMasInapam: null,

            promo0: null,
            precioDomingo: null,
            domingoMasInapam: null,

            promo: null,
            precioConDescuento: null,
            precioInapam: null,
            precioDescuentoMasInapam: null,

            promoCliente: null
          };
        } else {
          this.productoConsultado = {
            nombre: data.nombre,
            precioNormal: data.precioNormal,
            promo1: data.promo1,
            precioLunes: data.precioLunes,
            lunesMasInapam: data.lunesMasInapam,

            promo2: data.promo2,
            precioMartes: data.precioMartes,
            martesMasInapam: data.martesMasInapam,

            promo3: data.promo3,
            precioMiercoles: data.precioMiercoles,
            miercolesMasInapam: data.miercolesMasInapam,

            promo4: data.promo4,
            precioJueves: data.precioJueves,
            juevesMasInapam: data.juevesMasInapam,

            promo5: data.promo5,
            precioViernes: data.precioViernes,
            viernesMasInapam: data.viernesMasInapam,

            promo6: data.promo6,
            precioSabado: data.precioSabado,
            sabadoMasInapam: data.sabadoMasInapam,

            promo0: data.promo0,
            precioDomingo: data.precioDomingo,
            domingoMasInapam: data.domingoMasInapam,

            promo: data.promo,
            precioConDescuento: data.precioConDescuento,
            precioInapam: data.precioInapam,
            precioDescuentoMasInapam: data.precioDescuentoMasInapam,

            promoCliente: data.promoCliente

          };
        }
      },
      error: (error) => {
        console.error("❌ Error al consultar precio:", error);
        this.productoConsultado = {
          nombre: "Error en la consulta",
          precioNormal: null,
          promo: null,
          precioFinal: null
        };
      }
    });

  }

  existenciaProducto(idFarmacia: string, idProducto: string, cantRequerida: number): Promise<void> {
    // obtiene la existencia de un producto en esa farmacia
    return new Promise((resolve, reject) => {
      this.productoService.existenciaPorFarmaciaYProducto(idFarmacia, idProducto).subscribe({
        next: (data) => {
          this.precioEnFarmacia = data.precioVenta;

          if (data.existencia >= cantRequerida) {
            this.hayProducto = true;
            resolve(); // Resolvemos la promesa cuando se determina que hay producto suficiente
          } else {
            Swal.fire({
              icon: 'error',
              title: 'No hay suficiente existencia',
              html: `Producto: ${data.nombre}<br>Cantidad disponible: ${data.existencia}<br>Cantidad requerida: ${cantRequerida}`,
              confirmButtonText: 'OK',
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
            this.hayProducto = false;
            resolve(); // Resolvemos la promesa para que no quede en espera
          }
        },
        error: (error) => {
          console.error('Error al obtener la existencia del producto:', error);
          this.hayProducto = false;
          reject(error); // Rechazamos la promesa en caso de error
        }
      });
    });
  }

}

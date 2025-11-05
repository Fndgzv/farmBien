// ventas.component.ts
import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, HostListener, ChangeDetectorRef, NgZone } from '@angular/core';
import { distinctUntilChanged, debounceTime, startWith, map, catchError, switchMap, tap } from 'rxjs/operators';
import { of, Observable, from, mergeMap, firstValueFrom } from 'rxjs';
import { FormBuilder, FormGroup, FormControl, FormsModule, ReactiveFormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { VentasService } from '../../services/ventas.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { ProductoService } from '../../services/producto.service';
import { ClienteService } from '../../services/cliente.service';
import { VentaTicketComponent } from '../../impresiones/venta-ticket/venta-ticket.component';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

import Swal from 'sweetalert2';
import { VentaService } from '../../services/venta.service';
import { MatTooltip } from '@angular/material/tooltip';

import { resolveLogoForPrint, logoToDataUrlSafe, whenDomStable, printNodeInIframe } from '../../shared/utils/print-utils';


@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    VentaTicketComponent,
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule,
    MatTooltip
  ],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.css'
})
export class VentasComponent implements OnInit, AfterViewInit {
  @ViewChild('codigoBarrasRef') codigoBarrasRef!: ElementRef<HTMLInputElement>;
  @ViewChild('efectivoRecibidoRef') efectivoRecibidoRef!: ElementRef<HTMLInputElement>; // <-- para enfocar el primer input del modal

  @ViewChild('cliTrigger', { read: MatAutocompleteTrigger })
  cliTrigger?: MatAutocompleteTrigger;

  opcionesClientes: any[] = [];

  private pendingFocusEfectivo = false;
  barcodeFocusTimer: any = null;

  telefonoCliente: string = '';
  nombreCliente: string = '';
  cliente: string = '';
  montoMonederoCliente = 0;
  usarMonedero = false;

  hayProducto: boolean = false;

  ventaForm: FormGroup;
  carrito: any[] = [];
  precioEnFarmacia = 0;
  ubicacionEnFarmacia = '';
  total: number = 0;
  totalArticulos: number = 0;
  totalDescuento: number = 0;
  totalAlmonedero = 0;
  ventasPausadas: any[] = [];
  captionButtomReanudar: string = '';

  // Inputs de pago como null para que se vean “vacíos”
  efectivoRecibido: number | null = null;
  montoTarjeta: number | null = null;
  montoTransferencia: number | null = null;
  montoVale: number | null = null;
  cambio: number = 0;
  inputsHabilitados = false;

  tipoDescuento: string = '';
  cadDesc: string = '';
  ptjeDescuento: number = 0;
  alMonedero = 0;
  productoAplicaMonedero = false;
  hayCliente = false;
  aplicaGratis = false;

  ocultarEfectivo: boolean = false;
  ocultaTarjeta: boolean = false;
  ocultaTransferencia: boolean = false;
  ocultaVale: boolean = false;
  mostrarModalPago: boolean = false;

  codigoBarras: string = '';
  busquedaProducto: string = '';
  busquedaPorCodigo: string = '';
  productosFiltrados: any[] = [];
  productosFiltradosPorCodigo: any[] = [];
  productos: any[] = [];
  clientes: any[] = [];

  farmaciaId: string = '';
  farmaciaNombre: string = '';
  farmaciaTitulo1: string = '';
  farmaciaTitulo2: string = '';
  farmaciaImagen: string = '';
  farmaciaDireccion: string = '';
  farmaciaTelefono: string = '';

  nombreUs: string = '';

  mostrarModalConsultaPrecio: boolean = false;
  codigoConsulta: string = '';
  productoConsultado: any = null;

  // Campos para los filtros del modal de consulta
  busquedaConsultaCodigo: string = '';
  busquedaConsultaNombre: string = '';
  productosConsultaFiltradosPorCodigo: any[] = [];
  productosConsultaFiltradosPorNombre: any[] = [];

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

  clienteNombreCtrl = new FormControl<string | any>({ value: '', disabled: false });
  filteredClientes$: Observable<any[]> = of([]);

  placeholderSrc = 'assets/images/farmBienIcon.png';
  thumbs: Record<string, string> = {};
  consultaEncontrado = false;
  consultaImgUrl: string = this.placeholderSrc;

  public isPrinting = false;

  /* Configuración de la escala de la imagen en los renglones de la tabla */
  thumbScale = 2; scales = [1, 1.5, 2, 2.5, 3, 3.5, 4];
  /* Fin configuracion de la escala de imágenes */

  onScaleChange(v: number) {
    this.thumbScale = v;
    localStorage.setItem('thumbScale', String(v));
  }

  private resetConsulta(): void {
    this.codigoConsulta = '';
    this.busquedaConsultaCodigo = '';
    this.busquedaConsultaNombre = '';

    this.productoConsultado = null;
    this.productosConsultaFiltradosPorCodigo = [];
    this.productosConsultaFiltradosPorNombre = [];

    this.consultaEncontrado = false;      // <- re-muestra los buscadores
    this.consultaImgUrl = this.placeholderSrc; // <- limpia preview
  }

  // Helpers numéricos
  private toNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  get pagoEfectivo() { return this.toNum(this.efectivoRecibido); }
  get pagoTarjeta1() { return this.toNum(this.montoTarjeta); }
  get pagoTransferencia1() { return this.toNum(this.montoTransferencia); }
  get pagoVale1() { return this.toNum(this.montoVale); }
  get totalPagado() { return this.round2(this.pagoEfectivo + this.pagoTarjeta1 + this.pagoTransferencia1 + this.pagoVale1); }

  trackByProducto = (_: number, p: any) => p.producto;

  constructor(
    private fb: FormBuilder,
    private ventasService: VentasService,
    private productoService: ProductoService,
    private clienteService: ClienteService,
    private ventaService: VentaService,
    private farmaciaService: FarmaciaService,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.ventaForm = this.fb.group({
      cliente: [''],
      producto: [''],
      cantidad: [1]
    });
  }

  ngAfterViewInit(): void {
    // foco inicial al entrar al componente
    this.focusBarcode();
    // 👇 Fuerza abrir el panel mientras el usuario escribe
    this.clienteNombreCtrl.valueChanges
      .pipe(
        startWith(this.clienteNombreCtrl.value ?? ''),
        debounceTime(50),
        distinctUntilChanged()
      )
      .subscribe(() => {
        if (this.clienteNombreCtrl.enabled && this.cliTrigger) {
          if (!this.cliTrigger.panelOpen) this.cliTrigger.openPanel();
          else this.cliTrigger.updatePosition();
        }
      });
  }

  ngAfterViewChecked() {
    // si está pendiente, enfoca cuando el DOM del modal ya existe
    if (this.pendingFocusEfectivo && this.mostrarModalPago) {
      this.pendingFocusEfectivo = false;
      // pequeño delay para evitar colisión con animaciones/estilos
      setTimeout(() => this.efectivoRecibidoRef?.nativeElement?.focus(), 0);
    }
  }

  async ngOnInit() {
    this.obtenerProductos();
    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (farmacia) {
      this.farmaciaId = farmacia._id;
      this.farmaciaNombre = farmacia.nombre;
      this.farmaciaDireccion = farmacia.direccion;
      this.farmaciaTelefono = farmacia.telefono;
    }

    await this.cargarFarmacia()

    const storeUs = localStorage.getItem('user_nombre');
    this.nombreUs = storeUs ? storeUs : '';

    this.ventasPausadas = this.ventaService.getVentasPausadas();

    this.filteredClientes$ = this.clienteNombreCtrl.valueChanges.pipe(
      map(v => (typeof v === 'string' ? v : (v?.nombre ?? '')) as string),
      map(txt => txt.trim()),
      debounceTime(200),
      distinctUntilChanged(),
      switchMap(term => {
        if (term.length < 2) return of([]);
        // 👇 mandamos el texto tal cual lo escribe el usuario
        return this.clienteService.buscarClientesPorNombre(term, 20).pipe(
          map(resp => resp?.rows ?? []),
          catchError(() => of([]))
        );
      })
    );


    this.clienteNombreCtrl.valueChanges.pipe(
      startWith(''),
      debounceTime(120),
      distinctUntilChanged(),
      map(v => typeof v === 'string' ? v : (v?.nombre ?? ''))
    ).subscribe(txt => {
      this.opcionesClientes = this.filtraClientesLocal(txt);
      // abre/cierra panel solo del campo cliente
      if ((txt || '').length && this.opcionesClientes.length && !this.clienteNombreCtrl.disabled) {
        this.cliTrigger?.openPanel();
      } else {
        this.cliTrigger?.closePanel();
      }
    });

  }

  onSubmitVenta(form: NgForm) {
    this.finalizarVenta();
  }

  onEnterSubmit(ev: KeyboardEvent | Event) {
    // si quieres usar Enter desde el form:
    const e = ev as KeyboardEvent;
    e.preventDefault();
    (e as any).stopPropagation?.();
    if (this.mostrarModalPago && this.totalPagado >= this.total) {
      this.finalizarVenta();
    }
  }


  async cargarFarmacia() {
    try {
      const f = await firstValueFrom(this.farmaciaService.getFarmaciaById(this.farmaciaId));
      this.farmaciaTitulo1 = f?.titulo1 ?? '';
      this.farmaciaTitulo2 = f?.titulo2 ?? '';
      this.farmaciaImagen = f?.imagen ?? '';
    } catch (e) {
      console.error('Error farmacia:', e);
    }
  }

  onClienteInput() {
    const v = this.clienteNombreCtrl.value;
    if (typeof v === 'string' && v.trim()) {
      this.cliTrigger?.openPanel();
    }
  }

  displayCliente = (c: any) => (c?.nombre || '');

  onClienteSelected(c: any) {
    if (!c) return;
    this.cliente = c._id;
    this.nombreCliente = c.nombre || '';
    this.telefonoCliente = c.telefono || '';
    this.montoMonederoCliente = Number(c.totalMonedero || 0);
    this.recalcularRenglones();
    this.hayCliente = true;
    this.focusBarcode(60);
  }

  ngOnDestroy(): void {
    if (this.carrito.length > 0) {
      this.pausarVenta();
    }
  }

  private clearBarcodeFocusTimer() {
    if (this.barcodeFocusTimer) {
      clearTimeout(this.barcodeFocusTimer);
      this.barcodeFocusTimer = null;
    }
  }

  private focusBarcode(delay = 60) {
    this.clearBarcodeFocusTimer();
    this.barcodeFocusTimer = setTimeout(() => {
      const ae = document.activeElement as HTMLElement | null;
      const typing =
        !!ae && (ae.tagName === 'INPUT' || ae.getAttribute('contenteditable') === 'true');
      if (!this.mostrarModalPago && !typing && this.codigoBarrasRef) {
        this.codigoBarrasRef.nativeElement.focus();
      }
      this.barcodeFocusTimer = null;
    }, delay);
  }

  nombreDiaSemana(dia: number): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[dia] || '';
  }

  abrirAutoClientes() {
    if (this.clienteNombreCtrl.enabled) {
      // abre en el siguiente ciclo para que Angular tenga el DOM listo
      setTimeout(() => this.cliTrigger?.openPanel(), 0);
    }
  }

  async VerSiPreguntaINAPAM() {
    if (this.aplicaInapam) {
      const result = await Swal.fire({
        icon: 'question',
        title: 'Credencial INAPAM vigente',
        html: `<h4>Me puede mostrar su credencial de INAPAM por favor?</h4>
                <p style="color: green;">Revisa que su credencial de INAPAM:</p>
                <p style="color: green;"> * Pertenezca al cliente</p>
                <p style="color: green;"> * No este vencida</p>`,
        showCancelButton: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'Sí cumple',
        cancelButtonText: 'No cumple',
        focusCancel: true,
      });
      this.aplicaInapam = result.isConfirmed;
    }
    this.recalcularRenglones();
  }

  async recalcularRenglones() {

    if (this.carrito.length > 0) {

      for (let i = 0; i < this.carrito.length; i++) {
        // buscar caracteristicas del producto en almacen
        const productoE = this.productos.find(pe => pe._id === this.carrito[i].producto);

        if (this.descuentoMenorA25(this.carrito[i].producto)) await this.preguntaINAPAM(productoE);

        if (productoE.categoria === 'Recargas' || productoE.categoria === 'Servicio Médico') {
          this.ptjeDescuento = 0;
          this.productoAplicaMonedero = false;
          this.cadDesc = '';
          this.tipoDescuento = '';
          this.alMonedero = 0;
        } else this.descuentoYpromo(productoE);

        let precioFinal = this.carrito[i].precioOriginal;

        precioFinal *= (100 - this.ptjeDescuento) / 100;

        if (this.productoAplicaMonedero) {
          this.alMonedero = precioFinal * 0.02;
          if (this.tipoDescuento === '') {
            this.tipoDescuento = 'Cliente';
            this.cadDesc = '2% Moned.';
          } else {
            this.tipoDescuento = `${this.tipoDescuento}-Cliente`;
            this.cadDesc = `${this.cadDesc} + 2% Moned.`;
          }
        }

        this.tipoDescuento = this.limpiarPromocion(this.tipoDescuento);

        if (this.captionButtomReanudar === '') this.captionButtomReanudar = productoE.nombre;

        this.carrito[i].precioFinal = precioFinal;
        this.carrito[i].tipoDescuento = this.tipoDescuento;
        this.carrito[i].cadDesc = this.cadDesc;
        this.carrito[i].alMonedero = this.alMonedero
        this.carrito[i].descuentoUnitario = this.carrito[i].precioOriginal - precioFinal;
        this.carrito[i].iva = productoE.iva ? precioFinal * 0.16 : 0;

        if (this.aplicaGratis) this.validarProductoGratis(productoE._id);

      };
      this.calcularTotal();
    }
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
            this.hayCliente = true;

            this.recalcularRenglones();

            this.focusBarcode();
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
        this.focusBarcode();
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
        this.limpiarCliente();
        this.focusBarcode();
      }
    });
  }

  registrarNuevoCliente(nuevoCliente: any) {
    this.clienteService.crearCliente(nuevoCliente).subscribe({
      next: (resp: any) => {
        // normalización de formatos comunes
        const candidato =
          resp?.cliente ??
          resp?.data ??
          resp?.result ??
          resp; // si ya viene plano

        const _id = candidato?._id ?? resp?.insertedId ?? resp?._id ?? null;
        const nombre = candidato?.nombre ?? nuevoCliente?.nombre ?? '';
        const telefono = candidato?.telefono ?? nuevoCliente?.telefono ?? '';
        const totalMonedero = Number(candidato?.totalMonedero ?? 0);

        if (_id && nombre) {
          // setea estado de la venta
          this.nombreCliente = nombre;
          this.ventaForm.controls['cliente'].setValue(_id);
          this.hayCliente = true;
          this.cliente = _id;
          this.montoMonederoCliente = totalMonedero;

          // opcional: refrescar/inyectar en cache local para el autocomplete
          try {
            const yaExiste = (this.clientes || []).some((c: any) => c?._id === _id);
            if (!yaExiste) {
              this.clientes = [
                { _id, nombre, telefono, totalMonedero: totalMonedero },
                ...(this.clientes || [])
              ];
            }
          } catch { }

          this.recalcularRenglones();

          Swal.fire({
            icon: 'success',
            title: 'Cliente registrado',
            text: `El cliente ${nombre} ha sido registrado correctamente.`,
            timer: 1500,
            showConfirmButton: false
          });
        } else {
          // No logramos extraer el id/nombre: log y aviso amable
          console.error('⚠️ Respuesta inesperada del backend:', resp);
          Swal.fire({
            icon: 'warning',
            title: 'Cliente registrado',
            text: 'Se registró el cliente, pero no pude leer su ID desde la respuesta.',
            confirmButtonText: 'OK',
            allowOutsideClick: false,
            allowEscapeKey: false
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
    this.hayCliente = false;
    this.ventaForm.controls['cliente'].setValue('');
    this.clienteNombreCtrl.setValue(''); // limpia el autocompleto
    this.recalcularRenglones();
    this.focusBarcode(60);
  }

  limpiarBarras() {
    this.resetConsulta();
  }

  limpiarProducto() {
    this.codigoBarras = '';
    this.busquedaProducto = '';
    this.busquedaPorCodigo = '';
    this.productosFiltrados = this.productos;
    this.productosFiltradosPorCodigo = this.productos;
    this.filtrarProductos();
    this.filtrarPorCodigo();
    this.focusBarcode();
  }

  filtrarProductos() {
    if (this.busquedaProducto) {
      this.productosFiltrados = this.productos.filter(producto =>
        producto.nombre.toLowerCase().includes(this.busquedaProducto.toLowerCase())
      );
    } else {
      this.productosFiltrados = this.productos;
    }
  }

  filtrarPorCodigo() {
    if (this.busquedaPorCodigo) {
      this.productosFiltradosPorCodigo = this.productos.filter(producto =>
        producto.codigoBarras.includes(this.busquedaPorCodigo)
      );
    } else {
      this.productosFiltradosPorCodigo = this.productos;
    }
  }

  seleccionarProducto(event: any) {
    const productoId = event.option.value;
    const producto = this.productos.find(p => p._id === productoId);
    if (producto) {
      this.busquedaProducto = producto.nombre;
      this.existenciaProducto(this.farmaciaId, producto._id, 1).then(() => {
        if (!this.hayProducto) return;
        this.agregarProductoAlCarrito(producto);
      }).catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      });
    }
    this.focusBarcode(100);
  }

  seleccionarPorCodigo(event: any) {
    const productoId = event.option.value;
    const productoC = this.productos.find(p => p._id === productoId);
    if (productoC) {
      this.busquedaPorCodigo = productoC.codigoBarras;
      this.existenciaProducto(this.farmaciaId, productoC._id, 1).then(() => {
        if (!this.hayProducto) return;
        this.agregarProductoAlCarrito(productoC);
      }).catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      });
    }
    this.focusBarcode(100);
  }

  displayNombre = (id?: string): string => {
    const p = this.productos.find(x => x._id === id);
    return p ? p.nombre : '';
  };

  displayCodigo = (id?: string): string => {
    const p = this.productos.find(x => x._id === id);
    return p ? `${p.codigoBarras} — ${p.nombre}` : '';
  };

  pausarVenta() {
    this.ventasPausadas.push({
      _uid: 'p' + Date.now() + Math.random().toString(36).slice(2, 8),
      cliente: this.ventaForm.value.cliente,
      productos: [...this.carrito],
      clienteId: this.cliente || null,
      telefonoCliente: this.telefonoCliente || null,
      nombreCliente: this.nombreCliente || null,
      montoMonederoCliente: this.montoMonederoCliente || null,
      total: this.total,
      totalArticulos: this.totalArticulos,
      totalDescuento: this.totalDescuento,
      totalAlmonedero: this.totalAlmonedero,
      aplicaInapam: this.aplicaInapam,
      captionButtomReanudar: this.captionButtomReanudar || '(venta pausada)'
    });
    this.ventaService.setVentasPausadas(this.ventasPausadas);

    this.ventasPausadas = this.ventaService.getVentasPausadas() || [];

    this.carrito = [];
    this.total = 0;
    this.totalArticulos = 0;
    this.totalDescuento = 0;
    this.totalAlmonedero = 0;
    this.telefonoCliente = '';
    this.nombreCliente = '';
    this.montoMonederoCliente = 0;
    this.aplicaInapam = false;
    this.cliente = '';
    this.captionButtomReanudar = '';
    this.ventaForm.controls['cliente'].setValue('');
    this.hayCliente = false;

    // this.syncClienteCtrlDisabled();
    this.focusBarcode();
  }

  reanudarVenta(index: number) {
    if (this.carrito.length) this.pausarVenta();
    const venta = this.ventasPausadas[index];
    this.ventaForm.patchValue({ cliente: venta.cliente });
    this.carrito = [...venta.productos];
    this.telefonoCliente = venta.telefonoCliente;
    this.nombreCliente = venta.nombreCliente;
    this.montoMonederoCliente = venta.montoMonederoCliente;
    this.cliente = venta.clienteId;
    this.total = venta.total;
    this.totalArticulos = venta.totalArticulos;
    this.totalDescuento = venta.totalDescuento;
    this.totalAlmonedero = venta.totalAlmonedero;
    this.aplicaInapam = venta.aplicaInapam;
    this.captionButtomReanudar = venta.captionButtomReanudar;
    this.ventasPausadas.splice(index, 1);
    this.ventaService.setVentasPausadas(this.ventasPausadas);
    //this.syncClienteCtrlDisabled();
    this.focusBarcode(0);
  }

  obtenerProductos() {
    this.productoService.obtenerProductos().subscribe({
      next: (data) => {
        this.productos = data || [];
        this.thumbs = {}; // id -> objectURL

        // Inicial en placeholder
        for (const prod of this.productos) {
          this.thumbs[prod._id] = this.placeholderSrc;
        }

        // Cargar con auth solo los que tienen imagen
        from(this.productos).pipe(
          mergeMap(prod => {
            if (!prod?.imagen) return of(null);
            return this.productoService.getImagenObjectUrl(prod._id).pipe(
              tap(url => { this.thumbs[prod._id] = url || this.placeholderSrc; }),
              catchError(() => of(null))
            );
          }, 6)
        ).subscribe();
      },
      error: (error) => console.error('Error al obtener productos', error)
    });
  }

  onThumbError(ev: Event, p: any) {
    const img = ev.target as HTMLImageElement;
    if (img && img.src !== this.placeholderSrc) img.src = this.placeholderSrc;

  }

  agregarProductoPorCodigo() {
    if (this.codigoBarras.length === 0 && this.carrito.length > 0) {
      this.abrirModalPago();
    } else {
      const producto = this.productos.find(p => p.codigoBarras === this.codigoBarras);
      if (!producto) {
        Swal.fire({
          icon: 'warning',
          title: 'Producto no encontrado',
          text: 'Verifica el código de barras',
          timer: 1300,
          showConfirmButton: false,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false
        }).then(() => this.focusBarcode(60)); // vuelve el foco al lector si quieres

      } else {

        this.existenciaProducto(this.farmaciaId, producto._id, 1).then(() => {
          if (!this.hayProducto) {
            this.codigoBarras = '';
            return;
          }
          this.agregarProductoAlCarrito(producto);
        }).catch((error: any) => {
          console.error('Error en existenciaProducto: ', error);
        });
      }
      this.codigoBarras = '';
      this.focusBarcode();
    }
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
        this.alMonedero = 0;
      } else this.descuentoYpromo(producto);

      precioFinal *= (100 - this.ptjeDescuento) / 100;

      if (this.productoAplicaMonedero) {
        this.alMonedero = precioFinal * 0.02;
        if (this.tipoDescuento === '') {
          this.tipoDescuento = 'Cliente';
          this.cadDesc = '2% Moned.';
        } else {
          this.tipoDescuento = `${this.tipoDescuento}-Cliente`;
          this.cadDesc = `${this.cadDesc} + 2% Moned.`;
        }
      }

      this.tipoDescuento = this.limpiarPromocion(this.tipoDescuento);

      if (this.captionButtomReanudar === '') this.captionButtomReanudar = producto.nombre;

      const nuevo = {
        producto: producto._id,
        codBarras: producto.codigoBarras,
        nombre: producto.nombre,
        cantidad: 1,
        precioFinal,
        precioOriginal: this.precioEnFarmacia,
        ubicacionEnFarmacia: this.ubicacionEnFarmacia,
        tipoDescuento: this.tipoDescuento,
        cadDesc: this.cadDesc,
        alMonedero: this.alMonedero,
        descuentoUnitario: this.precioEnFarmacia - precioFinal,
        iva: producto.iva ? precioFinal * 0.16 : 0,
        cantidadPagada: 1,
        farmacia: this.farmaciaId,
        promoCantidadRequerida: producto.promoCantidadRequerida,
      };
      this.carrito = [nuevo, ...this.carrito];
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
                <p style="color: green;">Revisa que su credencial de INAPAM:</p>
                <p style="color: green;"> * Pertenezca al cliente</p>
                <p style="color: green;"> * No este vencida</p>`,
        showCancelButton: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'Sí cumple',
        cancelButtonText: 'No cumple',
        focusCancel: true,
        /*         didOpen: (popup) => {
                  popup.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      //Swal.getCancelButton()?.click(); // 👈 fuerza “No cumple”
                    }
                  });
                } */
      });
      this.aplicaInapam = result.isConfirmed;
    }
  }

  descuentoMenorA25(producto: any): boolean {
    const fechahoy = new Date();
    const hoy = fechahoy.getDay();
    let descuentoXDia = 0;
    switch (hoy) {
      case 0: descuentoXDia = producto?.descuentoDomingo ?? null; break;
      case 1: descuentoXDia = producto?.descuentoLunes ?? null; break;
      case 2: descuentoXDia = producto?.descuentoMartes ?? null; break;
      case 3: descuentoXDia = producto?.descuentoMiercoles ?? null; break;
      case 4: descuentoXDia = producto?.descuentoJueves ?? null; break;
      case 5: descuentoXDia = producto?.descuentoViernes ?? null; break;
      case 6: descuentoXDia = producto?.descuentoSabado ?? null; break;
      default: descuentoXDia = 0;
    }
    if (!descuentoXDia) return true;
    return descuentoXDia < 25;
  }

  descuentoYpromo(producto: any) {
    const fechahoy = this.soloFecha(new Date());
    const hoy = fechahoy.getDay();

    this.tipoDescuento = "";
    this.cadDesc = '';
    this.ptjeDescuento = 0;

    this.productoAplicaMonedero = this.hayCliente;

    this.alMonedero = 0;
    this.fechaIni = this.soloFecha(new Date(fechahoy));
    this.fechaFin = this.soloFecha(new Date(fechahoy));
    this.aplicaGratis = true;

    if (producto.promoCantidadRequerida &&
      this.soloFecha(new Date(producto.inicioPromoCantidad)) <= this.soloFecha(fechahoy) &&
      this.soloFecha(new Date(producto.finPromoCantidad)) >= this.soloFecha(fechahoy)) {
      this.aplicaGratis = false;
      this.cadDesc = '';
      this.tipoDescuento = `${producto.promoCantidadRequerida}x${producto.promoCantidadRequerida - 1}`;
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
      switch (hoy) {
        case 1: this.fechaIni = producto?.promoLunes?.inicio ?? null; this.fechaFin = producto?.promoLunes?.fin ?? null; descuentoXDia = producto?.promoLunes?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoLunes?.monedero ?? null; break;
        case 2: this.fechaIni = producto?.promoMartes?.inicio ?? null; this.fechaFin = producto?.promoMartes?.fin ?? null; descuentoXDia = producto?.promoMartes?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoMartes?.monedero ?? null; break;
        case 3: this.fechaIni = producto?.promoMiercoles?.inicio ?? null; this.fechaFin = producto?.promoMiercoles?.fin ?? null; descuentoXDia = producto?.promoMiercoles?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoMiercoles?.monedero ?? null; break;
        case 4: this.fechaIni = producto?.promoJueves?.inicio ?? null; this.fechaFin = producto?.promoJueves?.fin ?? null; descuentoXDia = producto?.promoJueves?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoJueves?.monedero ?? null; break;
        case 5: this.fechaIni = producto?.promoViernes?.inicio ?? null; this.fechaFin = producto?.promoViernes?.fin ?? null; descuentoXDia = producto?.promoViernes?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoViernes?.monedero ?? null; break;
        case 6: this.fechaIni = producto?.promoSabado?.inicio ?? null; this.fechaFin = producto?.promoSabado?.fin ?? null; descuentoXDia = producto?.promoSabado?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoSadado?.monedero ?? null; break;
        case 0: this.fechaIni = producto?.promoDomingo?.inicio ?? null; this.fechaFin = producto?.promoDomingo?.fin ?? null; descuentoXDia = producto?.promoDomingo?.porcentaje ?? null; this.productoAplicaMonedero = producto?.promoDomingo?.monedero ?? null; break;
      }
      if (!descuentoXDia || descuentoXDia <= 0) {
        this.fechaIni = this.soloFecha(new Date(fechahoy));
        this.fechaIni.setDate(this.fechaIni.getDate() + 5);
        this.fechaIni = this.soloFecha(this.fechaIni);
      } else {
        hayDescuentoXDia = true;
      }

      if (hayDescuentoXDia && this.soloFecha(new Date(this.fechaIni)) <= fechahoy && this.soloFecha(new Date(this.fechaFin)) >= fechahoy) {
        this.tipoDescuento = this.nombreDiaSemana(hoy);
        this.ptjeDescuento = descuentoXDia;
        this.cadDesc = `${descuentoXDia}%`;
        this.productoAplicaMonedero = this.productoAplicaMonedero && this.hayCliente;
      }

      if (producto.promoDeTemporada &&
        this.soloFecha(new Date(producto.promoDeTemporada.inicio)) <= fechahoy &&
        this.soloFecha(new Date(producto.promoDeTemporada.fin)) >= fechahoy) {
        let ptjeTem = producto.promoDeTemporada.porcentaje;
        if (ptjeTem > this.ptjeDescuento) {
          this.ptjeDescuento = ptjeTem;
          this.tipoDescuento = 'Temporada';
          this.cadDesc = `${ptjeTem}%`;
          this.productoAplicaMonedero = producto.promoDeTemporada.monedero && this.hayCliente;
        }
      }

      if (this.ptjeDescuento > 0) {
        if (this.ptjeDescuento < 25 && this.aplicaInapam && producto.descuentoINAPAM) {
          let pf = this.precioEnFarmacia * (1 - this.ptjeDescuento / 100) * 0.95;
          this.ptjeDescuento = (1 - (pf / this.precioEnFarmacia)) * 100;
          this.tipoDescuento += `-INAPAM`;
          this.cadDesc += `+ 5%`;
          this.productoAplicaMonedero = this.hayCliente;
        }
      } else if (this.aplicaInapam && producto.descuentoINAPAM) {
        this.ptjeDescuento = 5;
        this.tipoDescuento = 'INAPAM';
        this.cadDesc = '5%';
        this.productoAplicaMonedero = this.hayCliente;
      }

      if (this.ptjeDescuento <= 0) this.productoAplicaMonedero = this.hayCliente;
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
    //this.syncClienteCtrlDisabled();
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
    //this.syncClienteCtrlDisabled();
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
    //this.syncClienteCtrlDisabled();
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
        const productoGratis = this.carrito.find(p => p.producto === productoId && p.esGratis);
        if (productoGratis) {
          productoGratis.cantidad = cantidadGratis;
          productoGratis.cadDesc = "100%";
          productoGratis.tipoDescuento = `${promoRequerida}x${promoRequerida - 1}-Gratis`;
        }
      }
    } else {
      const indexGratis = this.carrito.findIndex(p => p.producto === productoId && p.esGratis);
      if (indexGratis !== -1) {
        this.carrito.splice(indexGratis, 1);
      }
    }
  }

  calcularTotal() {
    this.total = this.round2(this.carrito.reduce((acc, p) => acc + (p.precioFinal * p.cantidad), 0));
    this.totalDescuento = this.round2(this.carrito.reduce((acc, p) => acc + (p.descuentoUnitario * p.cantidad), 0));
    this.totalArticulos = this.carrito.reduce((acc, p) => acc + (p.cantidad), 0);
    this.totalAlmonedero = this.round2(this.carrito.reduce((acc, p) => acc + (p.alMonedero * p.cantidad), 0));
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
    this.hayCliente = false;
    //this.syncClienteCtrlDisabled();
  }

  abrirModalPago() {
    Swal.fire({
      icon: 'question',
      title: '¿DESEA AGREGAR ALGO MÁS?',
      showCancelButton: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      focusConfirm: true,
      confirmButtonText: 'NO, ir a cobrar',
      cancelButtonText: 'SI, agregar más productos'
    }).then(result => {
      if (result.isConfirmed) {
        this.usarMonedero = false;
        this.mostrarModalPago = true;

        // limpiar valores a null para que los inputs se vean "vacíos"
        this.montoTarjeta = null;
        this.montoTransferencia = null;
        this.montoVale = null;
        this.efectivoRecibido = null;
        this.cambio = 0;

        // 1) Evita focos pendientes al lector
        this.clearBarcodeFocusTimer();
        this.codigoBarrasRef?.nativeElement?.blur();

        // 2) Enfoca efectivo tras render
        this.cdRef.detectChanges();
        setTimeout(() => this.efectivoRecibidoRef?.nativeElement?.focus(), 0);
        this.calcularTotal();
      }
    });
  }

  calculaCambio() {

    if (this.pagoTarjeta1 + this.pagoTransferencia1 + this.pagoVale1 >= this.total) {
      this.efectivoRecibido = 0;
      this.cambio = 0;
    } else if (this.total - this.pagoEfectivo - this.pagoTarjeta1 - this.pagoTransferencia1 - this.pagoVale1 < 0) {
      this.cambio = this.pagoEfectivo - (this.total - (this.pagoTarjeta1 + this.pagoTransferencia1 + this.pagoVale1));
    } else this.cambio = 0
  }

  pagoTarjeta() {
    if (this.pagoTarjeta1 >= this.total) {
      this.montoTarjeta = this.total;
      this.efectivoRecibido = 0;
      this.montoTransferencia = 0;
      this.montoVale = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else if (this.pagoTarjeta1 + this.pagoTransferencia1 + this.pagoVale1 >= this.total) {
      this.montoTarjeta = this.total - this.pagoTransferencia1 - this.pagoVale1;
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
    if (this.pagoTransferencia1 >= this.total) {
      this.montoTransferencia = this.total;
      this.efectivoRecibido = 0;
      this.montoTarjeta = 0;
      this.montoVale = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else if (this.pagoTarjeta1 + this.pagoTransferencia1 + this.pagoVale1 >= this.total) {
      this.montoTransferencia = this.total - this.pagoTarjeta1 - this.pagoVale1;
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
    if (this.pagoVale1 >= this.total) {
      this.montoVale = this.total;
      this.efectivoRecibido = 0;
      this.montoTarjeta = 0;
      this.montoTransferencia = 0;
      this.cambio = 0;
      this.inhabilitarInputs();
    } else if (this.pagoTarjeta1 + this.pagoTransferencia1 + this.pagoVale1 >= this.total) {
      this.montoVale = this.total - this.pagoTarjeta1 - this.pagoTransferencia1;
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
      if (this.montoMonederoCliente >= this.total) {
        this.montoVale = this.total;
      } else {
        this.montoVale = this.montoMonederoCliente;
      }
    } else {
      this.habilitarInputs();
    }
    this.pagoVale();
  }

  habilitarInputs() {
    this.ocultarEfectivo = false;
    this.ocultaTarjeta = false;
    this.ocultaTransferencia = false;
    this.ocultaVale = false;
    this.inputsHabilitados = false;
    this.montoVale = 0;
    this.usarMonedero = false;
    this.calculaCambio();
  }

  inhabilitarInputs() {
    this.ocultarEfectivo = true;
    this.ocultaTarjeta = true;
    this.ocultaTransferencia = true;
    this.ocultaVale = true;
    this.inputsHabilitados = true;
  }

  cancelarPago() {
    this.efectivoRecibido = 0;
    this.montoTarjeta = 0;
    this.montoTransferencia = 0;
    this.montoVale = 0;
    this.cambio = 0;
    this.mostrarModalPago = false;
    //this.syncClienteCtrlDisabled();
    this.focusBarcode(50);
  }

  async finalizarVenta() {
    if (this.isPrinting) return;

    // --- Validaciones/pagos (idénticas a las tuyas) ---
    this.efectivoRecibido = Math.max(0, this.pagoEfectivo);
    this.montoTarjeta = Math.max(0, this.pagoTarjeta1);
    this.montoTransferencia = Math.max(0, this.pagoTransferencia1);
    this.montoVale = Math.max(0, this.pagoVale1);
    this.cambio = Math.max(0, this.cambio);

    const totalPagado = this.efectivoRecibido + this.montoTarjeta + this.montoTransferencia + this.montoVale;
    const pagosDigitales = this.montoTarjeta + this.montoTransferencia + this.montoVale;

    if (pagosDigitales > this.total) { await Swal.fire('Error', 'El monto con tarjeta, transferencia y/o monedero no puede exceder el total.', 'error'); return; }
    if (totalPagado < this.total) { await Swal.fire('Pago incompleto', 'La suma de pagos no cubre el total de la venta.', 'warning'); return; }

    const folio = this.folioVentaGenerado || this.generarFolioLocal();
    this.folioVentaGenerado = folio;

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

    // Logo embebido
    const absLogo = resolveLogoForPrint(this.farmaciaImagen);
    let logoData = '';
    try { logoData = await logoToDataUrlSafe(absLogo); } catch { logoData = absLogo; }

    const farma = {
      nombre: this.farmaciaNombre,
      direccion: this.farmaciaDireccion,
      telefono: this.farmaciaTelefono,
      titulo1: this.farmaciaTitulo1,
      titulo2: this.farmaciaTitulo2,
      imagen: logoData,
    };

    this.ventaParaImpresion = {
      folio,
      cliente: this.nombreCliente,
      farmacia: farma,
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
      elcambio: this.cambio,
      fecha: new Date().toISOString(),
      usuario: this.nombreUs
    };

    // --- Mostrar el ticket en el DOM (para clonar) ---
    this.mostrarModalPago = false;
    this.mostrarTicket = true;
    this.cdRef.detectChanges();
    await whenDomStable();

    this.isPrinting = true;

try {
  const el = document.getElementById('ticketVenta');
  if (!el) throw new Error('ticketVenta no encontrado');

  // 🔥 Imprime SOLO el ticket en un iframe oculto (sin tocar tu @media print global)
  await printNodeInIframe(el);

  // Guardar **después** de imprimir
  this.guardarVentaDespuesDeImpresion(this.folioVentaGenerado!);
} finally {
  this.mostrarTicket = false;
  this.isPrinting = false;
  this.cdRef.detectChanges();
}
  }


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

  private yyyymmddLocal(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  generarFolioLocal(): string {
    const baseFolio = 'FB';
    const fechaFormateada = this.yyyymmddLocal();
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let cadenaAleatoria = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * caracteres.length);
      cadenaAleatoria += caracteres[randomIndex];
    }
    return `${baseFolio}${fechaFormateada}-${cadenaAleatoria}`;
  }

  guardarVentaDespuesDeImpresion(folio: string) {
    const productosPayload = this.carrito.map(p => ({
      producto: p.producto,
      cantidad: p.cantidad,
      precio: p.precioFinal,
      totalRen: p.precioFinal * p.cantidad,
      precioOriginal: p.precioOriginal,
      iva: p.iva,
      /* monederoCliente: p.alMonedero * p.cantidad, */
      tipoDescuento: p.tipoDescuento,
      descuento: (p.descuentoUnitario ?? 0) * p.cantidad
    }));

    const venta = {
      folio: folio,
      clienteId: this.cliente,
      productos: productosPayload,
      aplicaInapam: this.aplicaInapam,
      efectivo: this.total - this.pagoTarjeta1 - this.pagoTransferencia1 - this.pagoVale1,
      tarjeta: this.montoTarjeta,
      transferencia: this.montoTransferencia,
      importeVale: this.pagoVale1,
      farmacia: this.farmaciaId,
      totaMonederoCliente: this.totalAlmonedero
    };

    this.ventasService.crearVenta(venta).subscribe({
      next: () => {
        this.folioVentaGenerado = null;
        this.limpiarVenta();
        this.mostrarModalPago = false;

        this.ventaService.setVentasPausadas(this.ventasPausadas);

        Swal.fire({
          icon: 'success',
          title: 'Venta Registrada',
          text: 'Venta finalizada correctamente',
          timer: 1300,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
          didClose: () => {
            //this.syncClienteCtrlDisabled();
            this.focusBarcode(50);
          }
        });
      },
      error: (error) => {
        const mensaje = error?.error?.mensaje || 'Error al finalizar la venta';
        Swal.fire('Error', mensaje, 'error');
        const esErrorDeVale = mensaje.includes('**');
        if (!esErrorDeVale) {
          this.mostrarModalPago = false;
          this.limpiarVenta(); //this.syncClienteCtrlDisabled();
          setTimeout(() => this.focusBarcode(50), 0);
        }
      }
    });

  }

  abrirModalConsultaPrecio() {

    this.mostrarModalConsultaPrecio = true;
    this.codigoConsulta = '';
    this.productoConsultado = null;
    this.limpiarProducto();
  }

  cerrarModalConsultaPrecio() {
    this.resetConsulta();
    this.mostrarModalConsultaPrecio = false;
    this.focusBarcode(50);
  }

  consultarPrecio() {
    if (!this.codigoConsulta.trim()) return;

    this.productoService.consultarPrecioPorCodigo(this.farmaciaId, this.codigoConsulta).subscribe({
      next: (data) => {
        // ¿Se encontró?
        const ok = !!data && data.nombre !== undefined;

        this.consultaEncontrado = ok;

        if (!ok) {
          // Puedes mostrar mensaje o dejar null; así NO ocultas los inputs
          this.productoConsultado = null;
          this.consultaImgUrl = this.placeholderSrc;
          return;
        }

        if (!data || data.nombre === undefined) {
          this.productoConsultado = {
            nombre: "Producto no encontrado",
            precioNormal: null,
            promo1: null, precioLunes: null, lunesMasInapam: null,
            promo2: null, precioMartes: null, martesMasInapam: null,
            promo3: null, precioMiercoles: null, miercolesMasInapam: null,
            promo4: null, precioJueves: null, juevesMasInapam: null,
            promo5: null, precioViernes: null, viernesMasInapam: null,
            promo6: null, precioSabado: null, sabadoMasInapam: null,
            promo0: null, precioDomingo: null, domingoMasInapam: null,
            promo: null, precioConDescuento: null, precioInapam: null, precioDescuentoMasInapam: null,
            promoCliente: null,
            ubicacionEnFarmacia: null,
          };
        } else {

          this.productoConsultado = {
            nombre: data.nombre,
            precioNormal: data.precioNormal,
            promo1: data.promo1, precioLunes: data.precioLunes, lunesMasInapam: data.lunesMasInapam,
            promo2: data.promo2, precioMartes: data.precioMartes, martesMasInapam: data.martesMasInapam,
            promo3: data.promo3, precioMiercoles: data.precioMiercoles, miercolesMasInapam: data.miercolesMasInapam,
            promo4: data.promo4, precioJueves: data.precioJueves, juevesMasInapam: data.juevesMasInapam,
            promo5: data.promo5, precioViernes: data.precioViernes, viernesMasInapam: data.viernesMasInapam,
            promo6: data.promo6, precioSabado: data.precioSabado, sabadoMasInapam: data.sabadoMasInapam,
            promo0: data.promo0, precioDomingo: data.precioDomingo, domingoMasInapam: data.domingoMasInapam,
            promo: data.promo, precioConDescuento: data.precioConDescuento, precioInapam: data.precioInapam, precioDescuentoMasInapam: data.precioDescuentoMasInapam,
            promoCliente: data.promoCliente,
            ubicacionEnFarmacia: data.ubicacionEnFarmacia
          };
        }

        // Resolver URL de imagen:
        // 1) si el back devuelve _id úsalo; si no, busca por código de barras localmente
        const prodId = data._id
          ?? (this.productos || []).find(pr => pr.codigoBarras === this.codigoConsulta)?._id;

        this.consultaImgUrl = prodId
          ? this.productoService.obtenerImagenProductoUrl(prodId)
          : this.placeholderSrc;

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

  // Llamar cuando se teclea en "Buscar Cód. barras"
  filtrarConsultaPorCodigo() {
    const t = (this.busquedaConsultaCodigo || '').trim();
    if (!t) {
      this.productosConsultaFiltradosPorCodigo = [];
      return;
    }
    this.productosConsultaFiltradosPorCodigo = this.productos.filter(p =>
      (p.codigoBarras || '').includes(t)
    );
  }

  // Llamar cuando se teclea en "Buscar producto por nombre"
  filtrarConsultaPorNombre() {
    const t = (this.busquedaConsultaNombre || '').trim().toLowerCase();
    if (!t) {
      this.productosConsultaFiltradosPorNombre = [];
      return;
    }
    this.productosConsultaFiltradosPorNombre = this.productos.filter(p =>
      (p.nombre || '').toLowerCase().includes(t)
    );
  }

  // Al seleccionar en el autocomplete por CÓDIGO
  onSelectConsultaCodigo(event: any) {
    const codigo = event.option.value as string;        // viene de [value]="p.codigoBarras"
    this.codigoConsulta = codigo;                       // lo usamos para consultar
    // opcional: dejar bonito el input con "código — nombre"
    this.busquedaConsultaCodigo = event.option.viewValue;
    this.consultarPrecio();
  }

  // Al seleccionar en el autocomplete por NOMBRE
  onSelectConsultaNombre(event: any) {
    const codigo = event.option.value as string;        // también pusimos el código como [value]
    this.codigoConsulta = codigo;
    // dejar en el input el nombre (viewValue es el texto de la opción)
    this.busquedaConsultaNombre = event.option.viewValue;
    this.consultarPrecio();
  }

  existenciaProducto(idFarmacia: string, idProducto: string, cantRequerida: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.productoService.existenciaPorFarmaciaYProducto(idFarmacia, idProducto).subscribe({
        next: (data) => {
          this.precioEnFarmacia = data.precioVenta;
          this.ubicacionEnFarmacia = data.ubicacionEnFarmacia;

          if (data.existencia >= cantRequerida) {
            this.hayProducto = true;
            resolve();
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
            resolve();
          }
        },
        error: (error) => {
          console.error('Error al obtener la existencia del producto:', error);
          this.hayProducto = false;
          reject(error);
        }
      });
    });
  }

  // --- AUTOCOMPLETE FALLBACK (CLIENTE) ---

  clienteBoxVisible = false;
  clienteIndex = -1; // para flechas

  onClienteBlur() {
    // pequeño delay para permitir click en opción
    setTimeout(() => { this.clienteBoxVisible = false; }, 120);
  }

  onClienteKeyDown(ev: KeyboardEvent) {
    if (!this.clienteBoxVisible || this.opcionesClientes.length === 0) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.clienteIndex = Math.min(this.clienteIndex + 1, this.opcionesClientes.length - 1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.clienteIndex = Math.max(this.clienteIndex - 1, 0);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.clienteIndex >= 0) {
        this.selectCliente(this.opcionesClientes[this.clienteIndex]);
      }
    } else if (ev.key === 'Escape') {
      this.clienteBoxVisible = false;
    }
  }

  selectCliente(c: any) {
    if (!c) return;
    // deja el nombre en el input
    this.clienteNombreCtrl.setValue(c.nombre, { emitEvent: false });
    this.clienteBoxVisible = false;

    // y llama tu flujo existente de selección
    this.onClienteSelected(c);
  }

  trackByCliente = (_: number, c: any) => c?._id || c?.nombre || _;

  // ---- util: asegura array sin importar el formato del backend ----
  private ensureClientesArray(src: any): any[] {
    if (Array.isArray(src)) return src;
    if (Array.isArray(src?.rows)) return src.rows;
    if (Array.isArray(src?.data)) return src.data;
    if (Array.isArray(src?.clientes)) return src.clientes;
    return [];
  }

  // Asegura que this.clientes sea un array y filtra por nombre/teléfono
  private filtraClientesLocal(term: string): any[] {
    const base: any[] = Array.isArray(this.clientes)
      ? this.clientes
      : (Array.isArray((this.clientes as any)?.rows) ? (this.clientes as any).rows : []);

    const t = (term || '').trim().toLowerCase();
    if (!t) return base.slice(0, 50);

    const tDigits = term.replace(/\D/g, '');
    return base.filter(c => {
      const nombre = (c?.nombre || '').toLowerCase();
      const tel = String(c?.telefono || '');
      return nombre.includes(t) || (tDigits && tel.includes(tDigits));
    }).slice(0, 50);
  }

  // ligado al (input) del <datalist>
  filtraClientesDatalist(term: string) {
    this.opcionesClientes = this.filtraClientesLocal(term);
  }

  // cuando el usuario elige una opción (o pega el texto)
  onClienteElegidoDesdeTexto(text: string) {
    const nombre = String(text || '').split(' — ')[0].trim().toLowerCase();
    if (!nombre) return;
    const base = this.ensureClientesArray(this.clientes);
    const c = base.find(x => String(x?.nombre || '').toLowerCase() === nombre);
    if (c) this.onClienteSelected(c); // <- tu método existente
  }

  // Modal con imagen grande
  openPreviewVenta(item: any) {
    const prod = (this.productos || []).find(x => x._id === item.producto);
    const base = prod?.imagen
      ? this.productoService.obtenerImagenProductoUrl(item.producto)
      : this.placeholderSrc;

    const img = new Image();
    img.src = base;

    img.onload = () => {
      // tamaño original
      const ow = img.naturalWidth || 0;
      const oh = img.naturalHeight || 0;

      // objetivo: 3x
      const targetW = ow * 3;
      const targetH = oh * 3;

      // límite visual (90% viewport)
      const maxW = Math.floor(window.innerWidth * 0.9);
      const maxH = Math.floor(window.innerHeight * 0.9);

      // factor para que quepa (si cabe a 3x, queda en 3x; si no, se reduce manteniendo proporción)
      const fit = Math.min(maxW / targetW, maxH / targetH, 1);

      const finalW = Math.max(1, Math.round(targetW * fit));
      const finalH = Math.max(1, Math.round(targetH * fit));

      Swal.fire({
        width: 'auto',
        background: '#000',
        showConfirmButton: false,
        showCloseButton: true,
        padding: 0,
        html: `
        <div style="max-width:${maxW}px;max-height:${maxH}px;display:flex;align-items:center;justify-content:center;">
          <img src="${base}" alt=""
               style="width:${finalW}px;height:${finalH}px;object-fit:contain;display:block;"/>
        </div>`
      });
    };

    img.onerror = () => {
      // fallback simple si falla la carga
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar la imagen',
        text: 'Inténtalo de nuevo.',
      });
    };
  }

}

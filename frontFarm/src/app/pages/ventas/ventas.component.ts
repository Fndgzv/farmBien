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
import { buildImgUrl } from '../../shared/img-url';

type PromoDia = { inicio?: any; fin?: any; porcentaje?: number; monedero?: boolean };
type PromoTemporada = { inicio?: any; fin?: any; porcentaje?: number; monedero?: boolean };
type InvInfo = {
  precioVenta: number;
  ubicacionFarmacia?: string;
  existencia: number;

  descuentoINAPAM?: boolean;

  promoCantidadRequerida?: number;
  inicioPromoCantidad?: any;
  finPromoCantidad?: any;

  promoLunes?: PromoDia;
  promoMartes?: PromoDia;
  promoMiercoles?: PromoDia;
  promoJueves?: PromoDia;
  promoViernes?: PromoDia;
  promoSabado?: PromoDia;
  promoDomingo?: PromoDia;

  promoDeTemporada?: PromoTemporada;
};

export interface ConsultaPrecioResp {
  _id?: string; // opcional si luego lo agregas en backend
  nombre: string;
  precioNormal: number;

  ubicacionFarmacia?: string | null;

  // promos por día (opcionales)
  promo0?: string; precioDomingo?: string; domingoMasInapam?: string;
  promo1?: string; precioLunes?: string; lunesMasInapam?: string;
  promo2?: string; precioMartes?: string; martesMasInapam?: string;
  promo3?: string; precioMiercoles?: string; miercolesMasInapam?: string;
  promo4?: string; precioJueves?: string; juevesMasInapam?: string;
  promo5?: string; precioViernes?: string; viernesMasInapam?: string;
  promo6?: string; precioSabado?: string; sabadoMasInapam?: string;

  // promo ganadora / info general
  promo?: string;                 // "Ninguno" o texto promo (cantidad/temporada)
  promoCliente?: string;

  // temporada
  precioConDescuento?: string;    // "$xx.xx" si hay temporada activa
  temporadaMasInapam?: string;    // "Temporada + 5% INAPAM: $xx.xx"

  // inapam
  precioInapam?: string;          // "$xx.xx"
}

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

  invCache: Record<string, InvInfo> = {}; // productoId -> inventario info

  @ViewChild('codigoBarrasRef') codigoBarrasRef!: ElementRef<HTMLInputElement>;
  @ViewChild('efectivoRecibidoRef') efectivoRecibidoRef!: ElementRef<HTMLInputElement>; // <-- para enfocar el primer input del modal

  @ViewChild('cliTrigger', { read: MatAutocompleteTrigger })
  cliTrigger?: MatAutocompleteTrigger;

  opcionesClientes: any[] = [];

  existencias: Record<string, number> = {};

  private pendingFocusEfectivo = false;
  barcodeFocusTimer: any = null;

  telefonoCliente: string = '';
  nombreCliente: string = '';
  cliente: string = '';
  montoMonederoCliente = 0;
  usarMonedero = false;

  hayProducto: boolean = false;
  nombreDelProducto: string = '';

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

  productosCargando = true;
  pendingScan: string | null = null;

  isSwalOpen = false;

  bloquearScanner = false;

  buildImgUrlRef = buildImgUrl;
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

  onImgError(ev: Event) {
    const el = ev.target as HTMLImageElement | null;
    if (el && !el.src.includes(this.placeholderSrc)) el.src = this.placeholderSrc;
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
    this.focusBarcode(60, true);
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

  private focusBarcode(delay = 60, force = false) {
    this.clearBarcodeFocusTimer();
    this.barcodeFocusTimer = setTimeout(() => {
      // ❗ nunca robes el foco si hay Swal/otro modal
      if (this.isSwalOpen || this.mostrarModalPago || this.mostrarModalConsultaPrecio) {
        this.barcodeFocusTimer = null;
        return;
      }
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === 'INPUT' || ae.getAttribute('contenteditable') === 'true');

      if (force) {
        this.codigoBarrasRef?.nativeElement?.focus();
      } else if (!typing && this.codigoBarrasRef) {
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
    if (!this.aplicaInapam) {
      this.recalcularRenglones();
      return;
    }

    this.bloquearScanner = true;

    // 👈 declarar aquí para que exista en didOpen y willClose
    let keyHandler: (e: KeyboardEvent) => void;

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
      didOpen: (el) => {
        // ⛔️ bloquear que el Enter burbujee al input del scanner
        keyHandler = (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
          }
        };
        el.addEventListener('keydown', keyHandler, true); // capture = true
      },
      willClose: (el) => {
        try { el.removeEventListener('keydown', keyHandler, true); } catch { }
      },
    });

    this.aplicaInapam = result.isConfirmed;
    this.bloquearScanner = false;
    this.focusBarcode(60, true);
    this.recalcularRenglones();
  }

  async recalcularRenglones() {
    if (!this.carrito.length) return;

    for (let i = 0; i < this.carrito.length; i++) {
      const item = this.carrito[i];
      const productoBase = this.productos.find(pe => pe._id === item.producto);

      if (!productoBase) continue;

      // ✅ Asegura inv en cache
      let inv = this.invCache[item.producto];
      if (!inv) {
        await this.existenciaProducto(this.farmaciaId, item.producto, 1, true);
        inv = this.invCache[item.producto];
      }
      if (!inv) continue;

      // ✅ sincroniza datos desde inventariofarmacias
      item.precioOriginal = Number(inv.precioVenta ?? item.precioOriginal ?? 0);
      item.ubicacionEnFarmacia = inv.ubicacionFarmacia ?? item.ubicacionEnFarmacia ?? '';
      this.existencias[item.producto] = Number(inv.existencia ?? this.existencias[item.producto] ?? 0);

      // INAPAM basado en inventario
      if (this.descuentoMenorA25Inv(inv)) await this.preguntaINAPAMInv(inv);

      if (productoBase.categoria === 'Recargas' || productoBase.categoria === 'Servicio Médico') {
        this.ptjeDescuento = 0;
        this.productoAplicaMonedero = false;
        this.cadDesc = '';
        this.tipoDescuento = '';
        this.alMonedero = 0;
        this.aplicaGratis = false;
      } else {
        // ✅ promos desde inventario
        this.descuentoYpromoInv(inv, productoBase.categoria);
      }

      const precioOriginal = item.precioOriginal;
      let precioFinalUnit = precioOriginal * (100 - this.ptjeDescuento) / 100;

      // monedero 2%
      if (this.productoAplicaMonedero) {
        this.alMonedero = precioFinalUnit * 0.02;
        if (this.tipoDescuento === '') {
          this.tipoDescuento = 'Cliente';
          this.cadDesc = '2% Moned.';
        } else {
          this.tipoDescuento = `${this.tipoDescuento}-Cliente`;
          this.cadDesc = `${this.cadDesc} + 2% Moned.`;
        }
      } else {
        this.alMonedero = 0;
      }

      this.tipoDescuento = this.limpiarPromocion(this.tipoDescuento);

      item.precioFinal = precioFinalUnit;
      item.tipoDescuento = this.tipoDescuento;
      item.cadDesc = this.cadDesc;
      item.alMonedero = this.alMonedero;
      item.descuentoUnitario = precioOriginal - precioFinalUnit;
      item.iva = productoBase.iva ? precioFinalUnit * 0.16 : 0;

      // ✅ req desde inventario
      item.promoCantidadRequerida = Number(inv.promoCantidadRequerida ?? 0) || 0;

      const aplicaGratisItem = this.aplicaGratis;
      if (aplicaGratisItem) this.validarProductoGratis(item.producto);
    }

    this.calcularTotal();
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

            this.focusBarcode(0, true);
          } else {
            this.mostrarModalCrearCliente();
          }
        },
        error: (error) => {
          console.error("❌ Error al buscar cliente:", error);
          this.mostrarModalCrearCliente();
        }
      });
    } else {
      this.cliente = '';
      this.nombreCliente = '';
      this.montoMonederoCliente = 0;
      this.hayCliente = false;
      this.ventaForm.controls['cliente'].setValue('');
      this.clienteNombreCtrl.setValue(''); // limpia el autocompleto
      this.recalcularRenglones();
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
        this.cliente = '';
        this.nombreCliente = '';
        this.montoMonederoCliente = 0;
        this.hayCliente = false;
        this.ventaForm.controls['cliente'].setValue('');
        this.clienteNombreCtrl.setValue(''); // limpia el autocompleto
        this.recalcularRenglones();
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
        this.focusBarcode(0, true);
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
    this.focusBarcode(60, true);
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
    this.focusBarcode(0, true);
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
      this.nombreDelProducto = producto.nombre;

      this.guardConsultaMedica(producto).then(async cand => {
        if (!cand) { this.focusBarcode(100, true); return; }
        const ok = await this.existenciaProducto(this.farmaciaId, cand._id, 1).catch(() => null);
        if (!this.hayProducto) return;
        this.agregarProductoAlCarrito(cand);
      });
    }
    this.focusBarcode(100, true);
  }

  seleccionarPorCodigo(event: any) {
    const productoId = event.option.value;
    const productoC = this.productos.find(p => p._id === productoId);
    if (productoC) {
      this.busquedaPorCodigo = productoC.codigoBarras;
      this.nombreDelProducto = productoC.nombre;

      this.guardConsultaMedica(productoC).then(async cand => {
        if (!cand) { this.focusBarcode(100, true); return; }
        const ok = await this.existenciaProducto(this.farmaciaId, cand._id, 1).catch(() => null);
        if (!this.hayProducto) return;
        this.agregarProductoAlCarrito(cand);
      });
    }
    this.focusBarcode(100, true);
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
      captionButtomReanudar: this.captionButtomReanudar || '(venta pausada)',
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
    this.focusBarcode(0, true);
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
    this.focusBarcode(0, true);
  }

  obtenerProductos() {
    this.productoService.obtenerProductos().subscribe({
      next: (data) => {
        this.productos = data || [];
        this.thumbs = {}; // id -> url

        for (const prod of this.productos) {
          this.thumbs[prod._id] = prod?.imagen
            ? this.productoService.getPublicImageUrl(prod.imagen)
            : this.placeholderSrc;
        }

        // 🔧 FIN de carga: desbloquea y procesa el escaneo pendiente
        this.productosCargando = false;

        if (this.pendingScan) {
          const code = this.pendingScan;
          this.pendingScan = null;
          this.codigoBarras = code;
          // dispara el flujo normal de escaneo
          this.agregarProductoPorCodigo();
        } else {
          // asegura foco en el lector
          this.focusBarcode(60, true);
        }
      },
      error: (error) => {
        console.error('Error al obtener productos', error);
        this.productosCargando = false; // no lo dejes colgado en true
      }
    });
  }

  onThumbError(ev: Event, p: any) {
    const img = ev.target as HTMLImageElement;
    if (!img) return;
    if (img.src !== this.placeholderSrc) {
      img.src = this.placeholderSrc;              // evita loop
      this.thumbs[p.producto] = this.placeholderSrc; // cachea el placeholder
    }
  }

  onConsultaImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (!img) return;
    if (img.src !== this.placeholderSrc) {
      img.src = this.placeholderSrc;
    }
  }


  private delay(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }
  async agregarProductoPorCodigo() {
    // 0) Normaliza el input del lector
    const code = (this.codigoBarras || '').trim();
    this.codigoBarras = ''; // limpia SIEMPRE el input visible

    // 🔒 Si hay un modal que debe bloquear el scanner, ignora el enter colado
    if (this.bloquearScanner) {
      this.focusBarcode(60, true);
      return;
    }

    // 🚫 Si el código está vacío, no dispares “no encontrado”
    if (!code) {
      this.focusBarcode(60, true);
      return;
    }


    // 1) Si aún no cargan productos, encola el escaneo y sal
    if (this.productosCargando) {
      if (code.length) this.pendingScan = code;
      return;
    }

    // 2) Si viene vacío y ya hay carrito -> pregunta cobro
    if (!code && this.carrito.length > 0) {
      this.abrirModalPago();
      // el focus lo manejamos abajo en finally
      //this.focusBarcode(60, true);
      return;
    }

    // 3) Buscar el producto por código de barras (con estabilización)
    const codeNorm = String(code || '').trim();

    const tryFind = () => this.productos.find(p => String(p.codigoBarras) === codeNorm);

    let producto = tryFind();
    if (!producto) {
      await this.delay(120);
      producto = tryFind();
    }
    if (!producto) {
      await this.delay(120);
      producto = tryFind();
    }

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
      }).then(() => this.focusBarcode(60, true));
      return;
    }

    // 🔒 Valida consulta correcta según el día (con posible sustitución)
    const candidato = await this.guardConsultaMedica(producto);
    if (!candidato) { this.focusBarcode(60, true); return; }
    producto = candidato;

    this.nombreDelProducto = producto.nombre

    // 4) Verificar existencia y agregar al carrito
    this.existenciaProducto(this.farmaciaId, producto._id, 1)
      .then(() => {
        if (!this.hayProducto) return; // ya mostró alerta de existencia
        this.agregarProductoAlCarrito(producto);
      })
      .catch((error: any) => {
        console.error('Error en existenciaProducto: ', error);
      })
      .finally(() => {
        this.focusBarcode(60, true);
      });
  }

  async agregarProductoAlCarrito(producto: any) {
    const candidato = await this.guardConsultaMedica(producto);
    if (!candidato) { this.focusBarcode(60, true); return; }
    producto = candidato;
    const existente = this.carrito.find(p => p.producto === producto._id && !p.esGratis);

    if (existente) {
      this.nombreDelProducto = existente.nombre;

      this.existenciaProducto(this.farmaciaId, producto._id, existente.cantidad + 1)
        .then(() => {
          if (!this.hayProducto) return;
          existente.cantidad += 1;

          if (this.esPromoCantidad(existente.tipoDescuento)) {
            this.validarProductoGratis(existente.producto);
          }
          this.calcularTotal();
        })
        .catch((error: any) => console.error('Error en existenciaProducto: ', error));

      return;
    }

    // ✅ asegura inv en cache
    let inv2 = this.invCache[producto._id];
    if (!inv2) {
      await this.existenciaProducto(this.farmaciaId, producto._id, 1, true);
      inv2 = this.invCache[producto._id];
    }
    if (!inv2) return; // si el backend falló

    // ✅ existencia real
    this.existencias[producto._id] = Number(inv2.existencia ?? 0);

    const precioOriginal = Number(inv2.precioVenta ?? this.precioEnFarmacia ?? 0);
    let precioFinalUnit = precioOriginal;

    // INAPAM pregunta basada en inventario
    if (this.descuentoMenorA25Inv(inv2)) await this.preguntaINAPAMInv(inv2);

    if (producto.categoria === 'Recargas' || producto.categoria === 'Servicio Médico') {
      this.ptjeDescuento = 0;
      this.productoAplicaMonedero = false;
      this.cadDesc = '';
      this.tipoDescuento = '';
      this.alMonedero = 0;
      this.aplicaGratis = false;
    } else {
      // ✅ aquí estaba tu error de tipos: manda (inv, categoria)
      this.descuentoYpromoInv(inv2, producto.categoria);
    }

    precioFinalUnit *= (100 - this.ptjeDescuento) / 100;

    if (this.productoAplicaMonedero) {
      this.alMonedero = precioFinalUnit * 0.02;
      if (this.tipoDescuento === '') {
        this.tipoDescuento = 'Cliente';
        this.cadDesc = '2% Moned.';
      } else {
        this.tipoDescuento = `${this.tipoDescuento}-Cliente`;
        this.cadDesc = `${this.cadDesc} + 2% Moned.`;
      }
    } else {
      this.alMonedero = 0;
    }

    this.tipoDescuento = this.limpiarPromocion(this.tipoDescuento);

    if (this.captionButtomReanudar === '') this.captionButtomReanudar = producto.nombre;

    const nuevo = {
      producto: producto._id,
      codBarras: producto.codigoBarras,
      nombre: producto.nombre,
      cantidad: 1,
      precioFinal: precioFinalUnit,
      precioOriginal,
      ubicacionEnFarmacia: inv2.ubicacionFarmacia ?? this.ubicacionEnFarmacia,

      tipoDescuento: this.tipoDescuento,
      cadDesc: this.cadDesc,
      alMonedero: this.alMonedero,

      descuentoUnitario: precioOriginal - precioFinalUnit,
      iva: producto.iva ? precioFinalUnit * 0.16 : 0,

      cantidadPagada: 1,
      farmacia: this.farmaciaId,
      promoCantidadRequerida: Number(inv2.promoCantidadRequerida ?? 0) || 0,
    };

    this.carrito = [nuevo, ...this.carrito];

    if (this.aplicaGratis) this.validarProductoGratis(producto._id);

    this.calcularTotal();
  }

  limpiarPromocion(promo: string) {
    const str = (promo || '').toString();
    return str.startsWith('-') ? str.slice(1) : str;
  }

  async preguntaINAPAMInv(inv: InvInfo) {
    if (!inv?.descuentoINAPAM) return;
    if (this.yaPreguntoInapam) return;

    let keyHandler: (e: KeyboardEvent) => void;

    const result = await Swal.fire({
      icon: 'question',
      title: '¿Tiene credencial INAPAM vigente?',
      html: `
      <div style="font-size: 18px; margin-top: 6px; color:#666;">
        Me la puede mostrar por favor
      </div>
      <div style="margin-top: 14px; color: #0a8a0a; font-size: 18px;">
        Revisa que su credencial de INAPAM:
        <div style="margin-top: 10px; line-height: 1.6;">
          * Pertenezca al cliente<br>
          * No esté vencida
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: 'Sí cumple',
      cancelButtonText: 'No cumple',

      // 👉 que Enter esté habilitado, pero lo capturamos nosotros
      allowEnterKey: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      returnFocus: false,

      // 👉 intenta enfocarlo igual
      focusCancel: true,
      heightAuto: false,

      didOpen: () => {
        // 1) Asegura foco en "No cumple" (por si el CSS/animación lo pierde)
        setTimeout(() => Swal.getCancelButton()?.focus(), 0);

        // 2) Mientras el modal esté visible, cualquier Enter => clickCancel()
        keyHandler = (e: KeyboardEvent) => {
          if (!Swal.isVisible()) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            Swal.clickCancel();
          }
        };
        document.addEventListener('keydown', keyHandler, true); // capture=true
      },

      willClose: () => {
        try { document.removeEventListener('keydown', keyHandler, true); } catch { }
      },
    });

    this.aplicaInapam = result.isConfirmed;
    this.yaPreguntoInapam = true;
  }


  descuentoMenorA25Inv(inv: InvInfo): boolean {
    const hoy = new Date().getDay(); // 0..6
    const p = this.promoDelDia(inv, hoy);
    const pct = Number(p?.porcentaje ?? 0);
    if (!pct) return true;
    return pct < 25;
  }


  descuentoYpromoInv(inv: InvInfo, categoria: string) {
    const fechahoy = this.hoySoloDiaLocal();
    const hoy = fechahoy.getDay();

    this.tipoDescuento = ""; 0
    this.cadDesc = '';
    this.ptjeDescuento = 0;

    this.productoAplicaMonedero = this.hayCliente;
    this.alMonedero = 0;
    this.aplicaGratis = false;

    // 1) Promo por cantidad (2x1/3x2/4x3)
    const req = Number(inv?.promoCantidadRequerida ?? 0);

    const iniCant = this.fechaSoloDiaDesdeUTC(inv?.inicioPromoCantidad);
    const finCant = this.fechaSoloDiaDesdeUTC(inv?.finPromoCantidad);

    if (req >= 2 && iniCant && finCant && iniCant <= fechahoy && finCant >= fechahoy) {
      this.aplicaGratis = true;
      this.tipoDescuento = `${req}x${req - 1}`;
      this.productoAplicaMonedero = false;

      if (this.aplicaInapam && inv.descuentoINAPAM) {
        this.ptjeDescuento = 5;
        this.tipoDescuento += `-INAPAM`;
        this.cadDesc = '5%';
      }
      return;
    }

    // 2) Descuento por día
    const promoDia = this.promoDelDia(inv, hoy);
    const iniDia = this.fechaSoloDiaDesdeUTC(promoDia?.inicio);
    const finDia = this.fechaSoloDiaDesdeUTC(promoDia?.fin);
    const descuentoXDia = Number(promoDia?.porcentaje ?? 0);

    if (descuentoXDia > 0 && iniDia && finDia && iniDia <= fechahoy && finDia >= fechahoy) {
      this.tipoDescuento = this.nombreDiaSemana(hoy);
      this.ptjeDescuento = descuentoXDia;
      this.cadDesc = `${descuentoXDia}%`;
      this.productoAplicaMonedero = !!promoDia?.monedero && this.hayCliente;
    }

    // 3) Temporada (si mejora)
    if (inv?.promoDeTemporada?.inicio && inv?.promoDeTemporada?.fin) {
      const t = inv.promoDeTemporada;

      const iniTemp = this.fechaSoloDiaDesdeUTC(t.inicio);
      const finTemp = this.fechaSoloDiaDesdeUTC(t.fin);

      if (iniTemp && finTemp && iniTemp <= fechahoy && finTemp >= fechahoy) {
        const ptjeTem = Number(t.porcentaje ?? 0);
        if (ptjeTem > this.ptjeDescuento) {
          this.ptjeDescuento = ptjeTem;
          this.tipoDescuento = 'Temporada';
          this.cadDesc = `${ptjeTem}%`;
          this.productoAplicaMonedero = !!t.monedero && this.hayCliente;
        }
      }
    }

    // 4) INAPAM acumulable si aplica
    if (this.ptjeDescuento > 0) {
      if (this.ptjeDescuento < 25 && this.aplicaInapam && inv.descuentoINAPAM) {
        const base = Number(inv?.precioVenta ?? this.precioEnFarmacia ?? 0) || 1;
        const pf = base * (1 - this.ptjeDescuento / 100) * 0.95;
        this.ptjeDescuento = (1 - (pf / base)) * 100;

        this.tipoDescuento += `-INAPAM`;
        this.cadDesc += ` + 5%`;
        this.productoAplicaMonedero = this.hayCliente;
      }
    } else if (this.aplicaInapam && inv.descuentoINAPAM) {
      this.ptjeDescuento = 5;
      this.tipoDescuento = 'INAPAM';
      this.cadDesc = '5%';
      this.productoAplicaMonedero = this.hayCliente;
    }

    if (this.ptjeDescuento <= 0) this.productoAplicaMonedero = this.hayCliente;

    // Recargas / Servicio Médico: nunca monedero ni promos
    if (categoria === 'Recargas' || categoria === 'Servicio Médico') {
      this.ptjeDescuento = 0;
      this.productoAplicaMonedero = false;
      this.cadDesc = '';
      this.tipoDescuento = '';
      this.alMonedero = 0;
    }
  }

  soloFecha(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }


  soloFechaBD(val: any): Date | null {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;

    // ✅ fecha "date-only" basada en el ISO UTC (no se recorre a un día antes)
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
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

  // Cantidad máxima PAGADA que puedes vender con stock `exist`
  // si hay promo por cantidad con requisito `req` (2,3,4)
  private maxPagablesConPromo(exist: number, req: number): number {
    if (!Number.isFinite(exist) || exist <= 0) return 0;
    if (!Number.isFinite(req) || req < 2) return exist;

    // Búsqueda binaria: pagadas + floor(pagadas/(req-1)) <= exist
    let lo = 0, hi = exist;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const totalNeces = mid + Math.floor(mid / (req - 1));
      if (totalNeces <= exist) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Normaliza cantidad: entero >= 1
  private clampCantidad(raw: any): number {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  onCantidadBlur(index: number, raw: any) {
    // Opcional: normaliza visualmente al salir del input
    const item = this.carrito[index];
    if (!item || item.esGratis) return;
    const n = this.clampCantidad(raw);
    if (n !== item.cantidad) {
      // re-usa el flujo central para validar existencia y ajustar gratis
      this.onCantidadChange(index, n);
    }
  }

  onCantidadChange(index: number, raw: any) {
    const item = this.carrito[index];
    if (!item || item.esGratis) return; // el gratis no se edita

    const solicitada = this.clampCantidad(raw);
    const req = Number(item.promoCantidadRequerida) || 0;
    const esPromoCant = this.esPromoCantidad(item.tipoDescuento) && req >= 2;

    // Pedimos existencia actual en modo silencioso
    this.existenciaProducto(this.farmaciaId, item.producto, 1, /*quiet*/ true)
      .then((existencia) => {
        // Máximo que puedo poner en el input respetando stock (y promo)
        const maxPagadas = esPromoCant
          ? this.maxPagablesConPromo(existencia, req)
          : existencia;

        const nueva = Math.min(solicitada, Math.max(1, maxPagadas));

        // Si pidió más de lo disponible, forzamos el valor permitido
        if (solicitada > maxPagadas) {
          item.cantidad = nueva;
          // (opcional) marca visual 1s
          (item as any)._cantidadAjustada = true;
          setTimeout(() => { (item as any)._cantidadAjustada = false; this.cdRef.detectChanges(); }, 1000);
        } else {
          // Dentro del rango
          if (nueva === item.cantidad) return;
          item.cantidad = nueva;
        }

        // Mantén coherente el renglón gratis
        if (this.esPromoCantidad(item.tipoDescuento)) {
          this.validarProductoGratis(item.producto);
        } else {
          const idxG = this.carrito.findIndex(p => p.producto === item.producto && p.esGratis);
          if (idxG !== -1) this.carrito.splice(idxG, 1);
        }

        this.calcularTotal();
        this.cdRef.detectChanges();
        this.focusBarcode(60);
      })
      .catch(() => { /* silencio en error de red */ });
  }


  incrementarCantidad(index: number) {
    const producto = this.carrito[index];
    if (!producto.esGratis) {
      this.nombreDelProducto = producto.nombre
      this.existenciaProducto(this.farmaciaId, producto.producto, producto.cantidad + 1).then(() => {
        if (!this.hayProducto) return;
        producto.cantidad += 1;
        if (this.esPromoCantidad(producto.tipoDescuento)) {
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
      if (this.esPromoCantidad(producto.tipoDescuento)) {
        this.validarProductoGratis(producto.producto);
      }
      this.calcularTotal();
    } else if (producto.cantidad === 1 && !producto.esGratis) {
      producto.cantidad--;
      this.eliminarProducto(index);
    }
    //this.syncClienteCtrlDisabled();
  }

  private esPromoCantidad(tipo: string): boolean {
    const t = (tipo || '').trim();
    return /^(2x1|3x2|4x3)(-|$)/.test(t);
  }

  private promoCantidadActiva(inv: any): boolean {
    const hoy = this.soloFecha(new Date());                 // hoy local
    const ini = this.soloFechaBD(inv?.inicioPromoCantidad); // ✅ BD en UTC-day
    const fin = this.soloFechaBD(inv?.finPromoCantidad);    // ✅ BD en UTC-day
    const req = Number(inv?.promoCantidadRequerida ?? 0);

    return !!(req >= 2 && ini && fin && ini <= hoy && fin >= hoy);
  }

  async validarProductoGratis(productoId: string) {
    // 1) renglón pagado
    const prodPaid = this.carrito.find(p => p.producto === productoId && !p.esGratis);
    const idxGratis = this.carrito.findIndex(p => p.producto === productoId && p.esGratis);

    if (!prodPaid) {
      if (idxGratis !== -1) this.carrito.splice(idxGratis, 1);
      return;
    }

    // 2) SOLO si realmente es promo por cantidad en el renglón pagado
    if (!this.esPromoCantidad(prodPaid.tipoDescuento)) {
      if (idxGratis !== -1) this.carrito.splice(idxGratis, 1);
      return;
    }

    // 3) valida que la promo siga activa hoy según inventario (backend manda ISO con Z)
    const inv = this.invCache?.[productoId];
    if (!inv || !this.promoCantidadActiva(inv)) {
      if (idxGratis !== -1) this.carrito.splice(idxGratis, 1);
      return;
    }

    const req = Number(inv.promoCantidadRequerida ?? prodPaid.promoCantidadRequerida ?? 0);
    if (req < 2) {
      if (idxGratis !== -1) this.carrito.splice(idxGratis, 1);
      return;
    }

    // 4) calcula gratis necesarios
    const pagados = Number(prodPaid.cantidad ?? 0);
    const gratisNecesarios = Math.floor(pagados / (req - 1));

    if (gratisNecesarios <= 0) {
      if (idxGratis !== -1) this.carrito.splice(idxGratis, 1);
      return;
    }

    // 5) ✅ revalida existencia TOTAL (pagados + gratis) con await
    this.nombreDelProducto = prodPaid.nombre;
    await this.existenciaProducto(this.farmaciaId, productoId, pagados + gratisNecesarios);
    if (!this.hayProducto) return;

    // 6) crea/actualiza renglón gratis
    if (idxGratis === -1) {
      const lineaGratis = {
        producto: prodPaid.producto,
        nombre: prodPaid.nombre,
        cantidad: gratisNecesarios,
        precioFinal: 0,
        precioOriginal: prodPaid.precioOriginal,
        tipoDescuento: `${req}x${req - 1}-Gratis`,
        cadDesc: '100%',
        alMonedero: 0,
        descuentoUnitario: prodPaid.precioOriginal,
        iva: 0,
        cantidadPagada: 0,
        esGratis: true,
        controlesDeshabilitados: true,
        lotes: prodPaid.lotes,
        farmacia: this.farmaciaId,
        promoCantidadRequerida: req
      };

      // opcional: meterla justo debajo del pagado
      const idxPaid = this.carrito.findIndex(p => p.producto === productoId && !p.esGratis);
      this.carrito.splice(idxPaid + 1, 0, lineaGratis);
    } else {
      const g = this.carrito[idxGratis];
      g.cantidad = gratisNecesarios;
      g.tipoDescuento = `${req}x${req - 1}-Gratis`;
      g.cadDesc = '100%';
      g.precioFinal = 0;
      g.iva = 0;
      g.controlesDeshabilitados = true;
      g.promoCantidadRequerida = req;
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

        this.habilitarInputs();

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
    this.focusBarcode(50, true);
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
      barrasYNombre: `${(p.codBarras ?? '').slice(-3)} ${p.nombre}`,
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
      // ✅ Si hay tarjeta o transferencia → imprimir 2 tickets
      const requiere2 = (this.montoTarjeta > 0) || (this.montoTransferencia > 0);
      const veces = requiere2 ? 2 : 1;

      const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

      // 🔥 Imprime SOLO el ticket en un iframe oculto (sin tocar tu @media print global)
      for (let n = 0; n < veces; n++) {
        await printNodeInIframe(el);
        if (n < veces - 1) await sleep(600); // pausa leve entre impresiones
      }


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
    this.captionButtomReanudar = "";
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
      totaMonederoCliente: this.totalAlmonedero,
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
            this.focusBarcode(50, true);
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
          setTimeout(() => this.focusBarcode(50, true), 0);
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
    this.focusBarcode(50, true);
  }

  consultarPrecio() {
    const code = (this.codigoConsulta || '').trim();
    if (!code) return;

    this.codigoConsulta = code;
    this.consultaEncontrado = false;
    this.productoConsultado = null;
    this.consultaImgUrl = this.placeholderSrc;

    this.productoService.consultarPrecioPorCodigo(this.farmaciaId, code).subscribe({
      next: (data) => {
        const ok = !!data && data.nombre !== undefined;

        this.consultaEncontrado = ok;

        if (!ok) {
          this.productoConsultado = null;
          this.consultaImgUrl = this.placeholderSrc;
          return;
        }

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
          promo: data.promo,
          precioConDescuento: data.precioConDescuento,
          precioInapam: data.precioInapam,
          precioDescuentoMasInapam: data.precioDescuentoMasInapam,
          temporadaMasInapam: data.temporadaMasInapam,
          promoCliente: data.promoCliente,
          ubicacionEnFarmacia: data.ubicacionFarmacia
        };

        // ✅ ahora el back manda _id siempre
        const prodId = data._id
          ?? (this.productos || []).find(pr => pr.codigoBarras === this.codigoConsulta)?._id;

        const prod = prodId ? this.productos.find(pr => pr._id === prodId) : null;
        this.consultaImgUrl = (prod && prod.imagen)
          ? this.productoService.getPublicImageUrl(prod.imagen)
          : this.placeholderSrc;
      },
      error: (error) => {
        console.error("❌ Error al consultar precio:", error);

        const msg = error?.error?.mensaje || 'Error al consultar precio';
        this.consultaEncontrado = false;
        this.productoConsultado = null;
        this.consultaImgUrl = this.placeholderSrc;

        Swal.fire('Error', msg, 'error');
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

  existenciaProducto(
    idFarmacia: string,
    idProducto: string,
    cantRequerida: number,
    quiet = false
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      this.productoService.existenciaPorFarmaciaYProducto(idFarmacia, idProducto).subscribe({
        next: (data) => {
          // ✅ cachea inventario COMPLETO (incluye promos)
          this.invCache[idProducto] = {
            precioVenta: Number(data?.precioVenta ?? 0),
            ubicacionFarmacia: data?.ubicacionFarmacia ?? '',
            existencia: Number(data?.existencia ?? 0),

            descuentoINAPAM: !!data?.descuentoINAPAM,

            promoCantidadRequerida: Number(data?.promoCantidadRequerida ?? 0),
            inicioPromoCantidad: data?.inicioPromoCantidad ?? null,
            finPromoCantidad: data?.finPromoCantidad ?? null,

            promoLunes: data?.promoLunes ?? null,
            promoMartes: data?.promoMartes ?? null,
            promoMiercoles: data?.promoMiercoles ?? null,
            promoJueves: data?.promoJueves ?? null,
            promoViernes: data?.promoViernes ?? null,
            promoSabado: data?.promoSabado ?? null,
            promoDomingo: data?.promoDomingo ?? null,

            promoDeTemporada: data?.promoDeTemporada ?? null,
          };

          // ✅ y también tus variables legacy
          this.precioEnFarmacia = this.invCache[idProducto].precioVenta;
          this.ubicacionEnFarmacia = this.invCache[idProducto]?.ubicacionFarmacia ?? '';

          const existencia = this.invCache[idProducto].existencia;
          this.existencias[idProducto] = existencia;

          if (existencia >= cantRequerida) {
            this.hayProducto = true;
          } else {
            this.hayProducto = false;
            if (!quiet) {
              Swal.fire({
                icon: 'error',
                title: 'No hay suficiente existencia',
                html: `Producto: ${this.nombreDelProducto}<br>Cantidad disponible: ${existencia}<br>Cantidad requerida: ${cantRequerida}`,
                confirmButtonText: 'OK',
                allowOutsideClick: false,
                allowEscapeKey: false,
              });
            }
          }
          resolve(existencia);
        },
        error: (err) => { this.hayProducto = false; reject(err); }
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


  private promoDelDia(inv: InvInfo, hoy: number): PromoDia | null {
    switch (hoy) {
      case 1: return inv.promoLunes ?? null;
      case 2: return inv.promoMartes ?? null;
      case 3: return inv.promoMiercoles ?? null;
      case 4: return inv.promoJueves ?? null;
      case 5: return inv.promoViernes ?? null;
      case 6: return inv.promoSabado ?? null;
      case 0: return inv.promoDomingo ?? null;
      default: return null;
    }
  }

  // ✅ convierte "2025-12-31T00:00:00.000Z" -> Date(2025, 11, 31) en local
  fechaSoloDiaDesdeUTC(valor: any): Date | null {
    if (!valor) return null;
    const d = new Date(valor);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  hoySoloDiaLocal(): Date {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }


  // === Helpers para controlar Consulta Médica vs FDS ===
  private norm(s: any): string {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
  }

  private isWeekendToday(): boolean {
    const d = new Date().getDay(); // 0=Dom .. 6=Sáb
    return d === 0 || d === 6;
  }

  // ⚠️ ACTUALIZA estos códigos si cambian en tu BD
  private readonly COD_CONSULTA_NORMAL = '5656565656561';
  private readonly COD_CONSULTA_FDS = '151562325423';

  private isConsultaNormal(p: any): boolean {
    return this.norm(p?.nombre) === 'consulta medica' ||
      String(p?.codigoBarras) === this.COD_CONSULTA_NORMAL;
  }

  private isConsultaFinSemana(p: any): boolean {
    return this.norm(p?.nombre) === 'consulta medica fin de semana' ||
      String(p?.codigoBarras) === this.COD_CONSULTA_FDS;
  }

  private findConsulta(target: 'normal' | 'finsemana'): any | undefined {
    const name = target === 'normal' ? 'consulta medica' : 'consulta medica fin de semana';
    const code = target === 'normal' ? this.COD_CONSULTA_NORMAL : this.COD_CONSULTA_FDS;
    return this.productos.find(p =>
      this.norm(p?.nombre) === name || String(p?.codigoBarras) === code
    );
  }

  /**
   * Si el producto capturado es una "Consulta" incorrecta para el día:
   * - muestra un Swal informativo,
   * - intenta sustituir por la correcta,
   * - regresa el producto correcto o null si debe abortar.
   */
  private async guardConsultaMedica(producto: any): Promise<any | null> {
    const esFds = this.isWeekendToday();

    // Caso 1: es fin de semana, pero intentan "Consulta Médica" normal
    if (this.isConsultaNormal(producto) && esFds) {
      const correcto = this.findConsulta('finsemana');
      this.bloquearScanner = true;
      await Swal.fire({
        icon: 'info',
        title: 'Consulta válida en fin de semana',
        html: `
        Hoy es <b>${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()]}</b>.
        <br>Debes usar <b>Consulta Médica Fin de Semana</b>.
        ${correcto ? '<br><br>La sustituiremos automáticamente.' : '<br><br><span style="color:#b00">No se encontró la versión de fin de semana en catálogo.</span>'}
      `,
        confirmButtonText: 'Entendido',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => { const btn = Swal.getConfirmButton(); if (btn) btn.focus(); },
        willClose: () => { this.bloquearScanner = false; }
      });
      return correcto ?? null;
    }

    // Caso 2: es entre semana, pero intentan "Consulta Médica Fin de Semana"
    if (this.isConsultaFinSemana(producto) && !esFds) {
      const correcto = this.findConsulta('normal');
      this.bloquearScanner = true;
      await Swal.fire({
        icon: 'info',
        title: 'Consulta válida entre semana',
        html: `
        Hoy es <b>${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()]}</b>.
        <br>Debes usar <b>Consulta Médica</b>.
        ${correcto ? '<br><br>La sustituiremos automáticamente.' : '<br><br><span style="color:#b00">No se encontró la versión entre semana en catálogo.</span>'}
      `,
        confirmButtonText: 'Entendido',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => { const btn = Swal.getConfirmButton(); if (btn) btn.focus(); },
        willClose: () => { this.bloquearScanner = false; }
      });
      return correcto ?? null;
    }

    // OK para el día
    return producto;
  }

}

import { Component, OnInit, ChangeDetectorRef, ViewChild, HostListener, ElementRef, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, Validators, FormBuilder, FormGroup } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Producto } from '../../models/producto.model';
import { ModalOverlayService } from '../../services/modal-overlay.service';
import { ProductoService } from '../../services/producto.service';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faTimes, faPlus } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../../environments/environment';

import { catchError, firstValueFrom, from, mergeMap, of, tap } from 'rxjs';
import Swal from 'sweetalert2';

type ColumnaOrden = '' | keyof Producto | 'existencia';

// Ajusta los campos mínimos que ya usas en la vista
type ProductoUI = Omit<Producto, 'imagen'> & {
  imagen?: string | boolean | null; // ahora puede usar true/false
  _imgSrc?: string;                 // miniatura estable
  seleccionado?: boolean;
  modificado?: boolean;
};

@Component({
  selector: 'app-ajuste-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FontAwesomeModule, MatTooltipModule],
  templateUrl: './ajustes-inventario.component.html',
  styleUrls: ['./ajustes-inventario.component.css']
})
export class AjustesInventarioComponent implements OnInit {
  @ViewChild('backdrop') backdrop!: ElementRef<HTMLDivElement>;
  @ViewChild('firstInput') firstInput!: ElementRef<HTMLInputElement>;

  columnaOrden: ColumnaOrden = '';
  productos: ProductoUI[] = [];
  productosFiltrados: ProductoUI[] = [];
  formularioMasivo!: FormGroup;

  filtrando = false;
  iniciando = false;

  filtros: {
    nombre: string;
    codigoBarras: string;
    categoria: string;
    descuentoINAPAM: boolean | null;
    generico: boolean | null;
    bajoStock: boolean | null;
    duplicadosCB: boolean | null;
  } = {
      nombre: '',
      codigoBarras: '',
      categoria: '',
      descuentoINAPAM: null,
      generico: null,
      bajoStock: false,
      duplicadosCB: false,
    };

  paginaActual = 1;
  tamanioPagina = 15;
  //columnaOrden: keyof Producto | '' = '';
  direccionOrden: 'asc' | 'desc' = 'asc';
  diasSemana: string[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

  faTimes = faTimes;
  faPlus = faPlus;

  mostrarNuevoProducto = false;
  guardandoNuevo = false;
  nuevoProductoForm!: FormGroup;

  eliminandoId: string | null = null;

  thumbs: Record<string, string> = {};
  placeholderSrc = 'assets/images/farmBienIcon.png';


  // ajustes-inventario.component.ts (helper)
  imgUrl(p: any): string {
    const base = environment.apiUrl.replace(/\/+$/, ''); // https://tu-back
    const src = p?.imagen?.url || p?.imagen || '';      // lo que guardes en DB
    if (!src) return `${base}/assets/images/no-image.png`;
    const abs = /^(https?:|data:|blob:)/i.test(src) ? src : `${base}/${src.replace(/^\/+/, '')}`;
    const v = p?.updatedAt ? new Date(p.updatedAt).getTime() : Date.now();
    return abs + (abs.includes('?') ? '&' : '?') + 'v=' + v; // cache buster
  }


  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private modalService: ModalOverlayService,
    private productoService: ProductoService,
    library: FaIconLibrary,
    private renderer: Renderer2
  ) { library.addIcons(faPen, faTimes, faPlus); }

  ngOnInit(): void {
    this.iniciando = true;
    this.inicializarFormulario();
    this.cargarProductos(true);
    this.iniciando = false;
    this.formularioMasivo.valueChanges.subscribe(() => {
      this.cdr.detectChanges();
    });
    this.formularioMasivo.get('promosPorDia')?.valueChanges.subscribe(() => {
      this.cdr.detectChanges();
    });

    // 👇 inicializa form del modal
    this.nuevoProductoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      renglon1: [''],
      renglon2: [''],
      codigoBarras: ['', Validators.required],
      unidad: ['', Validators.required],
      precio: [null, [Validators.required, Validators.min(0)]],
      costo: [null, [Validators.required, Validators.min(0)]],
      iva: [false],
      stockMinimo: [50, [Validators.required, Validators.min(0)]],
      stockMaximo: [100, [Validators.required, Validators.min(0)]],
      ubicacion: [''],
      categoria: ['', Validators.required],
      generico: [false],
      descuentoINAPAM: [false]
    });

  }

  inicializarFormulario() {
    const promosPorDiaGroup: { [key: string]: FormGroup } = {};
    this.diasSemana.forEach(dia => {
      promosPorDiaGroup['promo' + dia] = this.fb.group({
        porcentaje: [null],
        inicio: [null],
        fin: [null],
        monedero: [null]
      });
    });

    this.formularioMasivo = this.fb.group({
      categoria: [null], ubicacion: [null], descuentoINAPAM: [null], stockMinimo: [null], stockMaximo: [null],
      ajustePrecioModo: [null], ajustePrecioPorcentaje: [null], ajustePrecioCantidad: [null],
      promoCantidadRequerida: [null], inicioPromoCantidad: [null], finPromoCantidad: [null],
      promoDeTemporadaPorcentaje: [null], promoDeTemporadaInicio: [null], promoDeTemporadaFin: [null],
      promoDeTemporadaMonedero: [null], promosPorDia: this.fb.group(promosPorDiaGroup)
    });
  }


  /** Quita acentos, pasa a minúsculas y colapsa espacios */
  private normTxt(v: any): string {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quita diacríticos
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Divide en palabras no vacías */
  private splitWords(v: string): string[] {
    return this.normTxt(v).split(' ').filter(Boolean);
  }

  aplicarFiltros() {
    if (this.filtrando || this.iniciando) return;
    this.filtrando = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      const f = this.filtros;
      const palabras = f?.nombre ? this.splitWords(f.nombre) : [];
      const palabrasCategoria = f?.categoria ? this.splitWords(f.categoria) : [];
      this.productosFiltrados = (this.productos || []).filter(p => {
        const nombreNorm = (p as any)._normNombre ?? this.normTxt(p?.nombre);
        const coincideNombre = palabras.length
          ? palabras.every(w => nombreNorm.includes(w))
          : true;
        const coincideCodigo = f.codigoBarras
          ? (p.codigoBarras || '').toLowerCase().includes(f.codigoBarras.toLowerCase())
          : true;
        const categoriaNorm = (p as any)._normCategoria ?? this.normTxt(p?.categoria);
        const coincideCategoria = palabrasCategoria.length
          ? palabrasCategoria.every(w => categoriaNorm.includes(w))
          : true;
        const coincideINAPAM = f.descuentoINAPAM === null
          ? true
          : p.descuentoINAPAM === f.descuentoINAPAM;
        const coincideGenerico = f.generico === null
          ? true
          : p.generico === f.generico;
        const coincideBajoStock = f.bajoStock
          ? this.getExistencia(p) < (p.stockMinimo ?? 0)
          : true;
        // 🔹 SOLO productos cuyo CB está repetido en la carga
        const coincideDuplicadosCB = f.duplicadosCB
          ? this.cbDuplicados.has(this.normCB(p?.codigoBarras))
          : true;

        return (
          coincideNombre &&
          coincideCodigo &&
          coincideCategoria &&
          coincideINAPAM &&
          coincideGenerico &&
          coincideBajoStock &&
          coincideDuplicadosCB
        );
      });

      this.paginaActual = 1;
      this.filtrando = false;
    }, 0);
  }

  private cbDuplicados = new Set<string>();

  private normCB(v: any): string {
    return String(v ?? '').trim().toLowerCase();
  }

  private cachearNorms(): void {
    for (const p of (this.productos || [])) {
      (p as any)._normNombre = this.normTxt(p?.nombre);
      (p as any)._normCategoria = this.normTxt(p?.categoria);
    }
  }

  // NUEVO: recalcula el set de duplicados a partir de this.productos
  private recomputarCBDuplicados(): void {
    const conteo = new Map<string, number>();
    for (const p of (this.productos || [])) {
      const cb = this.normCB(p?.codigoBarras);
      if (!cb) continue; // ignorar vacíos
      conteo.set(cb, (conteo.get(cb) || 0) + 1);
    }
    this.cbDuplicados = new Set(
      [...conteo.entries()].filter(([, n]) => n > 1).map(([cb]) => cb)
    );
  }

  limpiarFiltro(campo: keyof typeof this.filtros) {
    if (campo === 'descuentoINAPAM') this.filtros[campo] = null;
    if (campo === 'generico') this.filtros[campo] = null;
    if (campo === 'bajoStock') { this.filtros.bajoStock = false }
    if (campo === 'duplicadosCB') (this.filtros as any).duplicadosCB = false;
    if (campo === 'nombre' || campo === 'categoria' || campo === 'codigoBarras') this.filtros[campo] = '';

    this.aplicarFiltros();
  }


  get totalPaginas(): number {
    return Math.ceil(this.productosFiltrados.length / this.tamanioPagina);
  }

  get productosPagina(): ProductoUI[] {
    const i = (this.paginaActual - 1) * this.tamanioPagina;
    return this.productosFiltrados.slice(i, i + this.tamanioPagina);
  }

  limpiarCamposCambioMasivo() {
    this.formularioMasivo.reset();
  }

  aplicarCambiosMasivos() {
    const cambios = this.formularioMasivo.value;
    const productosSeleccionados = this.productosFiltrados.filter(p => p.seleccionado);

    if (productosSeleccionados.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Sin selección',
        text: 'Debes seleccionar al menos un producto para aplicar los cambios..',
        timer: 1600,
        timerProgressBar: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
      });
      return;
    }

    productosSeleccionados.forEach(producto => {
      Object.keys(cambios).forEach(campo => {
        if (cambios[campo] !== null && !['ajustePrecioModo', 'ajustePrecioPorcentaje', 'ajustePrecioCantidad'].includes(campo) && campo !== 'promosPorDia') {
          (producto as any)[campo] = cambios[campo];
        }
      });

      if (cambios.ajustePrecioModo === 'porcentaje' && cambios.ajustePrecioPorcentaje != null) {
        const porcentaje = cambios.ajustePrecioPorcentaje;
        const nuevoPrecio = producto.precio + (producto.precio * (porcentaje / 100));
        producto.precio = parseFloat(nuevoPrecio.toFixed(2));
      }
      if (cambios.ajustePrecioModo === 'cantidad' && cambios.ajustePrecioCantidad != null) {
        const cantidad = cambios.ajustePrecioCantidad;
        const nuevoPrecio = producto.precio + cantidad;
        producto.precio = parseFloat(nuevoPrecio.toFixed(2));
      }

      // Promo de Temporada
      if (
        cambios.promoDeTemporadaPorcentaje != null ||
        cambios.promoDeTemporadaInicio != null ||
        cambios.promoDeTemporadaFin != null ||
        cambios.promoDeTemporadaMonedero != null
      ) {
        producto.promoDeTemporada = {
          porcentaje: cambios.promoDeTemporadaPorcentaje ?? 0,
          inicio: new Date(cambios.promoDeTemporadaInicio),
          fin: new Date(cambios.promoDeTemporadaFin),
          monedero: cambios.promoDeTemporadaMonedero ?? false
        };
      }


      const promosPorDia = cambios.promosPorDia;
      this.diasSemana.forEach(dia => {
        const grupo = promosPorDia[`promo${dia}`];
        if (grupo?.porcentaje != null || grupo?.inicio != null || grupo?.fin != null || grupo?.monedero != null) {
          (producto as any)['promo' + dia] = {
            porcentaje: grupo.porcentaje ?? 0,
            inicio: grupo.inicio ? new Date(grupo.inicio) : null,
            fin: grupo.fin ? new Date(grupo.fin) : null,
            monedero: grupo.monedero ?? false
          };
        }
      });

      producto.modificado = true;
    });

    this.formularioMasivo.reset();

    this.grabarCambios();

  }

  get promosPorDiaForm(): FormGroup {
    return this.formularioMasivo.get('promosPorDia') as FormGroup;
  }


  get cambiosMasivosValidos(): boolean {
    const form = this.formularioMasivo.value;
    const { categoria, ubicacion, stockMinimo, stockMaximo, descuentoINAPAM, ajustePrecioModo, ajustePrecioPorcentaje, ajustePrecioCantidad,
      promoCantidadRequerida, inicioPromoCantidad, finPromoCantidad,
      promoDeTemporadaPorcentaje, promoDeTemporadaInicio, promoDeTemporadaFin, promoDeTemporadaMonedero } = form;

    const hayAlgunCambio = categoria != null || ubicacion != null || stockMinimo != null || stockMaximo != null || descuentoINAPAM != null || ajustePrecioModo != null ||
      promoCantidadRequerida != null || inicioPromoCantidad != null || finPromoCantidad != null ||
      promoDeTemporadaPorcentaje != null || promoDeTemporadaInicio != null || promoDeTemporadaFin != null || promoDeTemporadaMonedero != null ||
      this.hayCambiosEnPromosPorDia();

    if (!hayAlgunCambio) return false;

    if (ajustePrecioModo === 'porcentaje') {
      if (ajustePrecioPorcentaje == null || isNaN(ajustePrecioPorcentaje)) return false;
    }
    if (ajustePrecioModo === 'cantidad') {
      if (ajustePrecioCantidad == null || isNaN(ajustePrecioCantidad)) return false;
    }

    if (promoCantidadRequerida != null) {
      if (!inicioPromoCantidad || !finPromoCantidad) return false;
      if (new Date(inicioPromoCantidad) > new Date(finPromoCantidad)) return false;
    }

    const hayDatosTemporada = promoDeTemporadaPorcentaje != null || promoDeTemporadaInicio != null || promoDeTemporadaFin != null || promoDeTemporadaMonedero != null;

    if (hayDatosTemporada) {
      if (
        promoDeTemporadaPorcentaje == null ||
        isNaN(promoDeTemporadaPorcentaje) ||
        promoDeTemporadaPorcentaje <= 0 ||
        promoDeTemporadaPorcentaje > 100
      ) return false;

      if (!promoDeTemporadaInicio || !promoDeTemporadaFin) return false;

      if (new Date(promoDeTemporadaInicio) > new Date(promoDeTemporadaFin)) return false;
    }

    if (!this.validarPromosPorDia()) return false;

    return true;
  }

  hayCambiosEnPromosPorDia(): boolean {
    const promosPorDiaGroup = this.formularioMasivo.get('promosPorDia')?.value;
    if (!promosPorDiaGroup) return false;

    return this.diasSemana.some(dia => {
      const grupo = promosPorDiaGroup['promo' + dia];
      return grupo?.porcentaje != null || grupo?.inicio != null || grupo?.fin != null || grupo?.monedero != null;
    });
  }

  validarPromosPorDia(): boolean {
    const promosPorDia = this.formularioMasivo.get('promosPorDia')?.value;
    if (!promosPorDia) return true;

    for (let dia of this.diasSemana) {
      const grupo = promosPorDia[`promo${dia}`];
      if (!grupo) continue;

      const { porcentaje, inicio, fin } = grupo;

      const algunCampoCapturado = porcentaje != null || inicio != null || fin != null;

      // Si hay algún campo capturado, entonces deben cumplirse todas las condiciones
      if (algunCampoCapturado) {
        if (!inicio || !fin) return false;
        if (new Date(inicio) > new Date(fin)) return false;
        if (porcentaje == null || isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 100) return false;
      }
    }

    return true;
  }


  seleccionarTodos(event: any) {
    const checked = event.target.checked;
    this.productosFiltrados.forEach(p => p.seleccionado = checked);
  }

  editarProducto(prod: ProductoUI) {
    const productoClonado = JSON.parse(JSON.stringify(prod));
    this.modalService.abrirModal(productoClonado, (productoEditado: Producto) => {
      this.guardarProductoEditado(productoEditado);
    });
  }

  guardarProductoEditado(productoActualizado: ProductoUI) {
    
    // 1) separa id y crea payload sin _id
    const id = (productoActualizado as any)._id;
    const payload: any = { ...productoActualizado };
    delete payload._id;
    delete payload.__v;
    delete payload.createdAt;
    delete payload.updatedAt;

    // 2) normaliza numéricos (ajusta las llaves a tu modelo real)
    ['precioVenta', 'costo', 'existencia', 'iva', 'minimo', 'maximo'].forEach(k => {
      if (payload[k] !== undefined && payload[k] !== null) {
        payload[k] = Number(payload[k]) || 0;
      }
    });

    // 3) llama el servicio con id en la URL y body sin _id
    this.productoService.actualizarProductoIndividual(id, payload).subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: 'Éxito',
          text: 'Producto actualizado correctamente',
          timer: 1600,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false
        });
        this.cargarProductos(false);
      },
      error: (err) => {
        const msg = err?.error?.mensaje || err?.error?.message || err?.message || 'No se pudo actualizar el producto';
        Swal.fire('Error', msg, 'error');
        console.error('[actualizarProducto][ERROR]', err);
      }
    });
  }


  grabarCambios() {
    try {
      const productosModificados: ProductoUI[] = this.productos.filter(p => p.seleccionado);

      if (!productosModificados || productosModificados.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Sin selección',
          text: 'No hay productos seleccionados para actualizar.',
          timer: 1600,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        return;
      }

      Swal.fire({
        title: '¿Deseas guardar los cambios?',
        html: `Se actualizarán <b>${productosModificados.length}</b> productos.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, guardar',
        cancelButtonText: 'Cancelar',
        heightAuto: false
      }).then(result => {
        if (!result.isConfirmed) return;

        // ← opcional: forzar a que el popup quede arriba si tienes overlays personalizados
        Swal.fire({
          title: 'Guardando...',
          allowOutsideClick: false,
          allowEscapeKey: false,
          heightAuto: false,
          didOpen: () => Swal.showLoading()
        });

        // ⚠️ IMPORTANTE: el backend espera { productos: [...] }
        this.productoService.actualizarProductos({ productos: productosModificados as unknown as Producto[] }).subscribe({
          next: () => {
            Swal.close(); // cierra el loading
            Swal.fire({
              icon: 'success',
              title: 'Actualización exitosa',
              text: 'Los productos fueron actualizados correctamente.',
              timer: 1600,
              timerProgressBar: true,
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
            // refrescamos sin limpiar filtros
            this.cargarProductos(false);
            // limpiamos selección y el form de masivos
            this.productos.forEach(p => p.seleccionado = false);
            this.formularioMasivo.reset();
            // re-aplicar filtros por si el usuario tenía alguno
            this.aplicarFiltros();
          },
          error: (err) => {
            console.error('[grabarCambios] error HTTP:', err);
            Swal.close();
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: err?.error?.mensaje || 'Ocurrió un error inesperado al actualizar los productos.'
            });
          }
        });
      });
    } catch (e) {
      console.error('[grabarCambios] excepción:', e);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Hubo un problema al preparar la actualización.'
      });
    }
  }


  ordenar(columna: ColumnaOrden) {
    if (this.columnaOrden === columna) {
      this.direccionOrden = this.direccionOrden === 'asc' ? 'desc' : 'asc';
    } else {
      this.columnaOrden = columna;
      this.direccionOrden = 'asc';
    }

    this.productosFiltrados.sort((a, b) => {
      const valorA = (columna === 'existencia') ? this.getExistencia(a) : (a as any)?.[columna];
      const valorB = (columna === 'existencia') ? this.getExistencia(b) : (b as any)?.[columna];

      const aNum = typeof valorA === 'number' && !isNaN(valorA);
      const bNum = typeof valorB === 'number' && !isNaN(valorB);

      let comp: number;
      if (aNum && bNum) {
        comp = valorA - valorB;
      } else {
        const sA = (valorA ?? '').toString().toLowerCase();
        const sB = (valorB ?? '').toString().toLowerCase();
        comp = sA < sB ? -1 : sA > sB ? 1 : 0;
      }
      return this.direccionOrden === 'asc' ? comp : -comp;
    });

    this.paginaActual = 1;
  }


  getExistencia(p: ProductoUI): number {
    return Array.isArray(p?.lotes) ? p.lotes.reduce((sum, l) => sum + (Number(l?.cantidad) || 0), 0) : 0;
  }

  abrirNuevoProducto() {
    this.nuevoProductoForm.reset({
      nombre: '',
      codigoBarras: '',
      renglon1: '',
      renglon2: '',
      unidad: 'PZA',
      precio: null,
      costo: null,
      iva: false,
      stockMinimo: 20,
      stockMaximo: 60,
      ubicacion: '',
      categoria: '',
      generico: false,
      descuentoINAPAM: false
    });
    this.mostrarNuevoProducto = true;
    // Bloquear el scroll del body (opcional)
    this.renderer.addClass(document.body, 'no-scroll');

    // Enfocar overlay y primer input
    setTimeout(() => {
      this.backdrop?.nativeElement.focus();
      this.firstInput?.nativeElement.focus();
    });
  }

  cerrarNuevoProducto() {
    this.mostrarNuevoProducto = false;
    this.renderer.removeClass(document.body, 'no-scroll');
  }

  // guardar
  guardarNuevoProducto() {
    if (this.nuevoProductoForm.invalid) {
      this.nuevoProductoForm.markAllAsTouched();
      return;
    }

    const payload = this.nuevoProductoForm.value;

    // validación simple: stockMax >= stockMin
    if (payload.stockMaximo < payload.stockMinimo) {
      Swal.fire('Validación', 'El stock máximo debe ser mayor o igual al mínimo.', 'warning');
      return;
    }

    this.guardandoNuevo = true;

    this.productoService.crearProducto(payload).subscribe({
      next: (resp) => {
        this.guardandoNuevo = false;
        this.mostrarNuevoProducto = false;
        Swal.fire({
          icon: 'success',
          title: 'Listo',
          html: `Producto creado correctamente.<br>
                  Si deseas agregar promociones<br>
                  busca el producto en la tabla y editalo`,
          confirmButtonText: 'Aceptar',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        // recargar y mantener filtros
        this.cargarProductos(false);
      },
      error: (err) => {
        this.guardandoNuevo = false;
        console.error(err);
        Swal.fire('Error', err?.error?.mensaje || 'No se pudo crear el producto.', 'error');
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  trapTab(e: KeyboardEvent) {
    if (!this.mostrarNuevoProducto || e.key !== 'Tab' || !this.backdrop) return;
    const nodes: NodeListOf<HTMLElement> =
      this.backdrop.nativeElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && active === last) { first.focus(); e.preventDefault(); }
  }

  async confirmarEliminar(p: any) {
    const { isConfirmed } = await Swal.fire({
      icon: 'warning',
      title: 'Eliminar producto',
      html: `
        <p>Se eliminará <strong>${p?.nombre || ''}</strong>.</p>
        <p class="text-danger">También se eliminará de <strong>todas las farmacias</strong>.</p>
        <p>Esta acción no se puede deshacer.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!isConfirmed) return;

    try {
      this.eliminandoId = p._id;
      const resp = await firstValueFrom(this.productoService.eliminarProducto(p._id));

      // Quita el producto de las colecciones locales
      this.productos = (this.productos || []).filter((x: any) => x._id !== p._id);

      // Si tienes “duplicados de CB”, recalcula el set antes de filtrar
      if (typeof (this as any).recomputarCBDuplicados === 'function') {
        (this as any).recomputarCBDuplicados();
      }

      this.aplicarFiltros(); // repinta página actual
      Swal.fire('Eliminado', resp?.mensaje || 'Producto eliminado correctamente', 'success');
    } catch (err: any) {
      const msg = err?.error?.mensaje || err?.message || 'No se pudo eliminar el producto';
      Swal.fire('Error', msg, 'error');
    } finally {
      this.eliminandoId = null;
    }
  }


  subiendoId: string | null = null;
  imgCacheBuster: Record<string, number> = {}; // para bustear cache por producto

  // ✅ Usa primero la ruta guardada en BD (uploads/...) y luego el endpoint por id como respaldo
  imageUrl(p: any): string {
    if (!p?._id) return this.placeholderSrc;

    // 1) Si el producto ya tiene ruta en BD (uploads/xxx.ext), construye URL pública completa
    if (typeof p.imagen === 'string' && p.imagen.trim()) {
      const abs = this.productoService.getPublicImageUrl(p.imagen); // ← https://back.../uploads/xxx.ext
      const t = this.imgCacheBuster[p._id] || p.updatedAt || 0;
      return t ? `${abs}?t=${encodeURIComponent(String(t))}` : abs;
    }

    // 2) Fallback: endpoint del backend por id (/api/productos/:id/imagen)
    const base = this.productoService.obtenerImagenProductoUrl(p._id);
    const t = this.imgCacheBuster[p._id] || p.updatedAt || 0;
    return t ? `${base}?t=${encodeURIComponent(String(t))}` : base;
  }

  onFileChange(ev: Event, p: any) {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) return;
    this.onPickImage(file, p);
  }

  async onPickImage(file: File, p: ProductoUI) {
    if (!file || !p?._id) return;

    // 1) preview local
    const dataURL = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });

    // 2) preguntar
    const { isConfirmed } = await Swal.fire({
      title: (typeof p.imagen === 'string' && p.imagen.trim())
        ? '¿Reemplazar imagen?'
        : '¿Subir imagen?',
      html: `<img src="${dataURL}" style="max-width:100%;max-height:240px;border-radius:8px;">`,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar'
    });

    if (!isConfirmed) return;

    try {
      this.subiendoId = p._id;

      // 3) subir al backend
      const resp = await firstValueFrom(
        this.productoService.actualizarImagenProducto(p._id, file)
      );

      // el backend puede responder en varias formas
      const nuevaRuta = (resp && typeof resp.imagen === 'string' && resp.imagen.trim())
        ? resp.imagen.trim()
        : (resp && resp.producto && typeof resp.producto.imagen === 'string' && resp.producto.imagen.trim())
          ? resp.producto.imagen.trim()
          : '';

      if (nuevaRuta) {
        // guardar tal cual en el modelo (ya NO dejamos que sea boolean aquí)
        p.imagen = nuevaRuta;

        // armar URL pública y bustear cache
        const publico = this.productoService.getPublicImageUrl(nuevaRuta);
        const bust = Date.now();
        p._imgSrc = `${publico}?t=${bust}`;

        // para que otras partes del componente también sepan que cambió
        this.imgCacheBuster[p._id] = bust;
      } else {
        // respaldo: endpoint por id
        const base = this.productoService.obtenerImagenProductoUrl(p._id);
        const bust = Date.now();
        p._imgSrc = `${base}?t=${bust}`;
        this.imgCacheBuster[p._id] = bust;
      }

      await Swal.fire('Listo', 'Imagen guardada', 'success');
    } catch (e: any) {
      const msg = e?.error?.mensaje || 'No se pudo subir la imagen';
      await Swal.fire('Error', msg, 'error');
    } finally {
      this.subiendoId = null;
    }
  }

  cargarProductos(borrarFiltros: boolean) {
    this.productoService.obtenerProductos().subscribe({
      next: (productos) => {
        this.productos = (productos || []).map((p: any) => ({
          ...p,
          _imgSrc: p?.imagen
            ? this.productoService.getPublicImageUrl(p.imagen)
            : this.placeholderSrc,
        }));

        this.cachearNorms();
        this.recomputarCBDuplicados();

        if (borrarFiltros) {
          this.filtros = {
            nombre: '', codigoBarras: '', categoria: '',
            descuentoINAPAM: null, generico: null,
            bajoStock: false, duplicadosCB: false
          };
        }
        this.aplicarFiltros();
      },
      error: (err) => console.error('Error al cargar productos:', err)
    });
  }

  onImgError(ev: Event, p: any) {
    const img = ev.target as HTMLImageElement;
    if (!img) return;
    if (img.src !== this.placeholderSrc) {
      img.src = this.placeholderSrc;
      // cachea también en el modelo para que el zoom use el mismo placeholder
      const item = this.productos.find(x => x._id === p._id);
      if (item) item._imgSrc = this.placeholderSrc;
    }
  }


  trackProdBy = (_: number, p: ProductoUI) => p?._id ?? p?.codigoBarras ?? _;

  async openPreview(p: ProductoUI) {
    let url = (p?._imgSrc || '').trim();
    if (!url) url = this.placeholderSrc;

    try {
      await this.preload(url);
    } catch {
      url = this.placeholderSrc; // fallback duro si falla la carga
    }
    Swal.fire({
      width: 'auto',
      showConfirmButton: false,
      showCloseButton: true,
      background: '#000',
      padding: 0,
      html: `
      <div style="max-width:90vw;max-height:90vh;display:flex;align-items:center;justify-content:center">
        <img src="${url}" alt="" style="max-width:90vw;max-height:90vh;object-fit:contain" />
      </div>`
    });
  }


  private preload(src: string): Promise<void> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res();
      img.onerror = () => rej();
      img.src = src;
    });
  }

}


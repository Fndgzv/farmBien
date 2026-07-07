import { Component, OnInit, ChangeDetectorRef, ViewChild, HostListener, ElementRef, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, Validators, FormBuilder, FormGroup } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Producto } from '../../models/producto.model';
import { ModalOverlayService } from '../../services/modal-overlay.service';
import { ProductoService } from '../../services/producto.service';
import { ProveedorService } from '../../services/proveedor.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { Laboratorio, LaboratoriosService } from '../../services/laboratorios.service';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faTimes, faPlus } from '@fortawesome/free-solid-svg-icons';
import { environment } from '../../../environments/environment';
import * as XLSX from 'xlsx';

import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

type ColumnaOrden = '' | keyof Producto | 'existencia' | 'laboratorioNombre';

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

  mesesCaducidad = Array.from({ length: 12 }, (_, i) => i + 1);

  filtros: {
    nombre: string;
    codigoBarras: string;
    categoria: string;
    ubicacion: string;
    generico: boolean | null;
    bajoStock: boolean | null;
    duplicadosCB: boolean | null;
    laboratorioId: string | null;

    caducados: boolean | null;
    caducanEnMeses: number | null;
    ultimoProveedorId: string | null;
  } = {
      nombre: '',
      codigoBarras: '',
      categoria: '',
      ubicacion: '',
      generico: null,
      bajoStock: false,
      duplicadosCB: false,
      laboratorioId: null,

      caducados: false,
      caducanEnMeses: null,
      ultimoProveedorId: null,
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
  mostrarAltaLaboratorioNuevo = false;
  nuevoLaboratorioRapido = '';
  errorLaboratorioRapido = '';
  guardandoLaboratorioRapido = false;
  quitandoLotes = false;
  nuevoProductoForm!: FormGroup;

  eliminandoId: string | null = null;

  thumbs: Record<string, string> = {};
  placeholderSrc = 'assets/images/farmBienIcon.png';

  proveedores: any[] = [];
  laboratorios: Laboratorio[] = [];
  readonly valorLaboratorioSinAsignar = '__SIN__';

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
    private proveedorService: ProveedorService,
    private laboratoriosService: LaboratoriosService,
    private farmaciaService: FarmaciaService,
    library: FaIconLibrary,
    private renderer: Renderer2
  ) { library.addIcons(faPen, faTimes, faPlus); }

  ngOnInit(): void {
    this.iniciando = true;
    this.inicializarFormulario();
    this.cargarProductos(true);
    this.cargarProveedores();
    this.cargarLaboratorios();

    this.formularioMasivo.valueChanges.subscribe(() => {
      this.cdr.detectChanges();
    });
    this.formularioMasivo.get('promosPorDia')?.valueChanges.subscribe(() => {
      this.cdr.detectChanges();
    });

    // 👇 inicializa form del modal
    this.nuevoProductoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      ingreActivo: [''],
      renglon1: [''],
      renglon2: [''],
      codigoBarras: ['', Validators.required],
      unidad: ['', Validators.required],
      precio: [null, [Validators.required, Validators.min(0)]],
      costo: [null, [Validators.required, Validators.min(0)]],
      costoHonorariosMedicos: [0, [Validators.min(0)]],
      costoInsumosMedicos: [0, [Validators.min(0)]],
      iva: [false],
      stockMinimo: [50, [Validators.required, Validators.min(0)]],
      stockMaximo: [100, [Validators.required, Validators.min(0)]],
      ubicacion: [''],
      categoria: ['', Validators.required],
      laboratorio: [null],
      generico: [false]
    });

    this.nuevoProductoForm.get('categoria')?.valueChanges.subscribe((categoria) => {
      if (!this.esServicioMedicoCategoria(categoria)) {
        this.nuevoProductoForm.patchValue({
          costoHonorariosMedicos: 0,
          costoInsumosMedicos: 0
        }, { emitEvent: false });
      }
      this.actualizarCostoNuevoServicioMedico();
    });

    ['costoHonorariosMedicos', 'costoInsumosMedicos'].forEach((campo) => {
      this.nuevoProductoForm.get(campo)?.valueChanges.subscribe(() => {
        this.actualizarCostoNuevoServicioMedico();
      });
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
      categoria: [null], laboratorio: [null], ubicacion: [null], descuentoINAPAM: [null], stockMinimo: [null], stockMaximo: [null],
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

  private ordenarLaboratorios(data: Laboratorio[] = []): Laboratorio[] {
    return [...data].sort((a, b) =>
      String(a?.laboratorio || '').localeCompare(String(b?.laboratorio || ''), 'es', { sensitivity: 'base' })
    );
  }

  private obtenerLaboratorioId(valor: any): string | null {
    if (!valor) return null;
    if (typeof valor === 'object') {
      return this.obtenerLaboratorioId(valor._id || valor.id || valor.$oid || valor.laboratorio);
    }
    const id = String(valor || '').trim();
    return id && id !== '__SIN__' ? id : null;
  }

  private normalizarLaboratorioPayload(valor: any): string | null {
    return this.obtenerLaboratorioId(valor);
  }

  nombreLaboratorioProducto(producto: any): string {
    const nombreDirecto = String(producto?.laboratorioNombre || '').trim();
    if (nombreDirecto) return nombreDirecto;

    if (producto?.laboratorio && typeof producto.laboratorio === 'object') {
      const nombreObjeto = String(producto.laboratorio?.laboratorio || '').trim();
      if (nombreObjeto) return nombreObjeto;
    }

    const id = this.obtenerLaboratorioId(producto?.laboratorio);
    const encontrado = id ? this.laboratorios.find(l => l._id === id) : null;
    return encontrado?.laboratorio || 'Sin laboratorio';
  }

  async refrescarLaboratorios(): Promise<Laboratorio[]> {
    const data = await firstValueFrom(this.laboratoriosService.obtenerLaboratorios());
    this.laboratorios = this.ordenarLaboratorios(data || []);
    this.cdr.detectChanges();
    return this.laboratorios;
  }

  cargarLaboratorios(): void {
    this.refrescarLaboratorios().catch((err) => {
      console.error('Error al cargar laboratorios:', err);
    });
  }

  private resolverLaboratorioCreadoId(creado: Laboratorio | any, laboratorios: Laboratorio[]): string | null {
    return creado?._id
      || laboratorios.find(l => this.normTxt(l.laboratorio) === this.normTxt(creado?.laboratorio))?._id
      || null;
  }

  private seleccionarLaboratorioCreado(destino: 'nuevo' | 'masivo', laboratorioId: string): void {
    if (destino === 'masivo') {
      this.formularioMasivo.patchValue({ laboratorio: laboratorioId });
    } else {
      this.nuevoProductoForm.patchValue({ laboratorio: laboratorioId });
    }
  }

  abrirAltaLaboratorioNuevo(): void {
    this.nuevoLaboratorioRapido = '';
    this.errorLaboratorioRapido = '';
    this.mostrarAltaLaboratorioNuevo = true;
  }

  cancelarAltaLaboratorioNuevo(): void {
    if (this.guardandoLaboratorioRapido) return;
    this.mostrarAltaLaboratorioNuevo = false;
    this.nuevoLaboratorioRapido = '';
    this.errorLaboratorioRapido = '';
  }

  async guardarLaboratorioRapidoNuevo(): Promise<void> {
    if (this.guardandoLaboratorioRapido) return;

    const nombre = String(this.nuevoLaboratorioRapido || '').trim();
    if (!nombre) {
      this.errorLaboratorioRapido = 'Captura el nombre del laboratorio.';
      return;
    }

    this.guardandoLaboratorioRapido = true;
    this.errorLaboratorioRapido = '';

    try {
      const resp: any = await firstValueFrom(this.laboratoriosService.crearLaboratorio({ laboratorio: nombre }));
      const laboratorios = await this.refrescarLaboratorios();
      const idCreado = this.resolverLaboratorioCreadoId(resp?.laboratorio || resp, laboratorios);

      if (idCreado) {
        this.seleccionarLaboratorioCreado('nuevo', idCreado);
      }

      this.mostrarAltaLaboratorioNuevo = false;
      this.nuevoLaboratorioRapido = '';
    } catch (err: any) {
      this.errorLaboratorioRapido = err?.error?.mensaje || 'No se pudo crear el laboratorio.';
    } finally {
      this.guardandoLaboratorioRapido = false;
      this.cdr.detectChanges();
    }
  }

  async agregarLaboratorioRapido(destino: 'nuevo' | 'masivo' = 'nuevo'): Promise<void> {
    if (destino === 'nuevo' && this.mostrarNuevoProducto) {
      this.abrirAltaLaboratorioNuevo();
      return;
    }

    const resultado = await Swal.fire({
      title: 'Nuevo laboratorio',
      input: 'text',
      inputLabel: 'Laboratorio',
      inputPlaceholder: 'Nombre del laboratorio',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        return String(value || '').trim() ? null : 'Captura el nombre del laboratorio.';
      },
      preConfirm: async (value) => {
        try {
          const nombre = String(value || '').trim();
          const resp: any = await firstValueFrom(this.laboratoriosService.crearLaboratorio({ laboratorio: nombre }));
          return resp?.laboratorio || resp;
        } catch (err: any) {
          const msg = err?.error?.mensaje || 'No se pudo crear el laboratorio.';
          Swal.showValidationMessage(msg);
          return false;
        }
      },
      allowOutsideClick: () => !Swal.isLoading(),
    });

    if (!resultado.isConfirmed || !resultado.value) return;

    const laboratorios = await this.refrescarLaboratorios();
    const creado = resultado.value as Laboratorio;
    const idCreado = this.resolverLaboratorioCreadoId(creado, laboratorios);

    if (!idCreado) return;
    this.seleccionarLaboratorioCreado(destino, idCreado);
  }

  esServicioMedicoCategoria(categoria: any): boolean {
    return this.normTxt(categoria) === 'servicio medico';
  }

  mostrarCostosMedicosNuevo(): boolean {
    return this.esServicioMedicoCategoria(this.nuevoProductoForm?.get('categoria')?.value);
  }

  private actualizarCostoNuevoServicioMedico(): void {
    if (!this.mostrarCostosMedicosNuevo()) return;

    const costo = this.calcularCostoMedico(
      this.nuevoProductoForm.get('costoHonorariosMedicos')?.value,
      this.nuevoProductoForm.get('costoInsumosMedicos')?.value
    );

    this.nuevoProductoForm.patchValue({ costo }, { emitEvent: false });
  }

  private limpiarCamposPromocionProducto(payload: any): void {
    [
      'descuentoINAPAM',
      'promoLunes',
      'promoMartes',
      'promoMiercoles',
      'promoJueves',
      'promoViernes',
      'promoSabado',
      'promoDomingo',
      'promoCantidadRequerida',
      'inicioPromoCantidad',
      'finPromoCantidad',
      'promoDeTemporada',
      'promosPorDia'
    ].forEach((campo) => delete payload[campo]);
  }

  private prepararCostosMedicosPayload(payload: any): void {
    if (!this.esServicioMedicoCategoria(payload?.categoria)) {
      payload.costoHonorariosMedicos = 0;
      payload.costoInsumosMedicos = 0;
      return;
    }

    payload.costoHonorariosMedicos = this.numeroNoNegativo(payload.costoHonorariosMedicos);
    payload.costoInsumosMedicos = this.numeroNoNegativo(payload.costoInsumosMedicos);
    payload.costo = this.calcularCostoMedico(
      payload.costoHonorariosMedicos,
      payload.costoInsumosMedicos
    );
  }

  private numeroNoNegativo(value: any): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  private calcularCostoMedico(honorarios: any, insumos: any): number {
    return this.numeroNoNegativo(honorarios) + this.numeroNoNegativo(insumos);
  }

  aplicarFiltros() {
    if (this.filtrando || this.iniciando) return;
    this.filtrando = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      const f = this.filtros;
      const palabras = f?.nombre ? this.splitWords(f.nombre) : [];
      const palabrasCategoria = f?.categoria ? this.splitWords(f.categoria) : [];
      const palabrasUbicacion = f?.ubicacion ? this.splitWords(f.ubicacion) : [];
      this.productosFiltrados = (this.productos || []).filter(p => {

        const coincideCaducados = f.caducados
          ? (Number((p as any).cantidadCaducada ?? 0) > 0)
          : true;

        const provIdProd =
          (p as any).ultimoProveedorId?._id ??
          (p as any).ultimoProveedorId ??
          null;

        const coincideProveedor =
          f.ultimoProveedorId === null
            ? true
            : f.ultimoProveedorId === '__SIN__'
              ? (provIdProd === null || provIdProd === undefined || provIdProd === '')
              : String(provIdProd ?? '') === String(f.ultimoProveedorId);

        const laboratorioIdProd = this.obtenerLaboratorioId((p as any).laboratorio);
        const coincideLaboratorio = (() => {
          if (f.laboratorioId === null) return true;
          if (f.laboratorioId === this.valorLaboratorioSinAsignar) return laboratorioIdProd === null;
          return String(laboratorioIdProd ?? '') === String(f.laboratorioId);
        })();

        const coincideCaducanEn = (() => {
          if (f.caducanEnMeses === null) return true;

          const prox = this.toDate((p as any).proximaCaducidad);
          if (!prox) return false;

          // "fin de hoy" CDMX => inicio de mañana 00:00 local
          const inicioManana = this.inicioMananaLocal(new Date());
          // tope = inicio de mañana + N meses
          const limite = this.addMonths(inicioManana, f.caducanEnMeses);

          // solo FUTURAS (>= mañana 00:00) y dentro del rango
          return prox >= inicioManana && prox < limite;
        })();

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
        const ubicacionNorm = (p as any)._normUbicacion ?? this.normTxt(p?.ubicacion);
        const coincideUbicacion = palabrasUbicacion.length
          ? palabrasUbicacion.every(w => ubicacionNorm.includes(w))
          : true;
        const coincideGenerico = f.generico === null
          ? true
          : p.generico === f.generico;
        const coincideBajoStock = f.bajoStock
          ? p.existencia < (p.stockMinimo ?? 0)
          : true;
        // 🔹 SOLO productos cuyo CB está repetido en la carga
        const coincideDuplicadosCB = f.duplicadosCB
          ? this.cbDuplicados.has(this.normCB(p?.codigoBarras))
          : true;

        return (
          coincideNombre &&
          coincideCodigo &&
          coincideCategoria &&
          coincideUbicacion &&
          /* coincideINAPAM && */
          coincideGenerico &&
          coincideBajoStock &&
          coincideDuplicadosCB &&
          coincideCaducados &&
          coincideCaducanEn &&
          coincideLaboratorio &&
          coincideProveedor
        );
      });

      this.paginaActual = 1;
      this.filtrando = false;
    }, 0);
  }

  onToggleCaducados() {
    if (this.filtros.caducados) {
      // si activa caducados, limpiar "caducan en"
      this.filtros.caducanEnMeses = null;
    }
    this.aplicarFiltros();
  }

  onChangeCaducanEn() {
    if (this.filtros.caducanEnMeses !== null) {
      // si selecciona "caducan en", apagar caducados
      this.filtros.caducados = false;
    }
    this.aplicarFiltros();
  }


  private inicioMananaLocal(d = new Date()): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() + 1); // mañana 00:00
    return x;
  }

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);

    // ajuste típico por meses cortos (31 -> 30/28)
    if (d.getDate() < day) d.setDate(0);
    return d;
  }

  private toDate(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }


  private cbDuplicados = new Set<string>();

  private normCB(v: any): string {
    return String(v ?? '').trim().toLowerCase();
  }

  private cachearNorms(): void {
    for (const p of (this.productos || [])) {
      (p as any)._normNombre = this.normTxt(p?.nombre);
      (p as any)._normCategoria = this.normTxt(p?.categoria);
      (p as any)._normUbicacion = this.normTxt(p?.ubicacion);
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

  /* limpiarFiltro(campo: keyof typeof this.filtros) {
    if (campo === 'bajoStock') { this.filtros.bajoStock = false }
    if (campo === 'duplicadosCB') (this.filtros as any).duplicadosCB = false;
    if (campo === 'nombre' || campo === 'categoria' || campo === 'codigoBarras') this.filtros[campo] = '';

    this.aplicarFiltros();
  } */

  limpiarFiltro(campo: string) {
    switch (campo) {
      case 'nombre': this.filtros.nombre = ''; break;
      case 'codigoBarras': this.filtros.codigoBarras = ''; break;
      case 'categoria': this.filtros.categoria = ''; break;
      case 'ubicacion': this.filtros.ubicacion = ''; break;
      case 'generico': this.filtros.generico = null; break;
      case 'bajoStock': this.filtros.bajoStock = false; break;
      case 'duplicadosCB': this.filtros.duplicadosCB = false; break;
      case 'laboratorioId': this.filtros.laboratorioId = null; break;

      case 'caducados': this.filtros.caducados = false; break;
      case 'caducanEnMeses': this.filtros.caducanEnMeses = null; break;
      case 'ultimoProveedorId': this.filtros.ultimoProveedorId = null; break;
    }
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

  private formatearMesAnioExcel(fecha: any): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';
    const txt = d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
    return txt.replace('.', '');
  }

  private stampArchivo(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  exportarExcelFiltrados() {
    const registros = Array.isArray(this.productosFiltrados) ? this.productosFiltrados : [];

    if (!registros.length) {
      Swal.fire('Sin registros', 'No hay productos filtrados para exportar.', 'info');
      return;
    }

    try {
      const data = registros.map((p, idx) => ({
        No: idx + 1,
        Nombre: String(p?.nombre || '').trim(),
        CodigoBarras: String(p?.codigoBarras || '').trim(),
        Categoria: String(p?.categoria || '').trim(),
        Laboratorio: this.nombreLaboratorioProducto(p),
        Ubicacion: String(p?.ubicacion || '').trim(),
        Existencia: Number(p?.existencia ?? 0),
        StockMinimo: Number(p?.stockMinimo ?? 0),
        StockMaximo: Number(p?.stockMaximo ?? 0),
        Costo: Number(p?.costo ?? 0),
        UltimoProveedor: String((p as any)?.ultimoProveedorNombre || '').trim(),
        FechaProxCad: this.formatearMesAnioExcel((p as any)?.proximaCaducidad),
        CantProxCaduc: Number((p as any)?.cantidadProximaCaducidad ?? 0),
        FechaCaducos: this.formatearMesAnioExcel((p as any)?.fechaCaducos),
        CantCaducada: Number((p as any)?.cantidadCaducada ?? 0),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'AjustesInventario');
      XLSX.writeFile(wb, `ajustes-inventario-filtrados-${this.stampArchivo()}.xlsx`);
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'No se pudo exportar el archivo de Excel.', 'error');
    }
  }

  private obtenerFarmaciaActivaId(): string | null {
    const directa = String(localStorage.getItem('farmaciaActivaId') || '').trim();
    if (directa) return directa;

    try {
      const raw = localStorage.getItem('user_farmacia');
      const farmacia = raw ? JSON.parse(raw) : null;
      const id = String(farmacia?._id || '').trim();
      return id || null;
    } catch {
      return null;
    }
  }

  private async solicitarFirmaFarmaciaActiva(farmaciaId: string): Promise<boolean> {
    const firmaInput = await Swal.fire({
      title: 'Autorización requerida',
      html: `
        <p>Ingresa la firma de la farmacia activa para continuar.</p>
        <div id="firma-container"></div>
      `,
      didOpen: () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'firma-autorizada';
        input.placeholder = 'Ingrese la firma';
        input.autocomplete = 'off';
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
          const res = await firstValueFrom(this.farmaciaService.verificarFirma(farmaciaId, input));
          if (!res?.autenticado) {
            Swal.showValidationMessage('Firma incorrecta. Verifica con el encargado.');
            if (confirmButton) confirmButton.disabled = false;
            return false;
          }
          return true;
        } catch (err: any) {
          const status = err?.status;
          const msg = err?.error?.mensaje || err?.error?.msg || err?.message || '';

          if (status === 0) {
            Swal.showValidationMessage('No hay conexión con el servidor (red/CORS/proxy).');
          } else if (status === 401) {
            Swal.showValidationMessage('Sesión inválida/expirada. Cierra sesión e inicia de nuevo.');
          } else if (status === 403) {
            Swal.showValidationMessage('No autorizado para verificar firma.');
          } else {
            Swal.showValidationMessage(`Error al verificar firma (${status || '??'}). ${msg}`.trim());
          }

          if (confirmButton) confirmButton.disabled = false;
          return false;
        }
      },
    });

    return !!firmaInput.isConfirmed;
  }

  async quitarLotesSeleccionados() {
    const productosSeleccionados = this.productosFiltrados.filter(p => p.seleccionado);

    if (!productosSeleccionados.length) {
      await Swal.fire({
        icon: 'warning',
        title: 'Sin selección',
        text: 'Debes seleccionar al menos un producto para quitar lotes.',
      });
      return;
    }

    const confirmacion = await Swal.fire({
      icon: 'warning',
      title: 'Quitar lotes',
      html: `
        Se borrarán todos los lotes de todos los productos seleccionados y las existencias quedarán en CERO.
        <br/><br/>¿Deseas continuar?
      `,
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
    });

    if (!confirmacion.isConfirmed) return;

    const farmaciaId = this.obtenerFarmaciaActivaId();
    if (!farmaciaId) {
      await Swal.fire('Error', 'No se encontró una farmacia activa para validar firma.', 'error');
      return;
    }

    const firmaValida = await this.solicitarFirmaFarmaciaActiva(farmaciaId);
    if (!firmaValida) return;

    const productoIds = [...new Set(productosSeleccionados
      .map((p: any) => String(p?._id || '').trim())
      .filter(Boolean)
    )];

    if (!productoIds.length) {
      await Swal.fire('Error', 'No se encontraron IDs válidos de productos seleccionados.', 'error');
      return;
    }

    this.quitandoLotes = true;

    try {
      Swal.fire({
        title: 'Quitando lotes...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
      });

      const resp: any = await firstValueFrom(this.productoService.quitarLotesMasivo({ productoIds }));

      Swal.close();
      await Swal.fire(
        'Listo',
        resp?.mensaje || 'Se quitaron los lotes de los productos seleccionados y las existencias quedaron en cero.',
        'success'
      );

      this.cargarProductos(false);
      this.productos.forEach(p => p.seleccionado = false);
      this.productosFiltrados.forEach(p => p.seleccionado = false);
    } catch (err: any) {
      Swal.close();
      const msg = err?.error?.mensaje || err?.error?.msg || err?.message || 'No se pudieron quitar los lotes seleccionados.';
      await Swal.fire('Error', msg, 'error');
    } finally {
      this.quitandoLotes = false;
    }
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
          if (campo === 'laboratorio') {
            const laboratorioId = cambios[campo] === '__SIN__' ? null : cambios[campo];
            (producto as any).laboratorio = laboratorioId;
            (producto as any).laboratorioNombre = laboratorioId
              ? this.laboratorios.find(l => l._id === laboratorioId)?.laboratorio || null
              : null;
            return;
          }

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
    const { categoria, laboratorio, ubicacion, stockMinimo, stockMaximo, descuentoINAPAM, ajustePrecioModo, ajustePrecioPorcentaje, ajustePrecioCantidad,
      promoCantidadRequerida, inicioPromoCantidad, finPromoCantidad,
      promoDeTemporadaPorcentaje, promoDeTemporadaInicio, promoDeTemporadaFin, promoDeTemporadaMonedero } = form;

    const hayAlgunCambio = categoria != null || laboratorio != null || ubicacion != null || stockMinimo != null || stockMaximo != null || descuentoINAPAM != null || ajustePrecioModo != null ||
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

    this.modalService.abrirModal(
      { producto: productoClonado, proveedores: this.proveedores }, // ✅ mandamos proveedores
      (productoEditado: Producto) => {
        this.guardarProductoEditado(productoEditado);
      }
    );
  }


  guardarProductoEditado(productoActualizado: ProductoUI) {

    const id = (productoActualizado as any)._id;
    const payload: any = { ...productoActualizado };
    delete payload._id;
    delete payload.__v;
    delete payload.createdAt;
    delete payload.updatedAt;

    // ✅ normaliza numéricos reales
    ['precio', 'costo', 'stockMinimo', 'stockMaximo', 'costoHonorariosMedicos', 'costoInsumosMedicos'].forEach(k => {
      if (payload[k] !== undefined && payload[k] !== null && payload[k] !== '') {
        payload[k] = Number(payload[k]);
      }
    });

    this.limpiarCamposPromocionProducto(payload);
    this.prepararCostosMedicosPayload(payload);

    // iva y generico son boolean
    // ultimoProveedorId se manda tal cual (string o null)
    if (payload.ultimoProveedorId === '') payload.ultimoProveedorId = null;
    payload.laboratorio = this.normalizarLaboratorioPayload(payload.laboratorio);
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
        const productosPayload = productosModificados.map((p) => ({
          ...p,
          laboratorio: this.normalizarLaboratorioPayload((p as any).laboratorio)
        }));

        this.productoService.actualizarProductos({ productos: productosPayload as unknown as Producto[] }).subscribe({
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
      const valorA = columna === 'laboratorioNombre'
        ? this.nombreLaboratorioProducto(a)
        : (a as any)?.[columna];
      const valorB = columna === 'laboratorioNombre'
        ? this.nombreLaboratorioProducto(b)
        : (b as any)?.[columna];

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
    });;

    this.paginaActual = 1;
  }

  abrirNuevoProducto() {
    this.nuevoProductoForm.reset({
      nombre: '',
      ingreActivo: '',
      codigoBarras: '',
      renglon1: '',
      renglon2: '',
      unidad: 'PZA',
      precio: null,
      costo: null,
      costoHonorariosMedicos: 0,
      costoInsumosMedicos: 0,
      iva: false,
      stockMinimo: 10,
      stockMaximo: 20,
      ubicacion: '',
      categoria: '',
      laboratorio: null,
      generico: false
    });
    this.mostrarAltaLaboratorioNuevo = false;
    this.nuevoLaboratorioRapido = '';
    this.errorLaboratorioRapido = '';
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
    this.mostrarAltaLaboratorioNuevo = false;
    this.nuevoLaboratorioRapido = '';
    this.errorLaboratorioRapido = '';
    this.renderer.removeClass(document.body, 'no-scroll');
  }

  // guardar
  guardarNuevoProducto() {
    if (this.nuevoProductoForm.invalid) {
      this.nuevoProductoForm.markAllAsTouched();
      return;
    }

    const payload = { ...this.nuevoProductoForm.value };
    payload.laboratorio = this.normalizarLaboratorioPayload(payload.laboratorio);
    this.limpiarCamposPromocionProducto(payload);
    this.prepararCostosMedicosPayload(payload);

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
                  hazlo por farmacia en:<br>
                  Catálogos/Farmacias/Inventario`,
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
      const msg = err?.error?.mensaje || err?.error?.message || err?.message || 'No se pudo eliminar el producto';
      const title = err?.status === 409 ? 'No se puede eliminar' : 'Error';
      const icon = err?.status === 409 ? 'warning' : 'error';
      Swal.fire(title, msg, icon);
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
    this.iniciando = true;
    this.cdr.detectChanges();
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
            ubicacion: '',
            /* descuentoINAPAM: null,*/ generico: null,
            bajoStock: false, duplicadosCB: false,
            laboratorioId: null,
            caducados: false, caducanEnMeses: null, ultimoProveedorId: null
          };
        }
        this.aplicarFiltros();
      },
      error: (err) => console.error('Error al cargar productos:', err)
    });
    this.iniciando = false;
  }

  cargarProveedores(): void {
    this.proveedorService.obtenerProveedores().subscribe({
      next: (data: any[]) => {
        this.proveedores = (data || []).sort((a, b) =>
          (a?.nombre ?? '').localeCompare(b?.nombre ?? '', 'es', { sensitivity: 'base' })
        );
        console.log('proveedores cargados:', this.proveedores);
        this.iniciando = false;
        this.cdr.detectChanges(); // por si acaso
      },
      error: (err) => {
        console.error('Error al cargar proveedores:', err);
      }
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


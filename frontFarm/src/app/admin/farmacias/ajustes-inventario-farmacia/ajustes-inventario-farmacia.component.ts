import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { InventarioFarmaciaService } from '../../../services/inventario-farmacia.service';
import { FarmaciaService } from '../../../services/farmacia.service';
import Swal from 'sweetalert2';
import { finalize } from 'rxjs/operators';

import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faSpinner, faCheck, faSave, faPen, faTimes, faTags } from '@fortawesome/free-solid-svg-icons';
import { PromosInventarioDialogComponent } from './promos-inventario-dialog.component';


@Component({
  selector: 'app-ajustes-inventario-farmacia',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FaIconComponent,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './ajustes-inventario-farmacia.component.html',
  styleUrl: './ajustes-inventario-farmacia.component.css'
})
export class AjustesInventarioFarmaciaComponent implements OnInit {

  farmaciaId: string | null = null;

  formFiltros!: FormGroup;
  inventario: any[] = [];
  farmacias: any[] = [];


  aplicandoMasivoPromosPrecio = false;

  cmOpen = false;

  diasMasivo = [
    { key: 'promoLunes', label: 'Lunes' },
    { key: 'promoMartes', label: 'Martes' },
    { key: 'promoMiercoles', label: 'Miércoles' },
    { key: 'promoJueves', label: 'Jueves' },
    { key: 'promoViernes', label: 'Viernes' },
    { key: 'promoSabado', label: 'Sábado' },
    { key: 'promoDomingo', label: 'Domingo' },
  ];

  // estado UI masivo
  masivo = this.buildMasivoState();

  ajusteMasivo: { precioVenta: any, existencia: any; stockMax: any; stockMin: any; ubicacionFarmacia: string } = {
    precioVenta: '',
    existencia: '',
    stockMax: '',
    stockMin: '',
    ubicacionFarmacia: ''
  };

  estadoEdicion: { [key: string]: boolean } = {}; // clave: id del producto
  edicionPromos: boolean = true;

  paginaActual = 1;
  tamanoPagina = 15;

  faSpinner = faSpinner;
  faCheck = faCheck;
  faSave = faSave;
  faEdit = faPen;
  faTimes = faTimes;
  faTags = faTags;

  estadoGuardado: { [key: string]: 'idle' | 'guardando' | 'exito' } = {};
  cargando = false;
  aplicandoCambiosMasivos = false;

  sortBy: 'existencia' | 'nombre' = 'existencia';
  sortDir: 'asc' | 'desc' = 'asc';

  constructor(
    private fb: FormBuilder,
    private inventarioService: InventarioFarmaciaService,
    private farmaciaService: FarmaciaService,
    private dialog: MatDialog,
    library: FaIconLibrary
  ) { library.addIcons(faSave, faSpinner, faCheck, faTags); }

  ngAfterViewInit() {
    const v = localStorage.getItem('cmOpen');
    this.cmOpen = v === '1';
  }


  ngOnInit(): void {
    this.formFiltros = this.fb.group({
      farmacia: [''],
      nombre: [''],
      codigoBarras: [''],
      categoria: [''],
      inapam: [''],
      generico: [''],
      ubicacionFarmacia: ['']
    });

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
      return;
    }

    if (farmacia) {
      this.farmaciaId = farmacia._id;
    }

    this.cargarFarmacias();
  }

  onToggleCambiosMasivos(ev: Event) {
    const el = ev.target as HTMLDetailsElement;
    localStorage.setItem('cmOpen', el.open ? '1' : '0');
  }
  
  cargarFarmacias() {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (resp) => {
        this.farmacias = Array.isArray(resp) ? resp : [];

        const ctrl = this.formFiltros.get('farmacia');
        if (!ctrl) return;

        if (this.farmacias.length === 0) {
          ctrl.reset('');
          return;
        }

        // intenta seleccionar la que está en this.farmaciaId
        const match = this.farmacias.find(f => f?._id === this.farmaciaId);
        const valorInicial = match ? match._id : this.farmacias[0]._id;

        ctrl.setValue(valorInicial);
        this.buscar(); // dispara la búsqueda automáticamente
      },
      error: () => {
        this.farmacias = [];
        this.formFiltros.get('farmacia')?.reset('');
      }
    });
  }

  buscar() {
    const filtros = this.formFiltros.value;
    if (!filtros.farmacia) {
      Swal.fire({
        icon: 'info',
        title: 'Aviso',
        text: 'Debes de seleccionar una farmacia.',
        timer: 1600,
        timerProgressBar: true,
        allowOutsideClick: false,
        allowEscapeKey: false
      });
      return;
    }
    this.cargando = true;

    const params = {
      ...filtros,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    };

    this.inventarioService.buscarInventarioFarmacia(params).subscribe({
      next: (resp) => {
        this.estadoEdicion = {};
        this.inventario = resp.map((item: any) => ({
          ...item,
          copiaOriginal: {
            existencia: item.existencia,
            stockMax: item.stockMax,
            stockMin: item.stockMin,
            precioVenta: item.precioVenta,
            ubicacionFarmacia: item.ubicacionFarmacia,
          }
        }));
        this.paginaActual = 1;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al buscar inventario', err);
        this.inventario = [];
        this.cargando = false;
      }
    });
  }

  clickSortExistencia() {
    this.sortBy = 'existencia';
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.buscar();
  }

  clickSortNombre() {
    this.sortBy = 'nombre';
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.buscar();
  }

  seleccionarTodos(event: any) {
    const checked = event.target.checked;
    this.inventario.forEach(p => p.seleccionado = checked);
  }

  guardarAjusteMasivo() {
    const farmacia = this.formFiltros.get('farmacia')?.value;
    if (!farmacia) return;

    this.aplicandoCambiosMasivos = true;

    // 1) Lee valores crudos, sin convertir
    const exRaw = this.ajusteMasivo.existencia;
    const mxRaw = this.ajusteMasivo.stockMax;
    const mnRaw = this.ajusteMasivo.stockMin;
    const prRaw = this.ajusteMasivo.precioVenta;
    const ubRaw = (this.ajusteMasivo.ubicacionFarmacia ?? '').toString().trim();

    // 2) Detecta si el usuario realmente escribió algo
    const hasEx = exRaw !== '' && exRaw !== null && exRaw !== undefined;
    const hasMx = mxRaw !== '' && mxRaw !== null && mxRaw !== undefined;
    const hasMn = mnRaw !== '' && mnRaw !== null && mnRaw !== undefined;
    const hasPr = prRaw !== '' && prRaw !== null && prRaw !== undefined;
    const hasUb = ubRaw.length > 0; // si quieres permitir vaciar explícitamente, lo vemos con un checkbox aparte

    // 3) Si no hay ningún campo capturado, avisa y sal
    if (!hasEx && !hasMx && !hasMn && !hasUb && !hasPr) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire({
        icon: 'info',
        title: 'Aviso',
        text: 'No hay productos seleccionados o no hay cambios para aplicar.',
        timer: 1600,
        timerProgressBar: true
      });
      return;
    }

    // 4) Convierte a número SOLO lo que sí capturó el usuario
    const exNum = hasEx ? Number(exRaw) : NaN;
    const mxNum = hasMx ? Number(mxRaw) : NaN;
    const mnNum = hasMn ? Number(mnRaw) : NaN;
    const prNum = hasPr ? Number(prRaw) : NaN;

    // 5) Validaciones solo sobre campos presentes
    if (hasEx && (!Number.isInteger(exNum) || exNum < 0)) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire('Valor inválido', 'La existencia debe ser entero no negativo.', 'warning');
      return;
    }
    if (hasMx && (!Number.isInteger(mxNum) || mxNum <= 0)) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire('Valor inválido', 'El stock máximo debe ser entero mayor a 0.', 'warning');
      return;
    }
    if (hasMn && (!Number.isInteger(mnNum) || mnNum <= 0)) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire('Valor inválido', 'El stock mínimo debe ser entero mayor a 0.', 'warning');
      return;
    }
    if (hasPr && prNum <= 0) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire('Valor inválido', 'El precio debe ser mayor a 0.', 'warning');
      return;
    }
    if (hasMx && hasMn && mnNum > mxNum) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire('Stock inválido', 'El stock mínimo no puede ser mayor que el stock máximo.', 'warning');
      return;
    }

    // 6) Filtra seleccionados con diferencias REALES
    const productosAjustar = this.inventario.filter(p => {
      const difEx = hasEx && p.existencia !== exNum;
      const difMx = hasMx && p.stockMax !== mxNum;
      const difMn = hasMn && p.stockMin !== mnNum;
      const difPr = hasPr && p.precioVenta !== prNum;
      const difUb = hasUb && (p.ubicacionFarmacia ?? '') !== ubRaw;
      return p.seleccionado && (difEx || difMx || difMn || difUb || difPr);
    });

    if (productosAjustar.length === 0) {
      this.aplicandoCambiosMasivos = false;
      Swal.fire({
        icon: 'info',
        title: 'Aviso',
        text: 'No hay productos seleccionados o no hay cambios para aplicar.',
        timer: 1600,
        timerProgressBar: true
      });
      return;
    }

    // 7) Construye payload SOLO con campos presentes
    const cambios = productosAjustar.map(p => {
      const c: any = { id: p._id };
      if (hasEx) c.existencia = exNum;
      if (hasMx) c.stockMax = mxNum;
      if (hasMn) c.stockMin = mnNum;
      if (hasPr) c.precioVenta = prNum;
      if (hasUb) c.ubicacionFarmacia = ubRaw;
      return c;
    });

    // 8) UI
    void Swal.fire({
      title: 'Aplicando ajustes...',
      html: 'Esto puede tardar unos segundos.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading()
    });

    this.inventarioService.actualizarMasivo(farmacia, cambios).pipe(
      finalize(() => { this.aplicandoCambiosMasivos = false; })
    ).subscribe({
      next: () => {
        Swal.close();

        // Reflejo en UI
        for (const p of productosAjustar) {
          if (hasEx) { p.existencia = exNum; p.copiaOriginal.existencia = exNum; }
          if (hasMx) { p.stockMax = mxNum; p.copiaOriginal.stockMax = mxNum; }
          if (hasMn) { p.stockMin = mnNum; p.copiaOriginal.stockMin = mnNum; }
          if (hasPr) { p.precioVenta = prNum; p.copiaOriginal.precioVenta = prNum; }
          if (hasUb) { p.ubicacionFarmacia = ubRaw; p.copiaOriginal.ubicacionFarmacia = ubRaw; }
        }

        // Reset a “vacío”
        this.ajusteMasivo = { precioVenta: '', existencia: '', stockMax: '', stockMin: '', ubicacionFarmacia: '' };

        Swal.fire({
          icon: 'success',
          title: 'Actualizado',
          text: 'Ajustes aplicados correctamente.',
          timer: 1600,
          timerProgressBar: true
        });
      },
      error: (err) => {
        console.error('Error en ajuste masivo', err);
        Swal.close();
        Swal.fire('Error', 'No se pudieron aplicar los ajustes.', 'error');
      }
    });
  }


  resetInputsMasivos() {
    this.ajusteMasivo.existencia = '';
    this.ajusteMasivo.stockMax = '';
    this.ajusteMasivo.stockMin = '';
    this.ajusteMasivo.ubicacionFarmacia = '';
    this.ajusteMasivo.precioVenta = '';
  }

  guardarFila(i: any) {
    const id = i._id;

    // Validaciones numéricas
    const camposNum = [
      { campo: 'existencia', valor: i.existencia, entero: true },
      { campo: 'stockMax', valor: i.stockMax, entero: true },
      { campo: 'stockMin', valor: i.stockMin, entero: true },
      { campo: 'precioVenta', valor: i.precioVenta, entero: false }
    ];

    for (const { campo, valor, entero } of camposNum) {
      if (valor === null || valor === undefined || valor === '') {
        Swal.fire('Campo vacío', `El campo "${campo}" es obligatorio.`, 'warning'); return;
      }
      if (isNaN(valor) || Number(valor) < 0) {
        Swal.fire('Valor inválido', `El campo "${campo}" no puede ser negativo.`, 'warning'); return;
      }
      if (entero && !Number.isInteger(Number(valor))) {
        Swal.fire('Valor inválido', `El campo "${campo}" debe ser entero.`, 'warning'); return;
      }
    }

    if (i.stockMin > i.stockMax) {
      Swal.fire({ icon: 'warning', title: 'Stock mínimo inválido', text: 'El stock mínimo no puede ser mayor que el stock máximo.' });
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(i.precioVenta.toString())) {
      Swal.fire('Valor inválido', 'El precio de venta debe ser un número positivo con hasta 2 decimales.', 'warning');
      return;
    }
    // Detectar cambios
    const cambios =
      i.existencia !== i.copiaOriginal.existencia ||
      i.stockMax !== i.copiaOriginal.stockMax ||
      i.stockMin !== i.copiaOriginal.stockMin ||
      i.precioVenta !== i.copiaOriginal.precioVenta ||
      (i.ubicacionFarmacia ?? '') !== (i.copiaOriginal.ubicacionFarmacia ?? '');  // ← NUEVO

    if (!cambios) {
      Swal.fire({
        icon: 'info',
        title: 'Sin cambios',
        text: 'No se detectaron cambios en este producto.'
      });
      return;
    }

    this.estadoGuardado[id] = 'guardando';

    const payload: any = {
      existencia: i.existencia,
      stockMax: i.stockMax,
      stockMin: i.stockMin,
      precioVenta: i.precioVenta,
      ubicacionFarmacia: (i.ubicacionFarmacia ?? '').toString().trim()
    };

    this.inventarioService.actualizarUno(id, payload).subscribe({
      next: () => {
        i.copiaOriginal = {
          existencia: i.existencia,
          stockMax: i.stockMax,
          stockMin: i.stockMin,
          precioVenta: i.precioVenta,
          ubicacionFarmacia: (i.ubicacionFarmacia ?? '').toString().trim()
        };
        this.estadoGuardado[id] = 'exito';
        setTimeout(() => this.estadoGuardado[id] = 'idle', 1500);
        Swal.fire({
          icon: 'success',
          title: 'Éxito',
          text: 'El producto fue actualizado correctamente.',
          timer: 1200,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false
        });
        // this.buscar();
        this.estadoEdicion[i._id] = false;
        this.edicionPromos = true;
      },
      error: (err) => {
        console.error('Error al guardar fila:', err);
        this.estadoGuardado[id] = 'idle';
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el producto.' });
      }
    });
  }


  get nombreFarmaciaSeleccionada(): string {
    const id = this.formFiltros.get('farmacia')?.value;
    const farmacia = this.farmacias.find(f => f._id === id);
    return farmacia?.nombre || 'Farmacia';
  }

  get totalPaginas(): number {
    return Math.ceil(this.inventario.length / this.tamanoPagina);
  }

  get inventarioPaginado() {
    const inicio = (this.paginaActual - 1) * this.tamanoPagina;
    return this.inventario.slice(inicio, inicio + this.tamanoPagina);
  }

  get seleccionadosCount(): number {
    return this.inventario?.filter(x => x?.seleccionado).length ?? 0;
  }

  paginaAnterior() {
    if (this.paginaActual > 1) this.paginaActual--;
  }

  paginaSiguiente() {
    if (this.paginaActual < this.totalPaginas) this.paginaActual++;
  }

  irAPrimera() {
    this.paginaActual = 1;
  }

  irAUltima() {
    this.paginaActual = this.totalPaginas;
  }

  sePuedeGuardar(i: any): boolean {
    if (!i || !i.copiaOriginal) return false;

    const cambios =
      i.existencia !== i.copiaOriginal.existencia ||
      i.stockMax !== i.copiaOriginal.stockMax ||
      i.stockMin !== i.copiaOriginal.stockMin ||
      i.precioVenta !== i.copiaOriginal.precioVenta;

    const valoresValidos =
      i.existencia >= 0 &&
      i.stockMax >= 0 &&
      i.stockMin >= 0 &&
      i.precioVenta >= 0

    return cambios && valoresValidos;
  }

  get deshabilitarBotonAplicar(): boolean {
    const exRaw = this.ajusteMasivo.existencia;
    const mxRaw = this.ajusteMasivo.stockMax;
    const mnRaw = this.ajusteMasivo.stockMin;
    const prRaw = this.ajusteMasivo.precioVenta;
    const ubRaw = (this.ajusteMasivo.ubicacionFarmacia ?? '').toString();

    // Se considera “set” solo si el input no está vacío
    const hasEx = exRaw !== '' && exRaw !== null && exRaw !== undefined;
    const hasMx = mxRaw !== '' && mxRaw !== null && mxRaw !== undefined;
    const hasMn = mnRaw !== '' && mnRaw !== null && mnRaw !== undefined;
    const hasPr = prRaw !== '' && prRaw !== null && prRaw !== undefined;
    const hasUb = ubRaw.trim().length > 0; // ← no habilita por estar vacío

    // Si no hay ningún campo capturado, botón deshabilitado
    if (!hasEx && !hasMx && !hasMn && !hasUb && !hasPr) return true;

    // Validaciones individuales (solo si el usuario capturó el campo)
    const exNum = hasEx ? Number(exRaw) : NaN;
    const mxNum = hasMx ? Number(mxRaw) : NaN;
    const mnNum = hasMn ? Number(mnRaw) : NaN;
    const prNum = hasPr ? Number(prRaw) : NaN;

    const exVal = !hasEx || (Number.isInteger(exNum) && exNum >= 0);
    const mxVal = !hasMx || (Number.isInteger(mxNum) && mxNum > 0);
    const mnVal = !hasMn || (Number.isInteger(mnNum) && mnNum > 0);
    const prVal = !hasPr || prNum > 0;

    if (!exVal || !mxVal || !mnVal || !prVal) return true;

    // Consistencia de stocks si ambos fueron capturados
    if (hasMx && hasMn && mnNum > mxNum) return true;

    return false; // hay al menos un campo válido → botón habilitado
  }


  habilitarEdicion(id: string): void {
    this.estadoEdicion[id] = true;
    this.edicionPromos = false;
  }

  cancelarEdicion(item: any) {
    item.existencia = item.copiaOriginal.existencia;
    item.stockMax = item.copiaOriginal.stockMax;
    item.stockMin = item.copiaOriginal.stockMin;
    item.precioVenta = item.copiaOriginal.precioVenta;
    item.ubicacionFarmacia = item.copiaOriginal.ubicacionFarmacia; // ← NUEVO
    this.estadoEdicion[item._id] = false;
    this.estadoGuardado[item._id] = 'idle';
    this.edicionPromos = true;
  }

  limpiarFiltro(campo: string) {
    this.formFiltros.get(campo)?.setValue('');
    this.buscar();
  }

  abrirEditarPromos(i: any) {
    const ref = this.dialog.open(PromosInventarioDialogComponent, {
      width: '580px',
      maxWidth: '98vw',
      disableClose: true,
      data: { item: i }   // pasamos el renglón actual
    });

    ref.afterClosed().subscribe((resp) => {
      // resp puede traer {updated: Inventario} si guardó
      if (resp?.updated) {
        const inv = resp.updated;
        // Merge mínimo de campos conocidos para reflejar cambios locales
        i.producto = i.producto ?? {};
        i.descuentoINAPAM = inv.descuentoINAPAM;

        i.promoLunes = inv.promoLunes;
        i.promoMartes = inv.promoMartes;
        i.promoMiercoles = inv.promoMiercoles;
        i.promoJueves = inv.promoJueves;
        i.promoViernes = inv.promoViernes;
        i.promoSabado = inv.promoSabado;
        i.promoDomingo = inv.promoDomingo;

        i.promoCantidadRequerida = inv.promoCantidadRequerida;
        i.inicioPromoCantidad = inv.inicioPromoCantidad;
        i.finPromoCantidad = inv.finPromoCantidad;

        i.promoDeTemporada = inv.promoDeTemporada;
      }
    });
  }

  private buildMasivoState() {
    const emptyPromo = () => ({ porcentaje: null as any, inicio: '', fin: '', monedero: false });

    const data: any = {};
    for (const d of [
      'promoLunes', 'promoMartes', 'promoMiercoles', 'promoJueves', 'promoViernes', 'promoSabado', 'promoDomingo'
    ]) {
      data[d] = emptyPromo();
    }

    return {
      inapam: { usar: false, valor: false },

      dias: {
        usar: false,
        limpiar: false,
        data
      },

      temporada: {
        usar: false,
        limpiar: false,
        porcentaje: null as any,
        inicio: '',
        fin: '',
        monedero: false
      },

      cantidad: {
        usar: false,
        limpiar: false,
        requerida: null as any,
        inicio: '',
        fin: ''
      },

      precio: {
        usar: false,
        modo: 'pct' as 'pct' | 'monto' | 'set',
        valor: null as any,
        redondear: 2 as 0 | 1 | 2
      }
    };
  }

  resetMasivoPromosPrecio() {
    this.masivo = this.buildMasivoState();
  }

  /** valida y arma payload compatible con backend */
  private buildPayloadMasivo(ids: string[]) {
    const set: any = {};
    let tieneAlgo = false;

    // INAPAM
    if (this.masivo.inapam.usar) {
      set.descuentoINAPAM = !!this.masivo.inapam.valor;
      tieneAlgo = true;
    }

    // Promos por día
    if (this.masivo.dias.usar) {
      if (this.masivo.dias.limpiar) {
        // limpiar TODAS (manda null)
        for (const d of this.diasMasivo) set[d.key] = null;
        tieneAlgo = true;
      } else {
        for (const d of this.diasMasivo) {
          const p = this.masivo.dias.data[d.key];
          const tieneAlgunDato =
            (p.porcentaje !== null && p.porcentaje !== '' && p.porcentaje !== undefined) ||
            (p.inicio || '') !== '' ||
            (p.fin || '') !== '' ||
            p.monedero === true;

          // si no capturó nada de ese día, NO lo mandes
          if (!tieneAlgunDato) continue;

          // si capturó algo -> exigir completos
          if (p.porcentaje === null || p.porcentaje === '' || !p.inicio || !p.fin) {
            throw new Error(`Promo ${d.label}: porcentaje, inicio y fin son obligatorios`);
          }

          set[d.key] = {
            porcentaje: Number(p.porcentaje),
            inicio: p.inicio,
            fin: p.fin,
            monedero: !!p.monedero
          };
          tieneAlgo = true;
        }
      }
    }

    // Temporada
    if (this.masivo.temporada.usar) {
      if (this.masivo.temporada.limpiar) {
        set.promoDeTemporada = null;
        tieneAlgo = true;
      } else {
        const t = this.masivo.temporada;
        const tieneAlgunDato =
          (t.porcentaje !== null && t.porcentaje !== '' && t.porcentaje !== undefined) ||
          (t.inicio || '') !== '' ||
          (t.fin || '') !== '' ||
          t.monedero === true;

        if (tieneAlgunDato) {
          if (t.porcentaje === null || t.porcentaje === '' || !t.inicio || !t.fin) {
            throw new Error('Temporada: porcentaje, inicio y fin son obligatorios');
          }
          set.promoDeTemporada = {
            porcentaje: Number(t.porcentaje),
            inicio: t.inicio,
            fin: t.fin,
            monedero: !!t.monedero
          };
          tieneAlgo = true;
        }
      }
    }

    // Cantidad
    if (this.masivo.cantidad.usar) {
      if (this.masivo.cantidad.limpiar) {
        set.promoCantidad = null;
        tieneAlgo = true;
      } else {
        const c = this.masivo.cantidad;
        const tieneAlgoCantidad = c.requerida !== null || !!c.inicio || !!c.fin;

        if (tieneAlgoCantidad) {
          if (![2, 3, 4].includes(Number(c.requerida)) || !c.inicio || !c.fin) {
            throw new Error('Cantidad: requerida (2,3,4), inicio y fin son obligatorios');
          }
          set.promoCantidad = {
            requerida: Number(c.requerida),
            inicio: c.inicio,
            fin: c.fin
          };
          tieneAlgo = true;
        }
      }
    }

    // Precio
    let precio: any = null;
    if (this.masivo.precio.usar) {
      const v = Number(this.masivo.precio.valor);
      if (!Number.isFinite(v)) throw new Error('Precio masivo: valor inválido');

      precio = {
        modo: this.masivo.precio.modo,
        valor: v,
        redondear: this.masivo.precio.redondear
      };
      tieneAlgo = true;
    }

    if (!tieneAlgo) {
      throw new Error('No capturaste ningún cambio masivo.');
    }

    return {
      ids,
      set: Object.keys(set).length ? set : undefined,
      precio: precio ?? undefined
    };
  }

  aplicarMasivoPromosPrecio() {
    const farmacia = this.formFiltros.get('farmacia')?.value;
    if (!farmacia) return;

    const seleccionados = this.inventario.filter(x => x?.seleccionado);
    if (!seleccionados.length) {
      Swal.fire('Aviso', 'No hay productos seleccionados.', 'info');
      return;
    }

    let payload: any;
    try {
      payload = this.buildPayloadMasivo(seleccionados.map(x => x._id));
    } catch (e: any) {
      Swal.fire('Validación', e?.message || 'Datos inválidos', 'warning');
      return;
    }

    void Swal.fire({
      title: 'Aplicando cambios masivos…',
      html: 'Esto puede tardar unos segundos.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading()
    });

    this.aplicandoMasivoPromosPrecio = true;

    this.inventarioService.aplicarPromosYPrecioMasivo(farmacia, payload).pipe(
      finalize(() => this.aplicandoMasivoPromosPrecio = false)
    ).subscribe({
      next: () => {
        Swal.close();
        Swal.fire({ icon: 'success', title: 'Listo', text: 'Cambios masivos aplicados', timer: 1400, timerProgressBar: true });

        // Opciones:
        // 1) Recargar todo para reflejar promos/precios reales:
        this.buscar();

        // 2) y reset de UI
        this.resetMasivoPromosPrecio();
      },
      error: (err) => {
        Swal.close();
        console.error(err);
        Swal.fire('Error', err?.error?.mensaje || 'No se pudieron aplicar cambios masivos', 'error');
      }
    });
  }



}

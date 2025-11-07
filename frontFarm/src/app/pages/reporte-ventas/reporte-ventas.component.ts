import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import Swal from 'sweetalert2';
import {
  ReportesService,
  ConsultarVentasParams,
  ConsultarVentasResponse
} from '../../services/reportes.service';
import { FarmaciaService, Farmacia } from '../../services/farmacia.service';
import { ClienteService } from '../../services/cliente.service';
import { UsuarioService, Usuario } from '../../services/usuario.service';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { MatTooltipModule } from '@angular/material/tooltip';

type ClienteLite = { _id: string; nombre: string };
type ClienteIdx = { _id: string; nombre: string; norm: string; words: string[] };

@Component({
  selector: 'app-reporte-ventas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, MatTooltipModule],
  templateUrl: './reporte-ventas.component.html',
  styleUrl: './reporte-ventas.component.css'
})
export class ReporteVentasComponent implements OnInit {

  farmaciaId: string | null = null;
  farmaciaNombre: string = '';

  clienteSel: ClienteLite | null = null;
  clienteOpts: ClienteLite[] = [];

  filtroForm!: FormGroup;

  cargando = false;
  rows: any[] = [];

  // Catálogos
  farmacias: Farmacia[] = [];
  clientes: ClienteLite[] = [];

  usuarios: Usuario[] = [];

  farmaciasCargadas = false;
  clientesCargados = false;
  usuariosCargados = false;

  // paginación
  page = 1;
  limit = 20;
  totalPaginas = 0;
  totalRegistros = 0;

  // totales
  totalPagina = 0;
  sumaTotalFiltro = 0;
  sumaCantidadProductos = 0;
  sumaTotalDescuento = 0;
  sumaTotalMonederoCliente = 0;
  sumaCosto = 0;
  sumaUtilidad = 0;

  // detalle expandido (sólo uno a la vez)
  expandedId: string | null = null;

  private readonly collator = new Intl.Collator('es', {
    sensitivity: 'base',
    ignorePunctuation: true,
    numeric: true,
  });

  // Sugerencias cliente
  clientesBase: ClienteLite[] = [];
  clientesIdx: ClienteIdx[] = [];
  sugerenciasClientes: ClienteLite[] = [];
  mostrandoSugerencias = false;
  focoSugerencia = -1;

  // ✅ preserva todas las propiedades (incluido _id)
  private sortByNombre<T extends { nombre?: string }>(arr: T[]): T[] {
    return [...(arr || [])].sort((a, b) =>
      (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
    );
  }

  constructor(
    private fb: FormBuilder,
    private reportes: ReportesService,
    private farmaciaSrv: FarmaciaService,
    private clienteSrv: ClienteService,
    private usuarioSrv: UsuarioService,
    private faLib: FaIconLibrary
  ) {
    this.faLib.addIcons(faChevronDown, faChevronUp);
  }

  ngOnInit(): void {

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
      return;
    }

    this.farmaciaId = farmacia._id;
    this.farmaciaNombre = this.farmaciaNombre || '';

    const hoy = this.todayYMD();
    this.filtroForm = this.fb.group({
      farmaciaId: [''],
      fechaInicial: [hoy],
      fechaFinal: [hoy],
      clienteId: [''],
      clienteNombre: [''],
      usuarioId: [''],
      totalDesde: [''],
      totalHasta: [''],
      limit: [this.limit]
    });

    this.filtroForm.get('clienteNombre')!.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(term => this.onClienteNombreChanged(term || ''));

    this.cargarCatalogos();
  }

  onClienteInput(q: string) {
    const query = (q || '').trim();
    if (query.length < 2) { this.clienteOpts = []; return; }

    // usa el método remoto del ClienteService
    this.clienteSrv.searchClientes(query).subscribe(list => this.clienteOpts = list);
  }

  selectCliente(c: ClienteLite) {
    this.clienteSel = c;
    this.clienteOpts = [];
    // fija el id en el form (lo usa tu backend)
    this.filtroForm.patchValue({ clienteId: c._id });
    // dispara la búsqueda con el filtro aplicado
    this.buscar(true);
  }

  clearCliente(input?: HTMLInputElement) {
    this.clienteSel = null;
    this.filtroForm.patchValue({ clienteId: null });
    this.clienteOpts = [];

    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => input.focus(), 0);
    }
    // quita el filtro y recarga
    this.buscar(true);
  }


  private normalizeEs(s: string): string {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private rankNombre(norm: string, words: string[], term: string): { score: number; pos: number } {
    const tokens = this.normalizeEs(term).split(' ').filter(Boolean);
    if (!tokens.length) return { score: -1, pos: Infinity };

    let score = 0;
    let firstPos = Infinity;

    for (const tok of tokens) {
      const idx = norm.indexOf(tok);
      if (idx === -1) return { score: -1, pos: Infinity }; // algún token no está

      const starts = words.some(w => w.startsWith(tok));
      score += starts ? 2 : 1;
      if (idx < firstPos) firstPos = idx;
    }
    return { score, pos: firstPos };
  }


  onClienteNombreChanged(term: string) {
    const raw = (term || '').trim();

    if (!raw) {
      // Input vacío → limpia y oculta
      this.sugerenciasClientes = [];
      this.mostrandoSugerencias = false;
      this.focoSugerencia = -1;
      if (this.filtroForm.value.clienteId) {
        this.filtroForm.patchValue({ clienteId: '' }, { emitEvent: false });
      }
      return;
    }

    // Si el usuario cambió el texto respecto al seleccionado, limpia el id
    const nombreSel = this.filtroForm.value.clienteNombre || '';
    const idSel = this.filtroForm.value.clienteId || '';
    if (idSel && this.normalizeEs(nombreSel) !== this.normalizeEs(raw)) {
      this.filtroForm.patchValue({ clienteId: '' }, { emitEvent: false });
    }

    // 🔎 Ranking robusto (substring en cualquier parte + prefijo de palabra preferido)
    const ranked = this.clientesIdx
      .map(x => ({ c: { _id: x._id, nombre: x.nombre }, r: this.rankNombre(x.norm, x.words, raw) }))
      .filter(x => x.r.score >= 0)
      .sort((a, b) =>
        (b.r.score - a.r.score)              // más puntos primero (Francisco > Villafranco)
        || (a.r.pos - b.r.pos)               // aparece antes en el nombre
        || this.collator.compare(a.c.nombre, b.c.nombre)
      )
      .slice(0, 100)                          // muestra hasta 100
      .map(x => x.c);

    this.sugerenciasClientes = ranked;
    this.mostrandoSugerencias = true;         // 👈 permanece abierto aunque teclees más
    this.focoSugerencia = -1;
  }


  seleccionarCliente(c: ClienteLite) {
    this.filtroForm.patchValue({ clienteId: c._id, clienteNombre: c.nombre }, { emitEvent: false });
    this.mostrandoSugerencias = false;
    this.focoSugerencia = -1;
    this.buscar(true);
  }

  limpiarCliente() {
    this.filtroForm.patchValue({ clienteId: '', clienteNombre: '' }, { emitEvent: false });
    this.sugerenciasClientes = [];
    this.mostrandoSugerencias = false;
    this.focoSugerencia = -1;
    this.buscar(true);
  }

  onClienteKeyDown(ev: KeyboardEvent) {
    if (!this.mostrandoSugerencias || !this.sugerenciasClientes.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.focoSugerencia = Math.min(this.focoSugerencia + 1, this.sugerenciasClientes.length - 1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.focoSugerencia = Math.max(this.focoSugerencia - 1, 0);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const sel = this.sugerenciasClientes[this.focoSugerencia] ?? this.sugerenciasClientes[0];
      if (sel) this.seleccionarCliente(sel);
    } else if (ev.key === 'Escape') {
      this.mostrandoSugerencias = false;
    }
  }

  onClienteFocus() {
    const current = (this.filtroForm.value.clienteNombre || '').trim();
    if (current) {
      this.onClienteNombreChanged(current);
    } else {
      this.mostrandoSugerencias = false;
    }
  }

  onClienteBlur() {
    setTimeout(() => { this.mostrandoSugerencias = false; }, 150);
  }

  private cargarCatalogos() {
    // Farmacias
    this.farmaciaSrv.obtenerFarmacias().subscribe({
      next: (list) => {
        const ordenadas = this.sortByNombre(list || []);
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any, ...ordenadas];

        // Seleccionar la farmaciaId si está en la lista; si no, deja 'TODAS'
        const ctrl = this.filtroForm.get('farmaciaId');
        if (ctrl) {
          const existe = ordenadas.some(f => f?._id === this.farmaciaId);
          ctrl.setValue(existe ? this.farmaciaId : '');
        }

        this.farmaciasCargadas = true;
        this.dispararInicialSiListos();
      },
      error: () => {
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any];
        this.filtroForm.get('farmaciaId')?.setValue('');
        this.farmaciasCargadas = true;
        this.dispararInicialSiListos();
      }
    });

    // Clientes
    this.clienteSrv.getClientes().subscribe({
      next: (resp: any) => {
        const rows = Array.isArray(resp) ? resp : (resp?.rows ?? []);
        const base: ClienteLite[] = rows.map((c: any): ClienteLite => ({
          _id: c._id?.toString() || '',
          nombre: c.nombre || ''
        }));
        const ordenadas = this.sortByNombre<ClienteLite>(base);

        this.clientesBase = ordenadas;

        // 🔹 Índice normalizado para búsquedas rápidas y confiables
        this.clientesIdx = ordenadas.map(c => {
          const norm = this.normalizeEs(c.nombre);
          const words = norm.split(' ').filter(Boolean);
          return { _id: c._id, nombre: c.nombre, norm, words };
        });

        // (si en otros lados ocupas this.clientes con 'TODOS', puedes mantenerlo)
        this.clientes = [{ _id: '', nombre: 'TODOS' }, ...ordenadas];

        this.clientesCargados = true;
        this.dispararInicialSiListos();
      },
      error: () => {
        this.clientesBase = [];
        this.clientesIdx = [];
        this.clientes = [{ _id: '', nombre: 'TODOS' }];
        this.clientesCargados = true;
        this.dispararInicialSiListos();
      }
    });

    // Usuarios
    this.usuarioSrv.obtenerUsuarios().subscribe({
      next: (list) => {
        const ordenadas = this.sortByNombre(list || []);
        const todos = { _id: '', nombre: 'TODOS', usuario: '', telefono: '', rol: 'empleado' as const };
        this.usuarios = [todos, ...ordenadas];
        this.usuariosCargados = true;
        this.dispararInicialSiListos();
      },
      error: () => {
        const todos = { _id: '', nombre: 'TODOS', usuario: '', telefono: '', rol: 'empleado' as const };
        this.usuarios = [todos];
        this.usuariosCargados = true;
        this.dispararInicialSiListos();
      }
    });
  }

  private dispararInicialSiListos() {
    if (this.farmaciasCargadas && this.clientesCargados && this.usuariosCargados) {
      this.buscar(true);
    }
  }

  resetPaginacion() {
    this.expandedId = null;
    this.page = 1;
  }

  limpiar() {
    const hoy = this.todayYMD();
    this.filtroForm.reset({
      farmaciaId: '',
      fechaInicial: hoy,
      fechaFinal: hoy,
      clienteId: '',
      usuarioId: '',
      totalDesde: '',
      totalHasta: '',
      limit: this.limit
    });
    this.resetPaginacion();
    this.buscar(true);
  }

  buscar(reset = false) {
    if (!(this.farmaciasCargadas && this.clientesCargados && this.usuariosCargados)) return;
    if (reset) this.resetPaginacion();

    const val = this.filtroForm.value;
    this.limit = Number(val.limit) || 20;

    // ❗️No formateamos aquí. Enviamos “tal cual” y el service convierte a YYYY-MM-DD 1 sola vez.
    const params: ConsultarVentasParams = {
      farmaciaId: val.farmaciaId || undefined,
      clienteId: val.clienteId || undefined,
      usuarioId: val.usuarioId || undefined,
      totalDesde: (val.totalDesde !== '' && val.totalDesde != null) ? Number(val.totalDesde) : undefined,
      totalHasta: (val.totalHasta !== '' && val.totalHasta != null) ? Number(val.totalHasta) : undefined,
      fechaInicial: val.fechaInicial as any,  // Date o string; el service lo normaliza
      fechaFinal: val.fechaFinal as any,  // Date o string; el service lo normaliza
      page: this.page,
      limit: this.limit,
    };

    this.cargando = true;
    this.reportes.getVentas(params).subscribe({
      next: (resp: ConsultarVentasResponse) => {
        const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

        // (opcional) recalcular costo/utilidad por si el back no lo manda
        this.rows = (resp?.ventas || []).map((v: any) => {
          const prods = Array.isArray(v?.productos) ? v.productos : [];
          const costo = prods.reduce((acc: number, p: any) =>
            acc + toNum(p?.costo) * toNum(p?.cantidad), 0);
          const utilidad = toNum(v?.total) - costo;
          return {
            ...v,
            _costo: v._costo ?? Number(costo.toFixed(2)),
            _utilidad: v._utilidad ?? Number(utilidad.toFixed(2)),
          };
        });

        // paginación
        this.totalRegistros = resp?.paginacion?.totalRegistros || 0;
        this.totalPaginas = resp?.paginacion?.totalPaginas || 0;

        // totales (filtro completo)
        this.sumaTotalFiltro = resp?.resumen?.sumaTotalFiltro ?? 0;
        this.sumaCantidadProductos = resp?.resumen?.sumaCantidadProductos ?? 0;
        this.sumaTotalDescuento = resp?.resumen?.sumaTotalDescuento ?? 0;
        this.sumaTotalMonederoCliente = resp?.resumen?.sumaTotalMonederoCliente ?? 0;
        this.sumaCosto = resp?.resumen?.sumaCosto ?? 0;
        this.sumaUtilidad = resp?.resumen?.sumaUtilidad ?? 0;

        // total de la página
        this.totalPagina = this.rows.reduce((acc, r) => acc + toNum(r.total), 0);

        this.cargando = false;
      },
      error: (err) => {
        this.cargando = false;
        this.rows = [];
        this.totalRegistros = 0;
        this.totalPaginas = 0;
        this.totalPagina = 0;
        this.sumaTotalFiltro = 0;
        this.sumaCantidadProductos = 0;
        this.sumaTotalDescuento = 0;
        this.sumaTotalMonederoCliente = 0;
        this.sumaCosto = 0;
        this.sumaUtilidad = 0;

        const msg = err?.error?.mensaje || 'No se pudo consultar el reporte.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  // Toggle detalle (uno a la vez)
  toggleDetalle(row: any) {
    const id = String(row?._id || '');
    if (!id) return;
    this.expandedId = (this.expandedId === id) ? null : id;
  }
  isExpanded(row: any): boolean {
    const id = String(row?._id || '');
    return !!id && this.expandedId === id;
  }

  /** Devuelve hoy en formato 'YYYY-MM-DD' (horario local, sin UTC) */
  private todayYMD(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }


  // navegación
  primera() { if (this.page !== 1) { this.page = 1; this.buscar(); } }
  anterior() { if (this.page > 1) { this.page--; this.buscar(); } }
  siguiente() { if (this.page < this.totalPaginas) { this.page++; this.buscar(); } }
  ultima() { if (this.page !== this.totalPaginas) { this.page = this.totalPaginas; this.buscar(); } }
}

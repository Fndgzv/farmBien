import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
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

@Component({
  selector: 'app-reporte-ventas',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, MatTooltipModule],
  templateUrl: './reporte-ventas.component.html',
  styleUrl: './reporte-ventas.component.css'
})
export class ReporteVentasComponent implements OnInit {
  filtroForm!: FormGroup;

  cargando = false;
  rows: any[] = [];

  // Catálogos
  farmacias: Farmacia[] = [];
  clientes: Array<{ _id: string; nombre: string }> = [];
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

  private sortByNombre<T extends { nombre?: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => this.collator.compare(a.nombre || '', b.nombre || ''));
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
    const hoy = this.todayYMD();
    this.filtroForm = this.fb.group({
      farmaciaId: [''],        // '' = TODAS
      fechaInicial: [hoy],     // Date
      fechaFinal: [hoy],     // Date
      clienteId: [''],         // '' = TODOS
      usuarioId: [''],         // '' = TODOS
      totalDesde: [''],
      totalHasta: [''],
      limit: [this.limit]
    });

    this.cargarCatalogos();
  }

  private cargarCatalogos() {
    // Farmacias
    this.farmaciaSrv.obtenerFarmacias().subscribe({
      next: (list) => {
        const ordenadas = this.sortByNombre(list || []);
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any, ...ordenadas];
        this.farmaciasCargadas = true;
        this.dispararInicialSiListos();
      },
      error: () => {
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any];
        this.farmaciasCargadas = true;
        this.dispararInicialSiListos();
      }
    });

    // Clientes
    this.clienteSrv.getClientes().subscribe({
      next: (list) => {
        const base = (list || []).map((c: any) => ({ _id: c._id, nombre: c.nombre }));
        const ordenadas = this.sortByNombre(base);
        this.clientes = [{ _id: '', nombre: 'TODOS' }, ...ordenadas];
        this.clientesCargados = true;
        this.dispararInicialSiListos();
      },
      error: () => {
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

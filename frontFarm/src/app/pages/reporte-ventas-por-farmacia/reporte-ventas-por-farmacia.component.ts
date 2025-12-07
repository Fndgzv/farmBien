import { Component, OnInit } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

import { FarmaciaService } from '../../services/farmacia.service';
import { ReportesService } from '../../services/reportes.service';

import {
  ResumenVentasResponse,
  VentaProductoResumen,
} from '../../models/reportes.models';
import Swal from 'sweetalert2';

type SortCol = 'producto' | 'existencia' | 'cantidad' | 'importe' | 'costo' | 'utilidad' | 'margen';
type SortKey =
  | 'nombre'          // producto
  | 'existencia'
  | 'cantidadVendida'
  | 'importeVendido'
  | 'costoTotal'
  | 'utilidad'
  | 'margenPct';
@Component({
  selector: 'app-reporte-ventas-por-farmacia',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, NgFor, NgIf,
    MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    MatIconModule, MatTooltip
  ],
  templateUrl: './reporte-ventas-por-farmacia.component.html',
  styleUrl: './reporte-ventas-por-farmacia.component.css'
})
export class ReporteVentasPorFarmaciaComponent implements OnInit {

  semaforoClass(r: any): string {
  const ex  = Number(r?.existencia ?? 0);
  const min = Number(r?.stockMin   ?? 0);
  const max = Number(r?.stockMax   ?? 0);

  // Verde: hay tope y se cumple
  if (max > 0 && ex >= max) return 'sem-green';

  // Rojo: hay mínimo y estamos por debajo o igual
  if (min > 0 && ex <= min) return 'sem-red';

  // Amarillo: tenemos algún umbral y estamos entre ambos
  if (max > 0 || min > 0) return 'sem-yellow';

  // Sin umbrales definidos → neutro
  return 'sem-muted';
}


  // ====== Filtros base ======
  farmacias: any[] = [];
  farmaciaId: string | '' = '';
  fechaIni = this.defaultIni();
  fechaFin = this.defaultFin();
  productoQ = '';
  categoriaQ = '';

  // ====== Estado y datos ======
  cargando = false;
  rows: VentaProductoResumen[] = [];

  // totales
  totalImporte = 0;
  totalCantidad = 0;
  totalExistencia = 0;
  totalCosto = 0;
  totalUtilidad = 0;
  totalMargenPct: number | null = null;

  // Paginación (client-side)
  page = 1;
  pageSize = 15;
  totalItems = 0;
  get totalPages(): number { return Math.max(1, Math.ceil(this.totalItems / this.pageSize)); }
  private resetPagination() { this.totalItems = this.rows.length; this.page = 1; }
  goFirst() { this.page = 1; }
  goPrev() { if (this.page > 1) this.page--; }
  goNext() { if (this.page < this.totalPages) this.page++; }
  goLast() { this.page = this.totalPages; }

  // Ordenamiento (client-side)
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null = null;

  constructor(
    private reportes: ReportesService,
    private farmaciaService: FarmaciaService  ) { }

  ngOnInit(): void {

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
      return;
    }

    this.farmaciaId = farmacia._id;

    this.cargarFarmacias();

    this.buscar();
  }

  cargarFarmacias(): void {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => this.farmacias = data ?? [],
      error: () => this.farmacias = []
    });
  }


  buscar(): void {
    const toDateOnly = (v: any) => v ? new Date(v).toISOString().slice(0, 10) : undefined;
    this.cargando = true;

    this.reportes.getVentasPorFarmacia({
      farmaciaId: this.farmaciaId || undefined,
      fechaIni: toDateOnly(this.fechaIni),
      fechaFin: toDateOnly(this.fechaFin),
      // 🔹 enviamos la query de texto (nombre o código)
      productoQ: this.productoQ?.trim() || undefined,
      categoriaQ: this.categoriaQ?.trim() || undefined
    })
    .subscribe({
      next: (resp: ResumenVentasResponse) => {
        const rows = resp?.data || [];
        const toNum = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;

        this.rows = rows;
        this.totalImporte   = rows.reduce((a, r: any) => a + toNum(r.importeVendido), 0);
        this.totalCantidad  = rows.reduce((a, r: any) => a + toNum(r.cantidadVendida), 0);
        this.totalCosto     = rows.reduce((a, r: any) => a + toNum(r.costoTotal), 0);
        this.totalUtilidad  = rows.reduce((a, r: any) => a + toNum(r.utilidad), 0);
        this.totalExistencia= rows.reduce((a, r: any) => a + toNum(r.existencia), 0);

        this.totalMargenPct = this.totalImporte > 0 ? (this.totalUtilidad / this.totalImporte) * 100 : null;

        this.resetPagination?.();
        this.cargando = false;

        console.log('productos filtrados =====>', resp);
        
      },
      error: (err) => {
        console.error('Error reporte ventas:', err);
        this.rows = [];
        this.totalImporte = this.totalCantidad = this.totalExistencia = this.totalCosto = this.totalUtilidad = 0;
        this.totalMargenPct = null;
        this.cargando = false;
      },
    });
  }

  // 🔹 limpiar solo el filtro de texto
  clearProducto() {
    this.productoQ = '';
  }

  limpiarFiltros(): void {
    this.farmaciaId = '';
    this.fechaIni = this.defaultIni();
    this.fechaFin = this.defaultFin();
    this.clearProducto();

    this.rows = [];
    this.totalCantidad = 0;
    this.totalExistencia = 0;
    this.totalImporte = 0;
    this.totalItems = 0;
    this.page = 1;

    this.sort = null;
    this.buscar();
  }

  // Helpers de fecha (hoy → hoy)
  private defaultIni(): string { return this.toLocalISO(new Date()); }
  private defaultFin(): string { return this.toLocalISO(new Date()); }
  private toLocalISO(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async exportarCSV(): Promise<void> {
    if (!this.rows.length) return;
    const cols = [
      { key: 'farmacia', label: 'Cód. barras' },
      { key: 'nombre', label: 'Producto' },
      { key: 'codigoBarras', label: 'Cód. barras' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'cantidadVendida', label: 'Vendidos' },
      { key: 'costoTotal', label: 'Costo total', map: (r: any) => Number(r.costoTotal ?? 0).toFixed(2) },
      { key: 'importeVendido', label: 'Importe' },
      { key: 'utilidad', label: 'Utilidad', map: (r: any) => Number(r.utilidad ?? 0).toFixed(2) },
      { key: 'margenPct', label: 'margenPct', map: (r: any) => Number(r.margenPct ?? 0).toFixed(2) },
      { key: 'stockMin', label: 'Stock Mín.' },
      { key: 'stockMax', label: 'Stock Máx.' },
      { key: 'existencia', label: 'Existencia' },

    ];
    // usa tus utilidades existentes
    const { toCSV, downloadCSV } = await import('../../utils/csv');
    const csv = toCSV(this.rows, cols, { separator: ',', bom: true });
    const fname = `ventas_farmacia_${this.fechaIni}_a_${this.fechaFin}.csv`;
    downloadCSV(fname, csv);
  }

  // === ORDENAMIENTO (client-side) ===
  setSort(col: SortCol) {
    const map: Record<SortCol, SortKey> = {
      producto: 'nombre',
      existencia: 'existencia',
      cantidad: 'cantidadVendida',
      importe: 'importeVendido',
      costo: 'costoTotal',
      utilidad: 'utilidad',
      margen: 'margenPct',
    };
    const key = map[col];
    if (!this.sort || this.sort.key !== key) {
      this.sort = { key, dir: 'asc' };     // primer click asc
    } else {
      this.sort = { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
    } this.page = 1;
  }

  sortIcon(col: SortCol): string {
    const map: Record<SortCol, SortKey> = {
      producto: 'nombre',
      existencia: 'existencia',
      cantidad: 'cantidadVendida',
      importe: 'importeVendido',
      costo: 'costoTotal',
      utilidad: 'utilidad',
      margen: 'margenPct',
    };
    const key = map[col];
    if (!this.sort || this.sort.key !== key) return 'swap_vert';
    return this.sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // Ordena ANTES de paginar
  get sortedRows() {
    if (!this.sort) return this.rows;
    const { key, dir } = this.sort;

    // producto: ordena por nombre usando locale 'es'
    if (key === 'nombre') {
      return [...this.rows].sort((a: any, b: any) => {
        const r = (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
        return dir === 'asc' ? r : -r;
      });
    }

    // numéricos (existencia, cantidadVendida, etc.)
    return [...this.rows].sort((a: any, b: any) => {
      const av = Number(a?.[key] ?? NaN);
      const bv = Number(b?.[key] ?? NaN);

      const aNan = Number.isNaN(av);
      const bNan = Number.isNaN(bv);
      if (aNan && bNan) return 0;
      if (aNan) return dir === 'asc' ? 1 : -1;
      if (bNan) return dir === 'asc' ? -1 : 1;

      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      // desempate estable
      return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
  }

  // Paginación usando lo ya ordenado
  get pagedRows() {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedRows.slice(start, start + this.pageSize);
  }
}

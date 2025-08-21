import { Component, OnInit } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FarmaciaService } from '../../services/farmacia.service';

import { MatIconModule } from '@angular/material/icon';

import {
  ResumenVentasResponse,
  VentaProductoResumen
} from '../../models/reportes.models';
import { ReportesService } from '../../services/reportes.service';
import { HttpClient } from '@angular/common/http';
import { downloadCSV, toCSV } from '../../utils/csv';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

type SortKey = 'cantidadVendida' | 'importeVendido' | 'costoTotal' | 'utilidad' | 'margenPct';
type SortCol  = 'cantidad'       | 'importe'        | 'costo'      | 'utilidad' | 'margen';

@Component({
  selector: 'app-reporte-ventas-por-farmacia',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgFor, NgIf,
    MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatIconModule],
  templateUrl: './reporte-ventas-por-farmacia.component.html',
  styleUrl: './reporte-ventas-por-farmacia.component.css'
})


export class ReporteVentasPorFarmaciaComponent {

  farmacias: any[] = [];
  farmaciaId: string | '' = '';

  fechaIni = this.defaultIni();
  fechaFin = this.defaultFin();

  cargando = false;
  rows: VentaProductoResumen[] = [];
  totalImporte = 0;
  totalCantidad = 0;
  totalCosto = 0;
  totalUtilidad = 0;
  totalMargenPct: number | null = null;

  // Paginación
  page = 1;
  pageSize = 15;
  totalItems = 0;
  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }
  private resetPagination() {
    this.totalItems = this.rows.length;
    this.page = 1;
  }
  goFirst() { this.page = 1; }
  goPrev() { if (this.page > 1) this.page--; }
  goNext() { if (this.page < this.totalPages) this.page++; }
  goLast() { this.page = this.totalPages; }

  constructor(private reportes: ReportesService, private http: HttpClient, private farmaciaService: FarmaciaService,) { }

  ngOnInit(): void {
    this.cargarFarmacias();
    this.buscar(); // consulta inicial con defaults (hoy)
  }

  cargarFarmacias(): void {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => this.farmacias = data ?? [],
      error: () => this.farmacias = []
    });
  }

  buscar(): void {
    this.cargando = true;
    this.reportes
      .getVentasPorFarmacia({
        farmaciaId: this.farmaciaId || undefined,
        fechaIni: this.fechaIni,
        fechaFin: this.fechaFin,
      })
      .subscribe({
        next: (resp: ResumenVentasResponse) => {
          this.rows = resp?.data || [];
          this.totalImporte = this.rows.reduce((a, r) => a + (r.importeVendido || 0), 0);
          this.totalCantidad = this.rows.reduce((a, r) => a + (r.cantidadVendida || 0), 0);
          this.totalCosto = this.rows.reduce((a, r) => a + (r.costoTotal || 0), 0);    // ⬅️
          this.totalUtilidad = this.rows.reduce((a, r) => a + (r.utilidad || 0), 0);      // ⬅️
          this.totalMargenPct = this.totalImporte > 0
            ? (this.totalUtilidad / this.totalImporte) * 100
            : null;
          this.resetPagination();
          this.cargando = false;
        },
        error: (err) => {
          console.error('Error reporte ventas:', err);
          this.rows = [];
          this.totalImporte = 0;
          this.totalCantidad = 0;
          this.totalCosto = 0;
          this.totalUtilidad = 0;
          this.totalMargenPct = null;
          this.cargando = false;
        },
      });
  }

  limpiarFiltros(): void {
    this.farmaciaId = '';
    this.fechaIni = this.defaultIni();
    this.fechaFin = this.defaultFin();

    this.rows = [];
    this.totalCantidad = 0;
    this.totalImporte = 0;
    this.totalItems = 0;
    this.page = 1;

    this.sort = null

    this.buscar();
  }

  // Helpers de fecha (últimos 15 días)
  private defaultIni(): string {
    /* const d = new Date();
    d.setDate(d.getDate() - 15);
    return this.toLocalISO(d); */
    return this.toLocalISO(new Date());
  }
  private defaultFin(): string {
    return this.toLocalISO(new Date());
  }
  private toLocalISO(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }


  exportarCSV(): void {
    if (!this.rows.length) return;
    const cols = [
      { key: 'codigoBarras', label: 'Cód. barras' },
      { key: 'nombre', label: 'Producto' },
      { key: 'unidad', label: 'Unidad' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'cantidadVendida', label: 'Cantidad' },
      { key: 'importeVendido', label: 'Importe' },
      { key: 'costoTotal', label: 'Costo', map: (r: any) => Number(r.costoTotal ?? 0).toFixed(2) },
      { key: 'utilidad', label: 'Utilidad', map: (r: any) => Number(r.utilidad ?? 0).toFixed(2) },
      { key: 'margenPct', label: 'margenPct', map: (r: any) => Number(r.margenPct ?? 0).toFixed(2) },
    ];
    const csv = toCSV(this.rows, cols, { separator: ',', bom: true });
    const fname = `ventas_farmacia_${this.fechaIni}_a_${this.fechaFin}.csv`;
    downloadCSV(fname, csv);
  }


  // === ORDENAMIENTO ===
sort: { key: SortKey; dir: 'asc' | 'desc' } | null = null;

setSort(col: SortCol) {
  const map: Record<SortCol, SortKey> = {
    cantidad: 'cantidadVendida',
    importe:  'importeVendido',
    costo:    'costoTotal',
    utilidad: 'utilidad',
    margen:   'margenPct',
  };

  const key = map[col];
  if (!this.sort || this.sort.key !== key) {
    this.sort = { key, dir: 'desc' };         // primer click: desc
  } else {
    this.sort = { ...this.sort, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
  }
  this.page = 1;
}

sortIcon(col: SortCol): string {
  const map: Record<SortCol, SortKey> = {
    cantidad: 'cantidadVendida',
    importe:  'importeVendido',
    costo:    'costoTotal',
    utilidad: 'utilidad',
    margen:   'margenPct',
  };

  const key = map[col];
  if (!this.sort || this.sort.key !== key) return 'swap_vert';
  return this.sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
}

// Ordena ANTES de paginar
get sortedRows() {
  if (!this.sort) return this.rows;
  const { key, dir } = this.sort;

  return [...this.rows].sort((a: any, b: any) => {
    const av = (a?.[key] ?? null);
    const bv = (b?.[key] ?? null);

    // Manejo especial de null/undefined (p.ej., margenPct puede venir null)
    const aNull = av === null || av === undefined || Number.isNaN(av);
    const bNull = bv === null || bv === undefined || Number.isNaN(bv);
    if (aNull && bNull) return 0;
    if (aNull) return dir === 'asc' ? 1 : -1;
    if (bNull) return dir === 'asc' ? -1 : 1;

    const an = Number(av);
    const bn = Number(bv);

    if (an < bn) return dir === 'asc' ? -1 : 1;
    if (an > bn) return dir === 'asc' ? 1 : -1;

    // Desempate estable (opcional): por nombre
    return (a.nombre || '').localeCompare(b.nombre || '');
  });
}

  // Usa sortedRows en la paginación
  get pagedRows() {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedRows.slice(start, start + this.pageSize);
  }

}


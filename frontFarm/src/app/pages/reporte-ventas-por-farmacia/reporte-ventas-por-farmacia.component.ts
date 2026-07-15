import { Component, OnInit } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltip } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';

import { FarmaciaService } from '../../services/farmacia.service';
import { Laboratorio, LaboratoriosService } from '../../services/laboratorios.service';
import { ReportesService } from '../../services/reportes.service';

import {
  ResumenVentasResponse,
  VentaProductoResumen,
} from '../../models/reportes.models';
import Swal from 'sweetalert2';

type SortCol = 'producto' | 'categoria' | 'laboratorio' | 'existencia' | 'cantidad' | 'importe' | 'costo' | 'utilidad' | 'margen';
type SortKey =
  | 'nombre'          // producto
  | 'categoria'
  | 'laboratorioNombre'
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
    MatTooltip
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
  laboratorios: Laboratorio[] = [];
  readonly valorLaboratorioSinAsignar = '__SIN__';
  readonly textoLaboratorioSinAsignar = 'Sin laboratorio';
  farmaciaId: string | '' = '';
  laboratorioId: string | null = null;
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
  private readonly sortMap: Record<SortCol, SortKey> = {
    producto: 'nombre',
    categoria: 'categoria',
    laboratorio: 'laboratorioNombre',
    existencia: 'existencia',
    cantidad: 'cantidadVendida',
    importe: 'importeVendido',
    costo: 'costoTotal',
    utilidad: 'utilidad',
    margen: 'margenPct',
  };

  constructor(
    private reportes: ReportesService,
    private farmaciaService: FarmaciaService,
    private laboratoriosService: LaboratoriosService
  ) { }

  ngOnInit(): void {

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
      return;
    }

    this.farmaciaId = farmacia._id;

    this.cargarFarmacias();
    this.cargarLaboratorios();

    this.buscar();
  }

  cargarFarmacias(): void {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => this.farmacias = data ?? [],
      error: () => this.farmacias = []
    });
  }

  private ordenarLaboratorios(data: Laboratorio[] = []): Laboratorio[] {
    return [...data].sort((a, b) =>
      String(a?.laboratorio || '').localeCompare(String(b?.laboratorio || ''), 'es', { sensitivity: 'base' })
    );
  }

  cargarLaboratorios(): void {
    this.laboratoriosService.obtenerLaboratorios().subscribe({
      next: (data) => this.laboratorios = this.ordenarLaboratorios(data || []),
      error: () => this.laboratorios = []
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
      categoriaQ: this.categoriaQ?.trim() || undefined,
      laboratorioId: this.laboratorioId || undefined,
      sortBy: this.sort?.key,
      sortDir: this.sort?.dir
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

  calcularCostoPromedio(r: any): number {
  const costoTotal = r?.costoTotal ?? 0;
  const cantidadVendida = r?.cantidadVendida ?? 0;

  if (cantidadVendida <= 0) {
    return 0;
  }

  return costoTotal / cantidadVendida;
}

  nombreLaboratorio(r: VentaProductoResumen | any): string {
    return String(r?.laboratorioNombre || '').trim() || this.textoLaboratorioSinAsignar;
  }

  // 🔹 limpiar solo el filtro de texto
  clearProducto() {
    this.productoQ = '';
  }

  onLaboratorioChange(): void {
    this.page = 1;
    this.buscar();
  }

  limpiarFiltros(): void {
    this.farmaciaId = '';
    this.laboratorioId = null;
    this.fechaIni = this.defaultIni();
    this.fechaFin = this.defaultFin();
    this.clearProducto();
    this.categoriaQ = '';

    this.rows = [];
    this.totalCantidad = 0;
    this.totalExistencia = 0;
    this.totalImporte = 0;
    this.totalCosto = 0;
    this.totalUtilidad = 0;
    this.totalMargenPct = null;
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

  exportarExcel(): void {
    if (!this.rows.length) return;
    const toNum = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;

    const data: Array<Record<string, string | number>> = this.sortedRows.map((r: any) => ({
      Farmacia: r.farmacia || '',
      'Nombre / Código barras': `${r.nombre || ''}${r.codigoBarras ? ` / ${r.codigoBarras}` : ''}`,
      Categoría: r.categoria || '',
      Laboratorio: this.nombreLaboratorio(r),
      'Ubic. farma': r.ubicacionFarmacia || '',
      Vendidos: toNum(r.cantidadVendida),
      'Costo total': toNum(r.costoTotal),
      'Imp. Tot.': toNum(r.importeVendido),
      'Costo Prom.': this.calcularCostoPromedio(r),
      Utilidad: toNum(r.utilidad),
      '% Gan.': r.margenPct == null ? '' : toNum(r.margenPct),
      'Stock Mín.': toNum(r.stockMin),
      'Stock Máx.': toNum(r.stockMax),
      Existencia: toNum(r.existencia),
    }));

    data.push({
      Farmacia: 'Totales:',
      'Nombre / Código barras': '',
      Categoría: '',
      Laboratorio: '',
      'Ubic. farma': '',
      Vendidos: toNum(this.totalCantidad),
      'Costo total': toNum(this.totalCosto),
      'Imp. Tot.': toNum(this.totalImporte),
      'Costo Prom.': '',
      Utilidad: toNum(this.totalUtilidad),
      '% Gan.': this.totalMargenPct == null ? '' : toNum(this.totalMargenPct),
      'Stock Mín.': '',
      'Stock Máx.': '',
      Existencia: '',
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 24 },
      { wch: 42 },
      { wch: 22 },
      { wch: 24 },
      { wch: 18 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas farmacia');
    XLSX.writeFile(wb, 'ventas-por-farmacia.xlsx');
    return;
  }

  // === ORDENAMIENTO (client-side) ===
  setSort(col: SortCol) {
    const key = this.sortMap[col];
    if (!this.sort || this.sort.key !== key) {
      this.sort = { key, dir: 'asc' };     // primer click asc
    } else {
      this.sort = { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
    }
    this.page = 1;
    this.buscar();
  }

  sortIcon(col: SortCol): string {
    const key = this.sortMap[col];
    if (!this.sort || this.sort.key !== key) return 'fa-sort';
    return this.sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Ordena ANTES de paginar
  get sortedRows() {
    if (!this.sort) return this.rows;
    const { key, dir } = this.sort;
    const compareText = (a: string, b: string) =>
      String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base' });
    const desempate = (a: any, b: any) => {
      const porNombre = compareText(a?.nombre, b?.nombre);
      if (porNombre !== 0) return porNombre;
      return compareText(a?.productoId, b?.productoId);
    };

    // producto, categorÃ­a y laboratorio: ordena por texto usando locale 'es'
    if (key === 'nombre' || key === 'categoria' || key === 'laboratorioNombre') {
      return [...this.rows].sort((a: any, b: any) => {
        const aText = key === 'laboratorioNombre' ? this.nombreLaboratorio(a) : String(a?.[key] || '');
        const bText = key === 'laboratorioNombre' ? this.nombreLaboratorio(b) : String(b?.[key] || '');
        const r = compareText(aText, bText);
        if (r !== 0) return dir === 'asc' ? r : -r;
        return desempate(a, b);
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
      return desempate(a, b);
    });
  }

  // Paginación usando lo ya ordenado
  get pagedRows() {
    const start = (this.page - 1) * this.pageSize;
    return this.sortedRows.slice(start, start + this.pageSize);
  }
}

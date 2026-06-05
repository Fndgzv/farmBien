import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

import { Farmacia, FarmaciaService } from '../../services/farmacia.service';
import { ReportesService } from '../../services/reportes.service';

type SortCol = 'farmacia' | 'categoria' | 'vendidos' | 'costo' | 'ingreso' | 'utilidad' | 'margen';
type SortKey = 'farmacia' | 'categoria' | 'cantidadVendida' | 'costoTotal' | 'importeVendido' | 'utilidad' | 'margenPct';

interface VentaCategoriaRow {
  farmacia: string;
  categoria: string;
  cantidadVendida: number;
  costoTotal: number;
  importeVendido: number;
  utilidad: number;
  margenPct: number | null;
}

@Component({
  selector: 'app-ventas-por-categoria',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './ventas-por-categoria.component.html',
  styleUrl: './ventas-por-categoria.component.css'
})
export class VentasPorCategoriaComponent implements OnInit {
  farmacias: Farmacia[] = [];
  farmaciaId = '';
  categoriaQ = '';
  fechaIni = this.inicioMesCdmx();
  fechaFin = this.hoyCdmx();

  cargando = false;
  rows: VentaCategoriaRow[] = [];

  totalCantidad = 0;
  totalCosto = 0;
  totalImporte = 0;
  totalUtilidad = 0;
  totalMargenPct: number | null = null;

  sort: { key: SortKey; dir: 'asc' | 'desc' } | null = null;

  private readonly collator = new Intl.Collator('es', {
    sensitivity: 'base',
    numeric: true,
  });

  constructor(
    private reportes: ReportesService,
    private farmaciaService: FarmaciaService
  ) { }

  ngOnInit(): void {
    this.farmaciaId = this.obtenerFarmaciaActivaId();
    this.cargarFarmacias();
    this.buscar();
  }

  cargarFarmacias(): void {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => {
        this.farmacias = data ?? [];
        if (this.farmaciaId && !this.farmacias.some(f => f._id === this.farmaciaId)) {
          this.farmaciaId = '';
        }
      },
      error: () => this.farmacias = []
    });
  }

  buscar(): void {
    this.cargando = true;

    this.reportes.getVentasPorCategoria({
      farmaciaId: this.farmaciaId || undefined,
      fechaIni: this.fechaIni || undefined,
      fechaFin: this.fechaFin || undefined,
      categoriaQ: this.categoriaQ?.trim() || undefined,
    }).subscribe({
      next: (resp: any) => {
        this.rows = (resp?.data || []).map((r: any) => this.mapRow(r));
        this.calcularTotales();
        this.cargando = false;
      },
      error: (err) => {
        console.error('[ventas-por-categoria][ERROR]', err);
        this.rows = [];
        this.calcularTotales();
        this.cargando = false;
        Swal.fire('Error', err?.error?.mensaje || 'No se pudo consultar ventas por categoría.', 'error');
      },
    });
  }

  limpiarFiltros(): void {
    this.farmaciaId = '';
    this.categoriaQ = '';
    this.fechaIni = this.inicioMesCdmx();
    this.fechaFin = this.hoyCdmx();
    this.sort = null;
    this.buscar();
  }

  clearCategoria(): void {
    this.categoriaQ = '';
  }

  exportarExcel(): void {
    if (!this.rows.length) return;

    const data: Array<Record<string, string | number>> = this.sortedRows.map((r) => ({
      Farmacia: r.farmacia || '',
      Categoría: r.categoria || '',
      Vendidos: this.numero(r.cantidadVendida),
      'Costo total': this.numero(r.costoTotal),
      'Ingreso total': this.numero(r.importeVendido),
      Utilidad: this.numero(r.utilidad),
      '% Ganancia': this.numero(r.margenPct),
    }));

    data.push({
      Farmacia: 'Totales:',
      Categoría: '',
      Vendidos: this.numero(this.totalCantidad),
      'Costo total': this.numero(this.totalCosto),
      'Ingreso total': this.numero(this.totalImporte),
      Utilidad: this.numero(this.totalUtilidad),
      '% Ganancia': this.numero(this.totalMargenPct),
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 28 },
      { wch: 28 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas categoria');
    XLSX.writeFile(wb, 'ventas-por-categoria.xlsx');
  }

  setSort(col: SortCol): void {
    const map: Record<SortCol, SortKey> = {
      farmacia: 'farmacia',
      categoria: 'categoria',
      vendidos: 'cantidadVendida',
      costo: 'costoTotal',
      ingreso: 'importeVendido',
      utilidad: 'utilidad',
      margen: 'margenPct',
    };

    const key = map[col];
    if (!this.sort || this.sort.key !== key) {
      this.sort = { key, dir: 'asc' };
      return;
    }

    this.sort = { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
  }

  sortIcon(col: SortCol): string {
    const map: Record<SortCol, SortKey> = {
      farmacia: 'farmacia',
      categoria: 'categoria',
      vendidos: 'cantidadVendida',
      costo: 'costoTotal',
      ingreso: 'importeVendido',
      utilidad: 'utilidad',
      margen: 'margenPct',
    };

    const key = map[col];
    if (!this.sort || this.sort.key !== key) return 'fa-sort';
    return this.sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  get sortedRows(): VentaCategoriaRow[] {
    if (!this.sort) return this.rows;

    const { key, dir } = this.sort;
    const factor = dir === 'asc' ? 1 : -1;

    return [...this.rows].sort((a: any, b: any) => {
      if (key === 'farmacia' || key === 'categoria') {
        return this.collator.compare(this.texto(a?.[key]), this.texto(b?.[key])) * factor;
      }

      const av = this.numero(a?.[key]);
      const bv = this.numero(b?.[key]);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return this.collator.compare(this.texto(a?.categoria), this.texto(b?.categoria));
    });
  }

  trackByRow(index: number, row: VentaCategoriaRow): string {
    return `${row.farmacia}-${row.categoria}-${index}`;
  }

  private mapRow(r: any): VentaCategoriaRow {
    return {
      farmacia: String(r?.farmacia || '').trim(),
      categoria: String(r?.categoria || 'Sin categoría').trim() || 'Sin categoría',
      cantidadVendida: this.numero(r?.cantidadVendida),
      costoTotal: this.numero(r?.costoTotal),
      importeVendido: this.numero(r?.importeVendido),
      utilidad: this.numero(r?.utilidad),
      margenPct: r?.margenPct === null || r?.margenPct === undefined ? null : this.numero(r?.margenPct),
    };
  }

  private calcularTotales(): void {
    this.totalCantidad = this.rows.reduce((a, r) => a + this.numero(r.cantidadVendida), 0);
    this.totalCosto = this.rows.reduce((a, r) => a + this.numero(r.costoTotal), 0);
    this.totalImporte = this.rows.reduce((a, r) => a + this.numero(r.importeVendido), 0);
    this.totalUtilidad = this.rows.reduce((a, r) => a + this.numero(r.utilidad), 0);
    this.totalMargenPct = this.totalImporte > 0 ? (this.totalUtilidad / this.totalImporte) * 100 : null;
  }

  private numero(v: any): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private texto(v: any): string {
    return String(v ?? '').trim();
  }

  private inicioMesCdmx(): string {
    const p = this.fechaCdmxParts();
    return `${p.year}-${p.month}-01`;
  }

  private hoyCdmx(): string {
    const p = this.fechaCdmxParts();
    return `${p.year}-${p.month}-${p.day}`;
  }

  private fechaCdmxParts(date: Date = new Date()): { year: string; month: string; day: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  private obtenerFarmaciaActivaId(): string {
    const candidatos = [
      localStorage.getItem('farmaciaActivaId'),
      localStorage.getItem('user_farmacia'),
      localStorage.getItem('farmaciaId'),
      localStorage.getItem('farmacia'),
      localStorage.getItem('sucursal'),
      localStorage.getItem('usuario'),
    ];

    for (const candidato of candidatos) {
      const id = this.extraerFarmaciaId(candidato);
      if (id) return id;
    }

    return '';
  }

  private extraerFarmaciaId(valor: any): string {
    if (!valor) return '';

    if (typeof valor === 'string') {
      const limpio = valor.trim();
      if (!limpio) return '';
      if (!limpio.startsWith('{') && !limpio.startsWith('[')) return limpio;

      try {
        return this.extraerFarmaciaId(JSON.parse(limpio));
      } catch {
        return '';
      }
    }

    if (Array.isArray(valor)) {
      for (const item of valor) {
        const id = this.extraerFarmaciaId(item);
        if (id) return id;
      }
      return '';
    }

    if (typeof valor === 'object') {
      return this.extraerFarmaciaId(
        valor._id || valor.id || valor.farmaciaId || valor.farmacia || valor.sucursal || valor.$oid
      );
    }

    return '';
  }
}

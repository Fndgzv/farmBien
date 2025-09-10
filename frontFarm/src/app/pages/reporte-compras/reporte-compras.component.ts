// src/app/pages/compras/compras.component.ts
import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CompraService } from '../../services/compra.service';

type RowCompra = {
  compraId: string;
  fecha: string | Date;
  proveedor: string;
  total: number;
  productos?: Array<{
    nombre: string;
    codigoBarras: string;
    cantidad: number;
    lote: string;
    fechaCaducidad: string | Date;
    costoUnitario: number;
    precioUnitario: number;
  }>;
};

@Component({
  selector: 'app-reporte-compras',
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatPaginatorModule,
    MatButtonModule, MatIconModule, MatTooltipModule
  ], templateUrl: './reporte-compras.component.html',
  styleUrl: './reporte-compras.component.css'
})
export class ReporteComprasComponent {
  // filtros
  proveedor = '';
  importeDesde: number | null = null;
  importeHasta: number | null = null;
  fechaIni = ''; // yyyy-MM-dd
  fechaFin = '';

  // datos
  rows: RowCompra[] = [];
  displayedColumns = ['fecha', 'proveedor', 'total', 'acciones'];

  // paginación
  page = 1;
  limit = 15;
  paginacion = { total: 0, page: 1, limit: 15 };

  // estado
  cargando = false;
  expandedId: string | null = null; // compraId para detalle expandido

  @ViewChild('paginator') paginator: any;

  constructor(private comprasSrv: CompraService, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.setFechasPorDefecto();
    this.buscar(true);
  }

  // ===== Helpers de fechas (blindadas a local) =====
  private toLocalISODate(d: Date): string {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  private setFechasPorDefecto(): void {
    const hoy = new Date();
    const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.fechaIni = this.toLocalISODate(primeroMes);
    this.fechaFin = this.toLocalISODate(hoy);
  }
  /** fechaFin inclusiva -> enviamos fin+1 para usar $lt en backend */
  private getFechaFinExclusiveISO(): string {
    const fin = new Date(this.fechaFin);
    fin.setDate(fin.getDate() + 1);
    return this.toLocalISODate(fin);
  }

  limpiarFiltros(): void {
    this.proveedor = '';
    this.importeDesde = null;
    this.importeHasta = null;
    this.setFechasPorDefecto();
    this.page = 1;
    this.buscar(true);
  }

  // ===== Buscar / paginar =====
  buscar(reset = false): void {
    if (reset) this.page = 1;

    const params: any = {
      page: this.page,
      limit: this.limit,
    };

    if (this.fechaIni) params.fechaIni = this.fechaIni;
    if (this.fechaFin) params.fechaFin = this.getFechaFinExclusiveISO();
    if (this.proveedor) params.proveedor = this.proveedor.trim();
    if (this.importeDesde !== null && this.importeDesde !== undefined && this.importeDesde !== ('' as any)) {
      params.importeDesde = this.importeDesde;
    }
    if (this.importeHasta !== null && this.importeHasta !== undefined && this.importeHasta !== ('' as any)) {
      params.importeHasta = this.importeHasta;
    }

    this.cargando = true;
    this.expandedId = null;

    this.comprasSrv.listar(params).subscribe({
      next: (resp: any) => {
        const r = resp?.rows ?? [];
        const total = resp?.paginacion?.total ?? r.length;
        const page = resp?.paginacion?.page ?? this.page;
        const limit = resp?.paginacion?.limit ?? this.limit;

        this.rows = r;
        this.paginacion = { total, page, limit };
        this.limit = limit;
        this.page = page;

        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: _ => {
        this.rows = [];
        this.paginacion = { total: 0, page: 1, limit: this.limit };
        this.cargando = false;
      }
    });
  }

  cambioPagina(e: any): void {
    const sizeChanged = e.pageSize !== this.limit;
    this.limit = e.pageSize;
    this.page = sizeChanged ? 1 : (e.pageIndex + 1);
    this.expandedId = null;
    this.buscar(false);
  }

  // ===== detalle expandible =====
  toggleDetalle(row: RowCompra): void {
    this.expandedId = (this.expandedId === row.compraId) ? null : row.compraId;
  }

  trackByCompra = (_: number, r: RowCompra) => r.compraId;
  trackByProd = (_: number, p: any) => `${p.codigoBarras}-${p.lote}-${p.fechaCaducidad}`;
}

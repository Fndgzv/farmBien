// src/app/pages/compras/compras.component.ts
import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CompraService } from '../../services/compra.service';

import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';


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

export function paginatorEs(): MatPaginatorIntl {
  const p = new MatPaginatorIntl();
  p.itemsPerPageLabel = 'Compras por página:';
  p.nextPageLabel = 'Siguiente';
  p.previousPageLabel = 'Anterior';
  p.firstPageLabel = 'Inicio';
  p.lastPageLabel = 'Fin';
  p.getRangeLabel = (page, pageSize, length) => {
    if (length === 0 || pageSize === 0) return `0 de ${length}`;
    const start = page * pageSize + 1;
    const end = Math.min(start + pageSize - 1, length);
    return `${start} – ${end} de ${length}`;
  };
  return p;
}

@Component({
  selector: 'app-reporte-compras',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatPaginatorModule, FontAwesomeModule,
    MatButtonModule, MatIconModule, MatTooltipModule
  ], 
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorEs }],
  templateUrl: './reporte-compras.component.html',
  styleUrl: './reporte-compras.component.css'
})

export class ReporteComprasComponent {
  // filtros
  proveedor = '';
  importeDesde: number | null = null;
  importeHasta: number | null = null;
  fechaIni = ''; // yyyy-MM-dd
  fechaFin = '';
  productoNombre = '';
  codigoBarras = '';

  // datos
  rows: RowCompra[] = [];
  displayedColumns = ['acciones', 'fecha', 'proveedor', 'total'];


  @ViewChild(MatTable) table!: MatTable<RowCompra>;
  isDetailRow = (_: number, row: RowCompra) => this.expandedId === row.compraId;

  // paginación
  page = 1;
  limit = 15;
  paginacion = { total: 0, page: 1, limit: 15 };

  // estado
  cargando = false;
  expandedId: string | null = null; // compraId para detalle expandido

  @ViewChild('paginator') paginator: any;

  faTimes = faTimes;

  footer: { totalCompras: number } | null = null;

  constructor(private comprasSrv: CompraService, private cdr: ChangeDetectorRef, private library: FaIconLibrary,) {
    library.addIcons( faTimes );
  }

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
    this.productoNombre = '';
    this.codigoBarras = '';
    this.page = 1;
    this.buscar(true);
  }

  limpiarCodigo(): void {
    this.codigoBarras = '';
    this.buscar(true);
  }

  limpiarIni(): void {
    const hoy = new Date();
    const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.fechaIni = this.toLocalISODate(primeroMes);
  }

  limpiarFin(): void {
    const hoy = new Date();
    this.fechaFin = this.toLocalISODate(hoy);
  }

  limpiarDesde(): void {
    this.importeDesde = null;
    this.buscar(true);
  }
  
  limpiarHasta(): void {
    this.importeHasta = null;
    this.buscar(true);
  }

  limpiarProveedor(): void {
    this.proveedor = '';
    this.buscar(true);
  }

  limpiarProducto(): void {
    this.productoNombre = '';
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
    if (this.fechaFin) params.fechaFin = this.fechaFin;
    if (this.proveedor) params.proveedor = this.proveedor.trim();
    if (this.importeDesde !== null && this.importeDesde !== undefined && this.importeDesde !== ('' as any)) {
      params.importeDesde = this.importeDesde;
    }
    if (this.importeHasta !== null && this.importeHasta !== undefined && this.importeHasta !== ('' as any)) {
      params.importeHasta = this.importeHasta;
    }
    if (this.productoNombre?.trim()) params.productoNombre = this.productoNombre.trim();
    if (this.codigoBarras?.trim()) params.codigoBarras = this.codigoBarras.trim();


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

        this.footer = resp?.footer ?? null;

        this.cargando = false;
        this.cdr.detectChanges();
        this.table?.renderRows();

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
    this.table?.renderRows();
  }

  trackByCompra = (_: number, r: RowCompra) => r.compraId;
  trackByProd = (_: number, p: any) => `${p.codigoBarras}-${p.lote}-${p.fechaCaducidad}`;
}

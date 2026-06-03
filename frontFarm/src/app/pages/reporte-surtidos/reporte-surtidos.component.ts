import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

import { Farmacia, FarmaciaService } from '../../services/farmacia.service';
import { ReportesService } from '../../services/reportes.service';
import { finalize } from 'rxjs';

interface SurtidoReporteItem {
  producto: string;
  codigoBarras: string;
  categoria: string;
  cantidad: number;
  ubicacionAlmacen: string;
  ubicacionFarmacia: string;
}

interface SurtidoReporteRow {
  _id: string;
  farmacia: string;
  fechaSurtido: string;
  usuario: string;
  usuarioExiste: boolean;
  items: SurtidoReporteItem[];
}

type DetalleSortKey = 'producto' | 'categoria' | 'ubicacionAlmacen' | 'ubicacionFarmacia';

@Component({
  selector: 'app-reporte-surtidos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './reporte-surtidos.component.html',
  styleUrl: './reporte-surtidos.component.css'
})
export class ReporteSurtidosComponent implements OnInit {
  farmacias: Farmacia[] = [];
  farmaciaId = '';
  fechaIni = this.inicioMesCdmx();
  fechaFin = this.hoyCdmx();
  cargando = false;
  rows: SurtidoReporteRow[] = [];
  expandedId: string | null = null;
  detalleSort: Record<string, { key: DetalleSortKey; dir: 1 | -1 }> = {};

  private readonly collator = new Intl.Collator('es', {
    sensitivity: 'base',
    numeric: true,
  });

  constructor(
    private farmaciaService: FarmaciaService,
    private reportesService: ReportesService
  ) { }

  ngOnInit(): void {
    this.cargarFarmacias();
    this.buscar();
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

  private hoyCdmx(): string {
    const p = this.fechaCdmxParts();
    return `${p.year}-${p.month}-${p.day}`;
  }

  private inicioMesCdmx(): string {
    const p = this.fechaCdmxParts();
    return `${p.year}-${p.month}-01`;
  }

  private cargarFarmacias(): void {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => {
        const ordenadas = [...(data || [])].sort((a, b) =>
          (a?.nombre || '').localeCompare(b?.nombre || '', 'es', { sensitivity: 'base' })
        );
        this.farmacias = [{ _id: '', nombre: 'TODAS' } as Farmacia, ...ordenadas];
      },
      error: () => {
        this.farmacias = [{ _id: '', nombre: 'TODAS' } as Farmacia];
      }
    });
  }

  buscar(): void {
    this.cargando = true;
    this.expandedId = null;

    this.reportesService.getSurtidos({
      farmaciaId: this.farmaciaId || undefined,
      fechaIni: this.fechaIni || undefined,
      fechaFin: this.fechaFin || undefined,
    })
      .pipe(finalize(() => this.cargando = false))
      .subscribe({
        next: (resp: any) => {
          this.detalleSort = {};
          this.rows = (resp?.rows || []).map((r: any) => ({
            ...r,
            farmacia: String(r?.farmacia || '').trim(),
            usuario: this.usuarioTabla(r),
            usuarioExiste: r?.usuarioExiste === true,
            items: Array.isArray(r?.items) ? r.items : []
          }));
        },
        error: (err) => {
          console.error('[reporte-surtidos][ERROR]', err);
          this.rows = [];
          Swal.fire('Error', err?.error?.mensaje || 'No se pudo consultar el reporte de surtidos.', 'error');
        }
      });
  }

  limpiar(): void {
    this.farmaciaId = '';
    this.fechaIni = this.inicioMesCdmx();
    this.fechaFin = this.hoyCdmx();
    this.buscar();
  }

  toggleDetalle(row: SurtidoReporteRow): void {
    this.expandedId = this.expandedId === row._id ? null : row._id;
  }

  isExpanded(row: SurtidoReporteRow): boolean {
    return !!row?._id && this.expandedId === row._id;
  }

  sortDetalle(row: SurtidoReporteRow, key: DetalleSortKey): void {
    const id = String(row?._id || '').trim();
    if (!id || !Array.isArray(row?.items)) return;

    const actual = this.detalleSort[id];
    const dir: 1 | -1 = actual?.key === key && actual.dir === 1 ? -1 : 1;
    this.detalleSort[id] = { key, dir };

    row.items = [...row.items].sort((a, b) => {
      const cmp = this.collator.compare(this.sortText(a?.[key]), this.sortText(b?.[key]));
      if (cmp !== 0) return cmp * dir;
      return this.collator.compare(this.sortText(a?.producto), this.sortText(b?.producto));
    });
  }

  getDetalleSortIcon(row: SurtidoReporteRow, key: DetalleSortKey): string {
    const id = String(row?._id || '').trim();
    const actual = id ? this.detalleSort[id] : null;
    if (!actual || actual.key !== key) return 'fa-sort';
    return actual.dir === 1 ? 'fa-sort-up' : 'fa-sort-down';
  }

  private sortText(value: any): string {
    return String(value ?? '').trim();
  }

  trackBySurtido = (_: number, row: SurtidoReporteRow) => row._id;

  private usuarioTabla(row: any): string {
    if (row?.usuario === 'Usuario inexistente') return 'Usuario inexistente';
    const usuario = String(row?.usuario || '').trim();
    return usuario || 'Usuario inexistente';
  }

  private usuarioImpresion(row: SurtidoReporteRow): string {
    if (!row?.usuarioExiste) return '';
    const usuario = String(row?.usuario || '').trim();
    return usuario === 'Usuario inexistente' ? '' : usuario;
  }

  private fechaArchivo(fecha: any): string {
    const d = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(d.getTime())) return this.hoyCdmx();
    const p = this.fechaCdmxParts(d);
    return `${p.year}-${p.month}-${p.day}`;
  }

  fechaCorta(fecha: any): string {
    const d = fecha ? new Date(fecha) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  }

  exportarExcel(row: SurtidoReporteRow): void {
    const items = Array.isArray(row?.items) ? row.items : [];
    if (!items.length) {
      Swal.fire('Aviso', 'El surtido no tiene items para exportar.', 'info');
      return;
    }

    const data = items.map((it) => ({
      Producto: it.producto || '',
      'Código': it.codigoBarras || '',
      'Categoría': it.categoria || '',
      'Cant.': Number(it.cantidad || 0),
      'Ubic. Almac': it.ubicacionAlmacen || '',
      'Ubic. Farma': it.ubicacionFarmacia || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 45 },
      { wch: 18 },
      { wch: 22 },
      { wch: 8 },
      { wch: 22 },
      { wch: 22 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Surtido');

    const safeFarm = this.safeFileName(row.farmacia || 'sin-farmacia');
    const file = `surtido_${safeFarm}_${this.fechaArchivo(row.fechaSurtido)}.xlsx`;
    XLSX.writeFile(wb, file);
  }

  imprimir(row: SurtidoReporteRow): void {
    const html = this.buildPrintHtml(row);
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) {
      Swal.fire('Error', 'No se pudo abrir la ventana de impresión.', 'error');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 200);
  }

  private buildPrintHtml(row: SurtidoReporteRow): string {
    const usuario = this.usuarioImpresion(row);
    const filas = (row.items || []).map((it) => `
      <tr>
        <td class="producto"><span>${this.esc(it.producto)}</span></td>
        <td>${this.esc(it.codigoBarras)}</td>
        <td>${this.esc(it.categoria)}</td>
        <td class="num">${Number(it.cantidad || 0)}</td>
        <td>${this.esc(it.ubicacionAlmacen)}</td>
        <td>${this.esc(it.ubicacionFarmacia)}</td>
      </tr>
    `).join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hoja de surtido</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
    .page { padding: 8mm; }
    .titulo { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 4px; }
    .farmacia { text-align: center; font-size: 12px; font-weight: 700; margin: 0 0 8px; }
    .meta { display: flex; justify-content: space-between; align-items: center; font-size: 10px; margin-bottom: 6px; min-height: 14px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
    th, td { border: 1px solid #d0d0d0; padding: 2px 3px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f3f3f3; text-align: left; }
    .num { text-align: right; }
    .producto span {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.15;
      max-height: 2.3em;
    }
    .col-producto { width: 34%; }
    .col-codigo { width: 15%; }
    .col-categoria { width: 15%; }
    .col-cant { width: 7%; }
    .col-ubic { width: 14.5%; }
    @media print {
      @page { size: letter portrait; margin: 7mm; }
      .page { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <p class="titulo">Hoja de surtido</p>
    <p class="farmacia">Farmacia: ${this.esc(row.farmacia || '')}</p>
    <div class="meta">
      <div>${usuario ? `Usuario: ${this.esc(usuario)}` : ''}</div>
      <div>Fecha: ${this.esc(this.fechaCorta(row.fechaSurtido))}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-producto">Producto</th>
          <th class="col-codigo">Código</th>
          <th class="col-categoria">Categoría</th>
          <th class="col-cant num">Cant.</th>
          <th class="col-ubic">Ubic. Almac</th>
          <th class="col-ubic">Ubic. Farma</th>
        </tr>
      </thead>
      <tbody>
        ${filas || '<tr><td colspan="6">Sin items</td></tr>'}
      </tbody>
    </table>
    <div class="no-print" style="margin-top:8px;">
      <button onclick="window.print()">Imprimir</button>
      <button onclick="window.close()">Cerrar</button>
    </div>
  </div>
</body>
</html>`;
  }

  private esc(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private safeFileName(value: string): string {
    return String(value || '').trim().replace(/[\\/:*?"<>|]/g, '_') || 'surtido';
  }
}

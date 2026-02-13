// frontFarm/src/app/pages/surtir-farmacia.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';

import Swal from 'sweetalert2';

import { FarmaciaService } from '../../services/farmacia.service';
import { SurtidoFarmaciaService } from '../../services/surtido-farmacia.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize } from 'rxjs';
import * as XLSX from 'xlsx';

interface Pendiente {
  producto: string;
  nombre: string;
  codigoBarras: string;
  categoria: string;
  ubicacion: string;
  ubicacionFarmacia: string;
  existenciaActual: number;
  stockMin: number;
  stockMax: number;
  falta: number;
  podranSurtirse: number;
  disponibleEnAlmacen: number;
  faltanEnAlmacen: number;
  omitir: boolean;
}

@Component({
  selector: 'app-surtir-farmacia',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTooltipModule
  ],
  templateUrl: './surtir-farmacia.component.html',
  styleUrl: './surtir-farmacia.component.css'
})
export class SurtirFarmaciaComponent implements OnInit {

  getSortArrow(key: any): string {
    if (this.sortKey !== key) return '↕';     // no activa
    return this.sortDir === 1 ? '↑' : '↓';    // activa
  }

  form: FormGroup;
  farmacias: any[] = [];
  pendientes: Pendiente[] = [];
  cargando = false;
  rows: Pendiente[] = [];

  // Paginación
  page = 1;
  pageSize = 15;
  totalItems = 0;
  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }
  get pagedRows() {
    const start = (this.page - 1) * this.pageSize;
    return this.rows.slice(start, start + this.pageSize);
  }
  private resetPagination() {
    this.totalItems = this.rows.length;
    this.page = 1;
  }
  goFirst() { this.page = 1; }
  goPrev() { if (this.page > 1) this.page--; }
  goNext() { if (this.page < this.totalPages) this.page++; }
  goLast() { this.page = this.totalPages; }

  trackByProd = (_: number, p: Pendiente) => p.producto || p.codigoBarras;

  constructor(
    private fb: FormBuilder,
    private farmaciaService: FarmaciaService,
    private surtidoService: SurtidoFarmaciaService
  ) {
    this.form = this.fb.group({
      farmaciaId: [null, Validators.required],
      categoria: [''],
      ubicacion: [''],
      ubicacionFarmacia: [''],
    });
  }

  ngOnInit() {
    this.farmaciaService.obtenerFarmacias().subscribe(data => {
      this.farmacias = data;
    });
  }

  limpiarFiltros() {
    this.form.patchValue({ categoria: '', ubicacion: '', ubicacionFarmacia: '' });
  }

  private toggleFarmacia(disabled: boolean) {
    ['farmaciaId', 'categoria', 'ubicacion', 'ubicacionFarmacia'].forEach(k => { // NUEVO
      const ctrl = this.form.get(k)!;
      disabled ? ctrl.disable() : ctrl.enable();
    });
  }

  onAceptar() {
    if (this.form.invalid) return;
    this.cargando = true;

    const { farmaciaId, categoria, ubicacion, ubicacionFarmacia } = this.form.value;

    this.surtidoService.obtenerPendientes(farmaciaId, { categoria, ubicacion, ubicacionFarmacia }).subscribe({
      next: ({ pendientes }) => {
        this.pendientes = (pendientes || []).map((p: any) => {
          const falta = Number(p?.falta ?? 0);
          const podran = Number(p?.podranSurtirse ?? 0);
          return {
            ...p, omitir: false,
            faltanEnAlmacen: Math.max(0, falta - podran)
          };
        });
        this.rows = this.pendientes;
        this.applySort();
        this.resetPagination();
        this.cargando = false;

        console.log('productos pendientes de surtir: ', pendientes);

        if (this.rows.length === 0) {
          Swal.fire({
            icon: 'info',
            title: 'Sin pendientes',
            html: `No hay productos con existencia <= stock mínimo`,
            confirmButtonText: 'Aceptar',
            allowOutsideClick: false,
            allowEscapeKey: false
          });
          return;
        }

        this.toggleFarmacia(true);
      },
      error: (err) => {
        console.error(err);
        Swal.fire('Error', 'No se pudieron cargar los productos.', 'error');
        this.cargando = false;
      }
    });
  }

  get totalOmitidos(): number {
    return this.rows.filter(r => r.omitir).length;
  }

  omitirTodos() {
    this.rows.forEach(r => r.omitir = true);
  }

  quitarOmisiones() {
    this.rows.forEach(r => r.omitir = false);
  }

  onSurtir() {
    const { farmaciaId, categoria, ubicacion, ubicacionFarmacia } = this.form.value;
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';

    const detalles = this.rows.map(r => ({
      producto: r.producto,
      omitir: !!r.omitir
    }));

    Swal.fire({
      icon: 'question',
      title: 'Confirmar surtido',
      html: `
      Se surtirá a la farmacia <strong>${farmNombre}</strong> respetando las omisiones marcadas.<br>
      <small>Omitidos: ${this.totalOmitidos} / ${this.rows.length}</small>
    `,
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false
    }).then(result => {
      if (!result.isConfirmed) {
        this.toggleFarmacia(false);
        return;
      }

      // Abrir loader (modal nuevo)
      Swal.fire({
        title: 'Surtido en progreso...',
        html: 'Generando hoja y actualizando inventarios.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
      });

      this.surtidoService.surtirFarmacia(farmaciaId, detalles, { categoria, ubicacion, ubicacionFarmacia })
        .pipe(
          // ¡OJO! aquí NO cerramos el Swal. Sólo limpiamos estado si quieres.
          finalize(() => {
            // cualquier bandera/estado UI que quieras restablecer
          })
        )
        .subscribe({
          next: (res: any) => {
            // Cerrar SOLO el loader
            Swal.close();

            // Ahora sí mostramos la pregunta de impresión
            Swal.fire({
              icon: 'success',
              title: 'Surtido completado',
              html: '¿Deseas imprimir la hoja de surtido?',
              showCancelButton: true,
              confirmButtonText: 'Sí',
              cancelButtonText: 'No',
              allowOutsideClick: false,
              allowEscapeKey: false
            }).then((d) => {
              if (d.isConfirmed && res?.surtido) {
                this.imprimirReal(res.surtido);
              }
              this.pendientes = [];
              this.form.reset({ farmaciaId: null });
              this.toggleFarmacia(false);
            });
          },
          error: (err) => {
            console.error(err);
            // Cerrar SOLO el loader
            Swal.close();

            const msg = err?.error?.detalle || err?.error?.mensaje || 'No se pudo surtir la farmacia.';
            Swal.fire('Aviso', msg, 'warning');
            this.toggleFarmacia(false);
          }
        });
    });
  }

  onCancelar() {
    this.pendientes = [];
    this.form.reset({ farmaciaId: null });
    this.toggleFarmacia(false);
  }

  // funciones de impresión
  // ===== Helpers de formato =====
  private fmtFecha(d = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ===== Helpers =====
  private norm(s: any): string { return String(s ?? '').toLowerCase().trim(); }
  private cmp(a: string, b: string) { return (a > b ? 1 : a < b ? -1 : 0); }

  // ===== Previa (usa this.rows) =====
  // ===== Previa (usa this.rows, filtra omitidos y disponible>0) =====
  private buildHTMLPrevia(): string {
    const { farmaciaId, categoria, ubicacion, ubicacionFarmacia } = this.form.getRawValue();
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';
    const ahora = this.fmtFecha();

    const filtrosHtml = `
    ${categoria ? `<div>Filtro categoría: <b>${categoria}</b></div>` : ''}
    ${ubicacion ? `<div>Filtro ubicación: <b>${ubicacion}</b></div>` : ''}
    ${ubicacionFarmacia ? `<div>Filtro ubicación farmacia: <b>${ubicacionFarmacia}</b></div>` : ''}
  `;

    const filasData = this.rows
      .filter(r => !r.omitir && (r.podranSurtirse ?? 0) > 0)
      .sort((a, b) =>
        this.cmp(this.norm(a.ubicacionFarmacia), this.norm(b.ubicacionFarmacia)) ||
        this.cmp(this.norm(a.ubicacion), this.norm(b.ubicacion)) ||
        this.cmp(this.norm(a.nombre), this.norm(b.nombre))
      );

    const filas = filasData.map(r => `
      <tr>
        <td>${r.codigoBarras || ''}</td>
        <td>${r.nombre || ''}</td>
        <td class="num">${r.podranSurtirse ?? 0}</td>
        <td>${r.ubicacion || '-'}</td>
        <td>${r.ubicacionFarmacia || '-'}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Hoja de Surtido - Previa</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 10px; }
  .encabezado { text-align:center; margin-bottom: 6px; }
  .titulo { font-size: 14px; margin: 0; font-weight: 700; }
  .sub { font-size: 11px; margin: 0; color: #444; }
  .meta { font-size: 10px; margin: 4px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
  th, td { border-bottom: 1px solid #ddd; padding: 3px 6px; }
  th { background:#f6f6f6; text-align:left; }
  td.num { text-align: right; }
  td.writein {
    width: 110px;
    border-bottom: 1px solid #999;
    padding: 3px 6px;
    line-height: 1.2;
  }  
  thead th.codigo { width: 110px; }
  thead th.cant   { width: 110px; text-align: right; }
  thead th.ubic   { width: 180px; }
  thead th.ubf { width: 180px; }
  tfoot td { border-top: 2px solid #000; font-weight: bold; padding-top: 4px; }
  @media print {
    @page { size: Letter portrait; margin: 8mm; }
    body { margin: 0; }
    .no-print { display:none !important; }
  }
</style>
</head>
<body>
  <div class="encabezado">
    <p class="titulo">Hoja de Surtido (Previa)</p>
    <p class="sub">${farmNombre ? `Farmacia: <b>${farmNombre}</b>` : ''}</p>
  </div>

  <div class="meta">
    Fecha: <b>${ahora}</b>
    ${filtrosHtml}
  </div>

  <table>
    <thead>
      <tr>
        <th class="codigo">Código</th>
        <th>Producto</th>
        <th class="cant">Cant. a surtir</th>
        <th class="ubic">Ubicación almacén</th>
        <th class="ubf">Ubicación farmacia</th>
      </tr>
    </thead>
    <tbody>
      ${filas || `<tr><td colspan="5">Sin items para surtir</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Registros: ${filasData.length}</td>
      </tr>
    </tfoot>
  </table>

  <div class="no-print" style="margin-top:8px;">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
</body>
</html>`;
  }

  // ===== Real (usa surtido.items) =====
  private buildHTMLReal(surtido: any): string {
    const { farmaciaId, categoria, ubicacion, ubicacionFarmacia } = this.form.getRawValue();
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';
    const fecha = surtido?.fechaSurtido ? this.fmtFecha(new Date(surtido.fechaSurtido)) : this.fmtFecha();

    const filtrosHtml = `
    ${categoria ? `<div>Filtro categoría: <b>${categoria}</b></div>` : ''}
    ${ubicacion ? `<div>Filtro ubicación: <b>${ubicacion}</b></div>` : ''}
    ${ubicacionFarmacia ? `<div>Filtro ubicación farmacia: <b>${ubicacionFarmacia}</b></div>` : ''}
  `;

    const items = (surtido?.items || []).slice().sort((a: any, b: any) =>
      this.cmp(this.norm(a?.ubicacionFarmacia), this.norm(b?.ubicacionFarmacia)) ||
      this.cmp(this.norm(a?.producto?.ubicacion), this.norm(b?.producto?.ubicacion)) ||
      this.cmp(this.norm(a?.producto?.nombre), this.norm(b?.producto?.nombre))
    );

    const filas = items.map((it: any) => `
    <tr>
      <td>${it?.producto?.codigoBarras || ''}</td>
      <td>${it?.producto?.nombre || ''}</td>
      <td class="num">${it?.podranSurtirse ?? 0}</td>
      <td>${it?.producto?.ubicacion || '-'}</td>
      <td>${it?.ubicacionFarmacia || '-'}</td>
    </tr>
  `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Hoja de Surtido - Final</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 10px; }
  .encabezado { text-align:center; margin-bottom: 6px; }
  .titulo { font-size: 14px; margin: 0; font-weight: 700; }
  .sub { font-size: 11px; margin: 0; color: #444; }
  .meta { font-size: 10px; margin: 4px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border-bottom: 1px solid #ddd; padding: 3px 6px; }
  th { background:#f6f6f6; text-align:left; }
  td.num { text-align: right; }
  td.writein { width: 110px; }
  thead th.codigo { width: 110px; }
  thead th.cant   { width: 110px; text-align: right; }
  thead th.ubic   { width: 160px; }
  thead th.ubf { width: 160px; }
  tfoot td { border-top: 2px solid #000; font-weight: bold; padding-top: 4px; }
  @media print {
    @page { size: Letter portrait; margin: 8mm; }
    body { margin: 0; }
    .no-print { display:none !important; }
  }
</style>
</head>
<body>
  <div class="encabezado">
    <p class="titulo">Hoja de Surtido (Real)</p>
    <p class="sub">${farmNombre ? `Farmacia: <b>${farmNombre}</b>` : ''}</p>
  </div>

  <div class="meta">
    Surtido ID: <b>${surtido?._id || '-'}</b><br>
    Fecha surtido: <b>${fecha}</b>
    ${filtrosHtml}
  </div>

  <table>
    <thead>
      <tr>
        <th class="codigo">Código</th>
        <th>Producto</th>
        <th class="cant">Cant. a surtir</th>
        <th class="ubic">Ubicación almacén</th>
        <th class="ubf">Ubicación farmacia</th>
      </tr>
    </thead>
    <tbody>
      ${filas || `<tr><td colspan="5">Sin items</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Productos surtidos: ${items.length}</td>
      </tr>
    </tfoot>
  </table>

  <div class="no-print" style="margin-top:8px;">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
</body>
</html>`;
  }

  // ====== 2.3) Abrir ventana y disparar impresión ======
  private printHTML(html: string) {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    // algunos navegadores necesitan esperar el render
    setTimeout(() => win.focus(), 50);
  }

  // ====== 2.4) API pública desde botones ======
  imprimirPrevia() {
    if (!this.rows.length) return;
    const html = this.buildHTMLPrevia();
    this.printHTML(html);
  }

  imprimirReal(surtido: any) {
    const html = this.buildHTMLReal(surtido);
    this.printHTML(html);
  }

  exportarExcel(): void {
    if (!this.rows?.length) {
      Swal.fire('Aviso', 'No hay datos para exportar', 'info');
      return;
    }
    const { farmaciaId, categoria, ubicacion } = this.form.getRawValue(); // NUEVO
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';
    const fechaStamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Encabezado con filtros
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      ['Hoja de Surtido'],
      [`Farmacia: ${farmNombre}`],
      [`Generado: ${fechaStamp}`],
      [categoria ? `Filtro categoría: ${categoria}` : ''],
      [ubicacion ? `Filtro ubicación: ${ubicacion}` : ''],
      [''] // línea en blanco
    ], { origin: 'A1' });

    // ... resto de tu export (igual que ya tenías) ...
    const data = this.rows.map(r => ({
      'Código de barras': r.codigoBarras || '',
      'Producto': r.nombre || '',
      'Categoría': r.categoria || '',
      'Ubicación almacén': r.ubicacion || '',
      'Ubicación farmacia': r.ubicacionFarmacia || '',
      'Existencia actual': r.existenciaActual ?? 0,
      'Stock Mín': r.stockMin ?? 0,
      'Stock Máx': r.stockMax ?? 0,
      'Faltante (farmacia)': r.falta ?? 0,
      'Podrán surtir': r.podranSurtirse ?? 0,
      'Disponible en almacén': r.disponibleEnAlmacen ?? 0,
      'Faltan en almacén': r.faltanEnAlmacen ?? 0,
      'Omitir': r.omitir ? 'Sí' : 'No',
    }));
    XLSX.utils.sheet_add_json(ws, data, { origin: 'A7', skipHeader: false });
    // ... (mismos anchos, formatos y totales que ya pusiste) ...
    // (por brevedad no repito todo el bloque; puedes conservar el tuyo)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Surtido');
    const safeFarm = (farmNombre || 'sin-farmacia').replace(/[\\/:*?"<>|]/g, '_');
    const file = `surtido_${safeFarm}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`;
    XLSX.writeFile(wb, file);
  }

  sortKey: 'categoria' | 'disponibleEnAlmacen' | 'existenciaActual' | 'falta' | 'podranSurtirse' | 'faltanEnAlmacen' | 'ubicacion' | 'ubicacionFarmacia' = 'categoria';
  sortDir: 1 | -1 = 1;

  setSort(key: typeof this.sortKey) {
    if (this.sortKey === key) this.sortDir = (this.sortDir === 1 ? -1 : 1);
    else { this.sortKey = key; this.sortDir = 1; }

    this.applySort();
  }

  private applySort() {
    const dir = this.sortDir;
    const key = this.sortKey;

    const isNum = new Set([
      'disponibleEnAlmacen', 'existenciaActual', 'falta', 'podranSurtirse', 'faltanEnAlmacen'
    ]);

    this.rows = (this.rows || []).slice().sort((a: any, b: any) => {
      const av = a?.[key];
      const bv = b?.[key];

      if (isNum.has(key)) return (Number(av ?? 0) - Number(bv ?? 0)) * dir;

      const as = this.norm(av);
      const bs = this.norm(bv);
      return (as > bs ? 1 : as < bs ? -1 : 0) * dir;
    });

    this.resetPagination();
  }


}

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

interface Pendiente {
  producto: string;
  nombre: string;
  codigoBarras: string;
  categoria: string;
  ubicacion: string;
  existenciaActual: number;
  stockMin: number;
  stockMax: number;
  falta: number;
  disponibleEnAlmacen: number;
  // NUEVO:
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
    });
  }

  ngOnInit() {
    this.farmaciaService.obtenerFarmacias().subscribe(data => {
      this.farmacias = data;
    });
  }

  private toggleFarmacia(disabled: boolean) {
    const farmCtrl = this.form.get('farmaciaId')!;
    disabled ? farmCtrl.disable() : farmCtrl.enable();
  }

  onAceptar() {
    if (this.form.invalid) return;
    this.cargando = true;
    const farmaciaId = this.form.value.farmaciaId;

    this.surtidoService.obtenerPendientes(farmaciaId).subscribe({
      next: ({ pendientes }) => {
        // Inicializa omitir = false
        this.pendientes = (pendientes || []).map((p: any) => ({
          ...p,
          omitir: false
        }));

        console.log('Pendientes', pendientes);

        this.rows = this.pendientes; // fuente de la tabla/paginación
        this.resetPagination();
        this.cargando = false;

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
  const farmaciaId = this.form.value.farmaciaId;
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

    this.surtidoService.surtirFarmacia(farmaciaId, detalles)
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

  // ====== 2.1) Construir HTML imprimible (modo previa) ======
  private buildHTMLPrevia(): string {
    const farmaciaId = this.form.value.farmaciaId;
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';
    const ahora = this.fmtFecha();

    const filas = this.rows.map(r => {
      const omit = r.omitir ? ' class="omitida"' : '';
      const tagOmit = r.omitir ? '<span class="chip chip-omit">OMITIDO</span>' : '';
      return `
      <tr${omit}>
        <td>${r.codigoBarras || ''}</td>
        <td>${r.nombre || ''} ${tagOmit}</td>
        <td style="text-align:right">${r.existenciaActual ?? 0}</td>
        <td style="text-align:right">${r.stockMin ?? 0}</td>
        <td style="text-align:right">${r.stockMax ?? 0}</td>
        <td style="text-align:right">${r.falta ?? 0}</td>
        <td style="text-align:right">${r.disponibleEnAlmacen ?? 0}</td>
      </tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Hoja de Surtido - Previa</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 12px; }
  .encabezado { text-align:center; margin-bottom: 8px; }
  .titulo { font-size: 16px; margin: 0; font-weight: 700; }
  .sub { font-size: 12px; margin: 0; color: #444; }
  .meta { font-size: 11px; margin: 6px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px; }
  th { background:#f6f6f6; text-align:left; }
  tfoot td { border-top: 2px solid #000; font-weight: bold; }
  .omitida { color: #777; }
  .chip { display:inline-block; border:1px solid #aaa; padding:1px 5px; border-radius:8px; font-size:10px; margin-left:6px; }
  .chip-omit { border-color:#b55; color:#b55; }
  .leyenda { font-size:10px; color:#555; margin-top:8px; }
  @media print {
    @page { size: Letter portrait; margin: 10mm; }
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
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:100px">Código</th>
        <th>Producto</th>
        <th style="width:70px; text-align:right">Exist.</th>
        <th style="width:70px; text-align:right">Stock Min</th>
        <th style="width:70px; text-align:right">Stock Max</th>
        <th style="width:90px; text-align:right">Cant. a Surtir</th>
        <th style="width:100px; text-align:right">Disp. Almacén</th>
      </tr>
    </thead>
    <tbody>
      ${filas}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="7">Registros: ${this.rows.length} — Omitidos: ${this.totalOmitidos}</td>
      </tr>
    </tfoot>
  </table>
  <p class="leyenda">Esta es una previsualización. La hoja real puede variar según disponibilidad por lotes.</p>

  <div class="no-print" style="margin-top:10px;">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
</body>
</html>`;
  }

  // ====== 2.2) Construir HTML imprimible (modo REAL: items surtidos) ======
  private buildHTMLReal(surtido: any): string {
    // surtido esperado: { fechaSurtido, items:[{producto:{nombre,codigoBarras?}}, lote, cantidad, precioUnitario], ... }
    const farmaciaId = this.form.value.farmaciaId;
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';
    const fecha = surtido?.fechaSurtido ? this.fmtFecha(new Date(surtido.fechaSurtido)) : this.fmtFecha();

    const filas = (surtido?.items || []).map((it: any) => {
      const nombre = it?.producto?.nombre || '';
      const cod = it?.producto?.codigoBarras || '';
      const lote = it?.lote || 'SIN-LOTE';
      const cant = it?.cantidad ?? 0;
      const categoria = it?.producto?.categoria || '-';
      const ubicacion = it?.producto?.ubicacion || '-';
      return `
      <tr>
        <td>${cod}</td>
        <td>${nombre}</td>
        <td>${lote}</td>
        <td style="text-align:right">${cant}</td>
        <td>${categoria}</td>
        <td>${ubicacion}</td>
      </tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Hoja de Surtido - Final</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 12px; }
  .encabezado { text-align:center; margin-bottom: 8px; }
  .titulo { font-size: 16px; margin: 0; font-weight: 700; }
  .sub { font-size: 12px; margin: 0; color: #444; }
  .meta { font-size: 11px; margin: 6px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px; }
  th { background:#f6f6f6; text-align:left; }
  tfoot td { border-top: 2px solid #000; font-weight: bold; }
  @media print {
    @page { size: Letter portrait; margin: 10mm; }
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
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:100px">Código</th>
        <th>Producto</th>
        <th style="width:90px">Lote</th>
        <th style="width:80px; text-align:right">Cantidad</th>
        <th style="width:100px">Categoria</th>
        <th style="width:100px">Ubicacion</th>
      </tr>
    </thead>
    <tbody>
      ${filas || `<tr><td colspan="6">Sin items</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6">Productos surtidos: ${(surtido?.items || []).length}</td>
      </tr>
    </tfoot>
  </table>

  <div class="no-print" style="margin-top:10px;">
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

}

// frontFarm\src\app\pages\reporte-ventas-producto\reporte-ventas-producto.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportesService } from '../../services/reportes.service';
import { Farmacia, FarmaciaService } from '../../services/farmacia.service';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { VentasProductoDetalleItem } from '../../models/reportes.models';
import { toCSV, downloadCSV } from '../../utils/csv';
import { ProductoService } from '../../services/producto.service';
import { ProductoLite } from '../../models/producto-lite.model';

import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import Swal from 'sweetalert2';


@Component({
  selector: 'app-reporte-ventas-producto',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgFor, NgIf,
    MatFormFieldModule, MatInputModule, MatAutocompleteModule, MatIconModule],
  templateUrl: './reporte-ventas-producto.component.html',
  styleUrl: './reporte-ventas-producto.component.css'
})

export class ReporteVentasProductoComponent {
  // Filtros
  farmacias: Farmacia[] = [];
  farmaciaId = '';
  fechaIni = this.defaultIni();
  fechaFin = this.defaultFin();

  // Autocomplete (sustituye los 2 inputs)
  productoQuery = '';                       // lo que escribe el usuario
  productCtrl = new FormControl<string | ProductoLite>('');
  opcionesProductos: ProductoLite[] = [];   // lista de sugerencias
  productoId: string | null = null;         // id seleccionado
  codigoBarras = '';                         // se llena al seleccionar
  nombre = '';                               // se llena al seleccionar
  private query$ = new Subject<string>();    // stream de búsqueda

  // Datos
  cargando = false;
  rows: VentasProductoDetalleItem[] = [];
  totalCantidad = 0;
  totalImporte = 0;
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

  constructor(private farmaciaService: FarmaciaService,
    private reportes: ReportesService,
    private productosSrv: ProductoService) { }

  ngOnInit(): void {
    // Farmacias
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => this.farmacias = data ?? [],
      error: () => this.farmacias = []
    });

    // Autocomplete
    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const term = (q || '').trim();
          if (term.length < 2) {
            this.opcionesProductos = [];
            return of([]); // <-- importante: Observable vacío
          }
          return this.productosSrv.buscar(term);
        })
      )
      .subscribe({
        next: (list) => {
          this.opcionesProductos = Array.isArray(list) ? list : [];
        },
        error: (err) => {
          console.error('Error /productos/search:', err);
          this.opcionesProductos = [];
        }
      });

    // 🔎 autocomplete reactivo
    this.productCtrl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((val) => {
          const term =
            typeof val === 'string'
              ? val
              : (val?.nombre ?? val?.codigoBarras ?? '');
          const t = (term || '').trim();
          if (t.length < 2) {
            this.opcionesProductos = [];
            return of([]);
          }
          return this.productosSrv.buscar(t);
        })
      )
      .subscribe({
        next: (list) => (this.opcionesProductos = list || []),
        error: (err) => {
          console.error('Error /productos/search:', err);
          this.opcionesProductos = [];
        },
      });


  }

  // ======================
  // Autocomplete handlers
  // ======================
  onQueryChange(val: string) {
    this.query$.next(val);
    this.productoId = null;
    this.codigoBarras = '';
    this.nombre = '';
  }

  // Función para mostrar en el input el objeto seleccionado
  displayProducto = (p?: ProductoLite | string) =>
    typeof p === 'string'
      ? p
      : p
        ? `${p.codigoBarras ? p.codigoBarras + ' — ' : ''}${p.nombre}`
        : '';

  onProductoChange(val: string) {
    this.seleccionarDesdeInput(val);
  }

  onProductoBlur(val: string) {
    if (!this.productoId) this.seleccionarDesdeInput(val);
  }

  private seleccionarDesdeInput(val: string) {
    const v = (val || '').trim();
    if (!v) return;

    // 1) Match exacto por CÓDIGO
    const byCode = this.opcionesProductos.find(
      p => p.codigoBarras && p.codigoBarras === v
    );

    // 2) Match exacto por NOMBRE (case-insensitive)
    const byName = this.opcionesProductos.find(
      p => p.nombre.toLowerCase() === v.toLowerCase()
    );

    // 3) (fallback) match por string combinado previo "code — nombre"
    const byCombined = this.opcionesProductos.find(
      p => ((p.codigoBarras ? `${p.codigoBarras} — ` : '') + p.nombre) === v
    );

    const match = byCode || byName || byCombined;
    if (match) {
      this.productoId = match._id;
      this.codigoBarras = match.codigoBarras || '';
      this.nombre = match.nombre;
      // Muestra consistente en el input
      this.productoQuery = (match.codigoBarras ? `${match.codigoBarras} — ` : '') + match.nombre;
    }
  }

  buscar(): void {
    // Si el usuario escribió texto y no seleccionó opción
    const val = this.productCtrl.value;
    if (!this.productoId && typeof val === 'string' && val.trim()) {
      const q = val.trim();
      if (/^\d{5,}$/.test(q)) { this.codigoBarras = q; this.nombre = ''; }
      else { this.nombre = q; this.codigoBarras = ''; }
    }

    if (!this.productoId && !this.codigoBarras && !this.nombre) {
      Swal.fire({
        icon: 'warning',
        title: 'Aviso',
        text: 'Selecciona un producto o escribe código/nombre.',
        timer: 1600,
        timerProgressBar: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
      });
      return;
    }

    this.cargando = true;
    this.reportes.getVentasProductoDetalle({
      farmaciaId: this.farmaciaId || undefined,
      productoId: this.productoId || undefined,
      codigoBarras: !this.productoId ? (this.codigoBarras || undefined) : undefined,
      nombre: !this.productoId ? (this.nombre || undefined) : undefined,
      fechaIni: this.fechaIni,
      fechaFin: this.fechaFin
    }).subscribe({
      next: (resp: any) => {
        const toNum = (v: any) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };

        this.rows = resp?.items || [];

        // Totales calculados desde las filas (coherentes con lo que ves en la tabla)
        const sums = this.rows.reduce(
          (acc: any, r: any) => {
            acc.cant += toNum(r.cantidadVendida);
            acc.imp += toNum(r.importeTotal);
            acc.cost += toNum(r.costoTotal);
            acc.util += toNum(r.utilidad);
            return acc;
          },
          { cant: 0, imp: 0, cost: 0, util: 0 }
        );

        this.totalCantidad = sums.cant;
        this.totalImporte = sums.imp;
        this.totalCosto = sums.cost;
        this.totalUtilidad = sums.util;

        // % margen total derivado de los totales calculados
        this.totalMargenPct = this.totalImporte > 0
          ? (this.totalUtilidad / this.totalImporte) * 100
          : null;

        // Si quieres preferir lo que mande el backend (si es válido), descomenta:
        // const apiMargen = resp?.resumen?.margenPct;
        // if (Number.isFinite(Number(apiMargen))) this.totalMargenPct = Number(apiMargen);

        this.resetPagination();
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error reporte ventas producto:', err);
        this.rows = [];
        this.totalCantidad = 0;
        this.totalImporte = 0;
        this.totalCosto = 0;
        this.totalUtilidad = 0;
        this.totalMargenPct = null;
        this.cargando = false;
      }
    });
  }


  limpiar(): void {
    this.rows = [];
    this.totalCantidad = 0;
    this.totalImporte = 0;
    this.totalCosto = 0;
    this.totalUtilidad = 0;
    this.totalMargenPct = null;
    this.totalItems = 0;
    this.page = 1;

    this.farmaciaId = '';
    this.limpiarProducto();
    this.fechaIni = this.defaultIni();
    this.fechaFin = this.defaultFin();
    this.rows = [];
    this.totalCantidad = 0;
    this.totalImporte = 0;
    this.totalCosto = 0;
    this.totalUtilidad = 0;
    this.totalMargenPct = null;
  }

  exportarCSV(): void {
    if (!this.rows.length) return;
    const cols = [
      { key: 'fecha', label: 'Fecha', map: (r: any) => (r.fecha ? r.fecha.substring(0, 10) : '') },
      { key: 'farmaciaNombre', label: 'Farmacia' },
      { key: 'usuarioNombre', label: 'Usuario' },
      { key: 'codigoBarras', label: 'Código' },
      { key: 'productoNombre', label: 'Producto' },
      { key: 'cantidadVendida', label: 'Cantidad' },
      { key: 'importeTotal', label: 'Importe', map: (r: any) => Number(r.importeTotal ?? 0).toFixed(2) },
      { key: 'costoTotal', label: 'Costo', map: (r: any) => Number(r.costoTotal ?? 0).toFixed(2) },
      { key: 'utilidad', label: 'Utilidad', map: (r: any) => Number(r.utilidad ?? 0).toFixed(2) },
      { key: 'margenRenglonPct', label: 'Margen % (ren)', map: (r: any) => r.margenRenglonPct == null ? '' : Number(r.margenRenglonPct).toFixed(2) },
      { key: 'folio', label: 'Folio venta' },
    ];
    const csv = toCSV(this.rows, cols, { separator: ',', bom: true });
    const fname = `ventas_producto_${this.codigoBarras || this.nombre || 'producto'}_${this.fechaIni}_a_${this.fechaFin}.csv`;
    downloadCSV(fname, csv);
  }

  // ======================
  // Fechas helper
  // ======================
  private defaultIni(): string {
    const d = new Date(); d.setDate(d.getDate() - 15);
    return this.toLocalISO(d);
  }
  private defaultFin(): string { return this.toLocalISO(new Date()); }
  private toLocalISO(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  onOptionSelected(p: ProductoLite) {
    if (!p) return;
    this.productoId = p._id;
    this.codigoBarras = p.codigoBarras || '';
    this.nombre = p.nombre;
    this.productCtrl.setValue(p); // conserva el objeto en el input
  }

  limpiarProducto() {
    this.productCtrl.setValue('');      // limpia input
    this.opcionesProductos = [];
    this.productoId = null;
    this.codigoBarras = '';
    this.nombre = '';
  }

}
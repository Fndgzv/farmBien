import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, map } from 'rxjs';
import { HistorialProductoService, HistProdRow } from './historial-producto.service';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ProveedorService } from './../services/proveedor.service';
import { UsuarioService } from '../services/usuario.service';

type OrdenKey =
    | 'fecha' | 'proveedor' | 'producto' | 'lote' | 'fechaCaducidad'
    | 'costoUnitario' | 'cantidad' | 'costoTotal' | 'precioUnitario';

type Header = { label: string; key: OrdenKey; right?: boolean; money?: boolean; date?: boolean };

type FooterTotales = {
  compras: number | null | undefined;
  piezas: number | null | undefined;
  costoTotal: number | null | undefined;
  costoUnitProm: number | null | undefined;
  precioUnitProm: number | null | undefined;
};

export interface HistResp {
  ok?: boolean;
  page: number;
  pages: number;
  limit: number;
  total: number;
  columns: string[];
  rows: HistProdRow[];
  footer?: FooterTotales;
}

@Component({
    selector: 'app-historial-producto-page',
    imports: [CommonModule, ReactiveFormsModule, FormsModule, MatTooltipModule],
    templateUrl: './historial-producto-page.component.html',
    styleUrls: ['./historial-producto-page.component.css']
})
export class HistorialProductoPageComponent implements OnInit, OnDestroy {
    filtroForm!: FormGroup;

    // ---- estado
    cargando = false;

    // ✅ quitamos resp1 (duplicada) y nos quedamos con una sola respuesta
    resp: HistResp | null = null;

    rows: HistProdRow[] = [];
    columns: string[] = [];
    footer: any = null; // opcional si tu backend lo manda

    // ---- producto (sugerencias)
    prodSel: any = null;
    prodOpts: any[] = [];
    prodInput$ = new Subject<string>();
    subs: Subscription[] = [];

    // ---- orden / paginación
    orden: OrdenKey = 'fecha';
    dir: 'asc' | 'desc' = 'desc';
    page = 1;           // página actual
    limit = 20;         // por página

    // ✅ eliminamos "total" y "totalPages" como props sueltas; nos basamos en this.resp

    proveedores: Array<{ _id: string; nombre: string }> = [];
    usuarios: Array<{ _id: string; nombre: string }> = [];

    headers: Header[] = [
        { label: 'Fecha', key: 'fecha', date: true },
        { label: 'Proveedor', key: 'proveedor' },
        { label: 'Producto', key: 'producto' },
        { label: 'CB', key: 'precioUnitario' as any }, // mostrada desde row.codigoBarras (no ordenable en backend)
        { label: 'Lote', key: 'lote' },
        { label: 'Caducidad', key: 'fechaCaducidad', date: true },
        { label: 'Costo Unit.', key: 'costoUnitario', right: true, money: true },
        { label: 'Cantidad', key: 'cantidad', right: true },
        { label: 'Costo Total', key: 'costoTotal', right: true, money: true },
        { label: 'Precio Unit.', key: 'precioUnitario', right: true, money: true },
    ];

    constructor(
        private fb: FormBuilder,
        private svc: HistorialProductoService,
        private proveedorService: ProveedorService,
        private usuarioService: UsuarioService
    ) { }

    private toYmdLocal(d: Date): string {
        const d2 = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return d2.toISOString().slice(0, 10);
    }

    // === Utilidad para formateo local ===
    private money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
    private num = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

    ngOnInit(): void {
        const hoy = new Date();
        const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

        this.filtroForm = this.fb.group({
            fechaIni: [this.toYmdLocal(first)],
            fechaFin: [this.toYmdLocal(hoy)],
            // filtros de producto
            productoId: [''],
            q: [''],
            cb: [''],
            // otros filtros
            proveedorId: [''],
            usuarioId: [''],
            lote: [''],
            cadIni: [''],
            cadFin: [''],
        });

        // ✅ UN SOLO flujo de sugerencias vía Subject (debounce + distinctUntilChanged)
        this.subs.push(
            this.prodInput$.pipe(
                map(s => (s || '').trim()),
                debounceTime(180),
                distinctUntilChanged(),
                switchMap(q => q.length < 2 ? of([]) : this.svc.searchProductos(q))
            ).subscribe(list => this.prodOpts = Array.isArray(list) ? list : [])
        );

        this.cargarProveedores();
        this.cargarUsuarios();
        this.buscar();
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
    }

    private cargarProveedores() {
        this.proveedorService.obtenerProveedores().subscribe((data: any[]) => {
            this.proveedores = (data || [])
                .map(p => ({ _id: p._id, nombre: p.nombre || '(sin nombre)' }))
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        });
    }

    private cargarUsuarios() {
        this.usuarioService.obtenerUsuarios().subscribe((data: any[]) => {
            this.usuarios = (data || [])
                .map(u => ({ _id: u._id, nombre: u.nombre || u.usuario || '(sin nombre)' }))
                .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        });
    }

    formatCell(col: Header, r: any): string {
        const val = (
            col.label === 'CB' ? (r.codigoBarras ?? '') : // CB solo para mostrar
                r[col.key] // resto viene del backend con el mismo nombre de campo
        );

        if (val == null) return '—';
        if (col.date) {
            try { return new Date(val).toLocaleDateString('es-MX'); } catch { return '—'; }
        }
        if (col.money) return this.money.format(+val || 0);
        if (typeof val === 'number') return this.num.format(val);
        return String(val);
    }

    // === Ordenar server-side (reusa tu buscar(false)) ===
    onHeaderClick(h: Header) {
        // 'CB' no es ordenable en backend, ignora click
        if (h.label === 'CB') return;

        if (this.orden === h.key) {
            this.dir = this.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.orden = h.key;
            this.dir = 'desc';
        }
        this.buscar(true); // vuelve a página 1 al cambiar orden
    }

    // === CSV ===
    exportCsv() {
        // Cabeceras visibles
        const cols = this.headers.map(h => h.label);

        // Filas visibles (las de la página actual)
        const rows = (this.rows || []).map(r => this.headers.map(h => this.formatCell(h, r)));

        const csv = [cols, ...rows].map(line => line.map(csvEscape).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        const f1 = this.filtroForm.value.fechaIni ?? '';
        const f2 = this.filtroForm.value.fechaFin ?? '';
        a.download = `historial_producto_${f1}_${f2}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        function csvEscape(x: any): string {
            const s = (x ?? '').toString();
            // rodea con comillas si trae coma, comilla o salto de línea
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        }
    }

    // ---- UX producto

    // ✅ Esta función SOLO empuja al Subject (para mantener un único camino)
    onProdInput(q: string) {
        this.prodInput$.next((q || '').trim());
    }

    selectProd(p: any) {
        this.prodSel = p;
        this.prodOpts = [];
        this.filtroForm.patchValue({
            productoId: p?._id || '',
            q: '',                          // limpiamos el texto libre
            cb: p?.codigoBarras || ''       // lo dejamos por si quieres mostrarlo en un <small>
        });
    }

    clearProd(input?: HTMLInputElement) {
        this.prodSel = null;
        this.filtroForm.patchValue({ productoId: '', q: '', cb: '' });
        this.prodOpts = [];
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => input.focus(), 0);
        }
    }

    // ---- acciones
    buscar(resetPage = true) {
        if (this.cargando) return;
        if (resetPage) this.page = 1;
        this.cargando = true;

        const v = this.filtroForm.getRawValue();
        const params = {
            ...v,
            orden: this.orden,
            dir: this.dir,
            page: this.page,
            limit: this.limit
        };

        this.svc.getHistorial(params).subscribe({
            next: (r) => {
                // ✅ guardamos la respuesta única
                this.resp = r;
                this.rows = r?.rows || [];
                this.columns = r?.columns || [];
                this.page = r?.page ?? this.page;
                this.limit = r?.limit ?? this.limit;

                console.log('Respuesta: ', this.resp);
                

                this.cargando = false;
            },
            error: () => { this.cargando = false; }
        });
    }

    sortBy(k: OrdenKey) {
        if (this.orden === k) {
            this.dir = this.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.orden = k;
            this.dir = 'desc';
        }
        this.buscar(false);
    }

    // ---- Paginación: solo 4 botones (Inicio/Anterior/Siguiente/Fin)
    get totalPages(): number {
        const n = this.resp?.pages ?? 0;
        return n > 0 ? n : 0;
    }
    get totalRows(): number {
        return this.resp?.total ?? (this.rows?.length ?? 0);
    }

    canPrev(): boolean { return this.page > 1; }
    canNext(): boolean { return this.page < this.totalPages; }

    changePage(p: number) {
        if (this.cargando) return;
        if (p < 1 || p > this.totalPages || p === this.page) return;
        this.page = p;
        this.buscar(false);
    }
    goFirst() { if (this.canPrev()) this.changePage(1); }
    goPrev() { if (this.canPrev()) this.changePage(this.page - 1); }
    goNext() { if (this.canNext()) this.changePage(this.page + 1); }
    goLast() { if (this.canNext()) this.changePage(this.totalPages); }

    // ---- reset
    limpiar(prodInput?: HTMLInputElement) {
        const hoy = new Date();
        const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

        this.filtroForm.patchValue({
            fechaIni: this.toYmdLocal(first),
            fechaFin: this.toYmdLocal(hoy),
            productoId: '', q: '', cb: '',
            proveedorId: '', usuarioId: '', lote: '',
            cadIni: '', cadFin: '',
        });

        // ✅ limpiamos estado visual
        this.columns = [];
        this.rows = [];
        this.resp = null;       // <- resetea páginas y totales
        this.footer = null;

        this.prodSel = null;
        this.prodOpts = [];

        if (prodInput) {
            prodInput.value = '';
            prodInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        this.page = 1;
        this.orden = 'fecha';
        this.dir = 'desc';

        this.buscar();
    }

    // formateo
    isMoney(col: string) {
        return ['costoUnitario', 'costoTotal', 'precioUnitario'].includes(col);
    }
}

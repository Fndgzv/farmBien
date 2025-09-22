// src/app/reportes-compras/compras-page.component.ts
import { Component, OnInit, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, PercentPipe, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ReportesComprasService } from './reportes-compras.service';
import { Agrupacion, Dir, Orden, ResumenResp, Vista } from './types';

import { ProveedorService } from '../services/proveedor.service';

type ProvLite = { _id: string; nombre: string; telefono?: string };
type ProdLite = { _id: string; nombre: string; codigoBarras?: string; categoria?: string };

type ColDef = {
    key: string;            // nombre de la propiedad en el row
    label: string;          // encabezado visible
    type?: 'money' | 'num' | 'pct' | 'date' | 'text';
    isNum?: boolean;        // para alinear a la derecha
};

type HideKey = 'proveedor' | 'producto' | 'usuario' | 'categoria' | '_';

@Component({
    standalone: true,
    selector: 'app-compras-page',
    imports: [CommonModule, ReactiveFormsModule, MatTooltipModule],
    templateUrl: './compras-page.component.html',
    styleUrls: ['./compras-page.component.css']
})
export class ComprasPageComponent implements OnInit {
    fb = inject(FormBuilder);
    http = inject(HttpClient);
    svc = inject(ReportesComprasService);

    cargando = false;

    filtroForm!: FormGroup;

    // Estado
    resumen: ResumenResp | null = null;
    agrupacion: Agrupacion = 'proveedor';
    rowsAgrupado: any[] = [];
    displayKeys: string[] = [];   // <-- columnas a mostrar

    // opciones de UI
    agrupaciones: Agrupacion[] = ['proveedor', 'producto', 'categoria', 'usuario'];
    ordenes: Orden[] = ['importe', 'piezas', 'compras', 'margen', 'venta'];
    dirs: Dir[] = ['desc', 'asc'];

    // Sugerencias
    provOpts: ProvLite[] = [];
    prodOpts: ProdLite[] = [];

    provSel: ProvLite | null = null;
    prodSel: ProdLite | null = null;

    proveedores: any[] = [];

    @ViewChild('provInput', { static: false }) provInput?: ElementRef<HTMLInputElement>;
    @ViewChild('prodInput', { static: false }) prodInput?: ElementRef<HTMLInputElement>;

    // === Helpers de formato (inyecta pipes si prefieres) ===
    moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
    numFmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    // columnas visibles según agrupación
    displayCols: ColDef[] = [];

    // llama esto cuando cambie la vista/agrupación o al recibir datos
    private buildDisplayCols(tipo: HideKey = '_') {
        // Descubre llaves base del primer row
        const keys = this.rowsAgrupado?.[0] ? Object.keys(this.rowsAgrupado[0]) : [];

        // Ocultamientos por tipo
        const hideMap: Record<HideKey, string[]> = {
            proveedor: ['proveedorId', '_id'],
            producto: ['productoId', '_id'],
            usuario: ['usuarioId', '_id'],
            categoria: ['_id'],
            _: []
        };
        const toHide = hideMap[tipo] ?? hideMap['_'];

        // Etiquetas “bonitas” y tipos conocidos
        const pretty: Record<string, Partial<ColDef>> = {
            proveedorId: { label: 'Proveedor Id' },
            productoId: { label: 'Producto Id' },
            usuarioId: { label: 'Usuario Id' },
            categoria: { label: 'Categoría' },
            nombre: { label: 'Nombre' },
            codigoBarras: { label: 'CB' },
            compras: { label: '#Compras', type: 'num', isNum: true },
            piezas: { label: 'Pzas', type: 'num', isNum: true },
            cantidad: { label: 'Cantidad', type: 'num', isNum: true },
            importe: { label: 'Importe', type: 'money', isNum: true },
            costo: { label: 'Costo', type: 'money', isNum: true },
            venta: { label: 'Venta', type: 'money', isNum: true },
            margen: { label: 'Margen', type: 'money', isNum: true },
            margenPct: { label: '% Margen', type: 'pct', isNum: true },
            fecha: { label: 'Fecha', type: 'date' }
        };

        this.displayCols = keys
            .filter(k => !toHide.includes(k))
            .map<ColDef>(k => ({
                key: k,
                label: pretty[k]?.label ?? this.toLabel(k),
                type: pretty[k]?.type ?? (typeof (this.rowsAgrupado[0][k]) === 'number' ? 'num' : 'text'),
                isNum: pretty[k]?.isNum ?? (typeof (this.rowsAgrupado[0][k]) === 'number')
            }));
    }

    // “Nombre Bonito” por defecto
    private toLabel(k: string) {
        return k
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, s => s.toUpperCase())
            .trim();
    }

    // Formatea celdas según tipo
    formatCell(row: any, col: ColDef) {
        const v = row?.[col.key];
        if (v === null || v === undefined) return '—';

        switch (col.type) {
            case 'money': return this.moneyFmt.format(+v);
            case 'pct': return `${this.numFmt.format(+v)}%`;
            case 'num': return this.numFmt.format(+v);
            case 'date': {
                const d = new Date(v);
                return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX');
            }
            default: return String(v);
        }
    }

    private getDisplayKeys(tipo: Agrupacion, rows: any[]): string[] {
        if (!rows?.length) return [];
        const cols = Object.keys(rows[0]);

        // Mapa de columnas a ocultar por tipo de agrupación
        const ocultar: Record<Agrupacion, string[]> = {
            proveedor: ['proveedorId', '_id'],
            producto: ['productoId', '_id'],
            usuario: ['usuarioId', '_id'],
            categoria: ['_id'],
        };

        const toHide = ocultar[tipo] ?? [];
        return cols.filter(k => !toHide.includes(k));
    }

    constructor(
        private proveedorService: ProveedorService,
    ) { }

    ngOnInit() {
        const hoy = new Date();
        const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const toYmd = (d: Date) =>
            new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

        this.filtroForm = this.fb.group({
            fechaIni: [toYmd(first), Validators.required],
            fechaFin: [toYmd(hoy), Validators.required],
            proveedorId: [''],
            productoId: [''],
            categoria: [''],
            usuarioId: [''],

            vista: ['resumen' as Vista, Validators.required],

            // resumen
            topN: [10],
            orden: ['importe' as Orden],
            dir: ['desc' as Dir],

            // agrupado
            agrupacion: ['proveedor' as Agrupacion],
            ordenAgr: ['importe' as Orden],
            dirAgr: ['desc' as Dir],
            topNAgr: [10],
        });

        this.loadProveedores();

        this.buscar();
    }

    private loadProveedores(): void {
        this.proveedorService.obtenerProveedores().subscribe((data: any[]) => {
            this.proveedores = data.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        });
    }

    // --- BUSCAR ---
    buscar() {
        if (this.cargando) return;
        this.cargando = true;
        const v = this.filtroForm.getRawValue();

        const comunes = {
            fechaIni: v.fechaIni,
            fechaFin: v.fechaFin,
            proveedorId: v.proveedorId || undefined,
            productoId: v.productoId || undefined,
            categoria: v.categoria || undefined,
            usuarioId: v.usuarioId || undefined,
        };

        if (v.vista === 'resumen') {
            this.svc.getResumen({ ...comunes, topN: v.topN, orden: v.orden, dir: v.dir }).subscribe({
                next: (resp) => {
                    this.resumen = resp; this.rowsAgrupado = [];
                    this.displayKeys = []; this.cargando = false;
                },
                error: (err) => this.handleError(err, 'No se pudo cargar el resumen'),
            });
        } else {
            const tipo: Agrupacion = v.agrupacion;
            this.svc.getAgrupado(tipo, { ...comunes, topN: v.topNAgr, orden: v.ordenAgr, dir: v.dirAgr }).subscribe({
                next: (resp) => {
                    this.rowsAgrupado = resp?.rows || [];
                    this.buildDisplayCols(tipo);
                    this.resumen = null;
                    this.cargando = false;
                },
                error: (err) => this.handleError(err, `No se pudo cargar el agrupado por ${tipo}`),
            });
        }
    }

    // --- Limpiar ---
    limpiar() {
        const vistaActual = this.filtroForm.value.vista as Vista;
        const hoy = new Date(); const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const toYmd = (d: Date) =>
            new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

        this.filtroForm.reset({
            fechaIni: toYmd(first),
            fechaFin: toYmd(hoy),
            proveedorId: '',
            productoId: '',
            categoria: '',
            usuarioId: '',
            vista: vistaActual,
            topN: 10, orden: 'importe', dir: 'desc',
            agrupacion: 'proveedor', ordenAgr: 'importe', dirAgr: 'desc', topNAgr: 10,
        });

        // limpiar sugerencias y selecciones + inputs
        this.clearProv(this.provInput?.nativeElement);
        this.clearProd(this.prodInput?.nativeElement);

        this.buscar();
    }

    // --- PROVEEDOR (sugerencias) ---
    onProvInput(q: string) {
        const query = (q || '').trim();
        if (query.length < 2) { this.provOpts = []; return; }
        this.svc.searchProveedores(query).subscribe(list => {
            this.provOpts = Array.isArray(list) ? list : [];
        });
    }
    selectProv(p: ProvLite) {
        this.provSel = p; this.provOpts = [];
        this.filtroForm.patchValue({ proveedorId: p._id });
    }
    clearProv(input?: HTMLInputElement) {
        this.provSel = null;
        this.filtroForm.patchValue({ proveedorId: '' });
        this.provOpts = [];
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => input.focus(), 0);
        }
    }

    onProveedorChange(id: string) {
        this.provSel = this.proveedores.find(p => p._id === id) ?? null;
        // si quieres disparar la búsqueda automáticamente:
        // this.buscar();
    }

    // --- PRODUCTO (sugerencias) ---
    onProdInput(q: string) {
        const query = (q || '').trim();
        const isCB = /^\d[\d\s-]{5,}$/.test(query);
        if (!query || (!isCB && query.length < 2)) { this.prodOpts = []; return; }

        this.svc.searchProductos(query).subscribe(list => {
            this.prodOpts = Array.isArray(list) ? list : [];
        });
    }

    selectProd(p: ProdLite) {
        this.prodSel = p; this.prodOpts = [];
        this.filtroForm.patchValue({ productoId: p._id, categoria: p?.categoria || this.filtroForm.value.categoria });
    }
    clearProd(input?: HTMLInputElement) {
        this.prodSel = null;
        this.filtroForm.patchValue({ productoId: '' });
        this.prodOpts = [];
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => input.focus(), 0);
        }
    }

    exportarCsv() {
        if (!this.rowsAgrupado?.length) return;
        const headers = Object.keys(this.rowsAgrupado[0]);
        const lines = this.rowsAgrupado.map((r: any) =>
            headers.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')
        );
        const csv = [headers.join(','), ...lines].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a'); a.href = url; a.download = 'compras_agrupado.csv'; a.click(); URL.revokeObjectURL(url);
    }

    private handleError(err: any, fallback: string) {
        console.error('[Compras][ERROR]', err);
        this.cargando = false;
        const msg = err?.error?.mensaje || err?.message || fallback;
        Swal.fire('Error', msg, 'error');
    }
}

import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReportesCancelacionesService } from './reportes-cancelaciones.service';
import { Agrupacion, Dir, ResumenResp, Vista } from './types';

import { FarmaciaService } from '../services/farmacia.service';
import { UsuarioService } from '../services/usuario.service'
import { catchError, debounceTime, distinctUntilChanged, filter, map, of, Subject, switchMap, tap } from 'rxjs';

import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    standalone: true,
    selector: 'app-cancelaciones-page',
    imports: [CommonModule, ReactiveFormsModule, FormsModule, MatTooltipModule],
    templateUrl: './cancelaciones-page.component.html',
    styleUrls: ['./cancelaciones-page.component.css']
})
export class CancelacionesPageComponent implements OnInit {
    fb = inject(FormBuilder);
    svc = inject(ReportesCancelacionesService);

    filtroForm!: FormGroup;
    cargando = false;

    // datos
    resumen: ResumenResp | null = null;
    rowsAgrupado: any[] = [];
    displayKeys: string[] = [];

    // Sugerencias cliente
    clienteInput$ = new Subject<string>();
    clienteOpts: any[] = [];
    clienteSel: any | null = null;
    private _lastCliQ = '';

    farmacias: any[] = [];
    usuarios: any[] = [];
    usuariosOrdenados: any[] = [];

    trackById = (_: number, item: any) => item?._id;

    @ViewChild('cliInput') cliInputRef!: ElementRef<HTMLInputElement>;

    constructor(private farmaciaService: FarmaciaService,
        private usuarioService: UsuarioService
    ) { }

    // Normalizador sin acentos y en minúsculas
    private norm(s: any = ''): string {
        return String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    // Filtro local (nombre o teléfono)
    private filterClientesLocal(arr: any[], q: string): any[] {
        const n = this.norm(q);
        const digits = q.replace(/\D/g, '');
        return (arr || []).filter(c => {
            const nomOk = this.norm(c?.nombre).includes(n);
            const telOk = digits ? String(c?.telefono || '').includes(digits) : false;
            return nomOk || telOk;
        });
    }

    ngOnInit(): void {
        const hoy = new Date();
        const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const toYmd = (d: Date) =>
            new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

        this.filtroForm = this.fb.group({
            vista: ['resumen' as Vista, Validators.required],
            fechaIni: [toYmd(first), Validators.required],
            fechaFin: [toYmd(hoy), Validators.required],

            farmaciaId: [''],
            usuarioId: [''],
            clienteId: [''],

            // Resumen
            topN: [10],
            orden: ['importe'],
            dir: ['desc' as Dir],

            // Agrupado
            agrupacion: ['usuario' as Agrupacion],
            topNAgr: [10],
            ordenAgr: ['importe'],
            dirAgr: ['desc' as Dir],
        });
        this.clienteInput$.pipe(
            map(v => (v || '').trim()),
            tap(q => { this._lastCliQ = q; }),
            // si menos de 2 letras, sin sugerencias
            tap(q => { if (q.length < 2) this.clienteOpts = []; }),
            filter(q => q.length >= 2),
            debounceTime(250),
            distinctUntilChanged(),
            switchMap(q =>
                this.svc.searchClientes(q).pipe(
                    // normaliza respuesta y aplica filtro local SIEMPRE
                    map(list => this.filterClientesLocal(Array.isArray(list) ? list : [], q)),
                    catchError(() => of([]))
                )
            )
        ).subscribe(list => {
            // si por alguna razón cambió el input entre tanto, re-filtra
            this.clienteOpts = this.filterClientesLocal(list, this._lastCliQ);
        });

        this.cargarFarmacias();
        this.cargarUsuarios();
        this.buscar();
    }

    cargarFarmacias() {
        this.farmaciaService.obtenerFarmacias().subscribe(data => {
            // filtra solo activas
            this.farmacias = (data || [])
                .filter(f => (f as any).activo !== false)
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        });
    }

    cargarUsuarios() {
        this.usuarioService.obtenerUsuarios().subscribe(data => {
            this.usuarios = data || [];
            // ordena por nombre visible (nombre || usuario) y luego por farmacia
            this.usuariosOrdenados = [...this.usuarios].sort((a, b) => {
                const an = (a.nombre || a.usuario || '').trim();
                const bn = (b.nombre || b.usuario || '').trim();
                const byNombre = an.localeCompare(bn, 'es', { sensitivity: 'base' });
                if (byNombre !== 0) return byNombre;
                const af = a.farmacia?.nombre || '';
                const bf = b.farmacia?.nombre || '';
                return af.localeCompare(bf, 'es', { sensitivity: 'base' });
            });
        });
    }

    // ===== Cliente: sugerencias =====
    onClienteInput(q: string) {
        const term = (q || '').trim();
        if (term.length < 2) { this.clienteOpts = []; return; }

        this.svc.searchClientes(term).subscribe(list => {
            this.clienteOpts = Array.isArray(list) ? list : [];
        });
    }

    selectCliente(c: any) {
        this.clienteSel = c;
        this.clienteOpts = [];
        this.filtroForm.patchValue({ clienteId: c._id });
    }

    clearCliente(input?: HTMLInputElement) {
        this.clienteSel = null;
        this.filtroForm.patchValue({ clienteId: '' });
        this.clienteOpts = [];
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => input.focus(), 0);
        }
    }

    // ===== Buscar / pintar =====
    buscar() {
        if (this.cargando) return;
        this.cargando = true;

        const v = this.filtroForm.getRawValue();
        const comunes = {
            fechaIni: v.fechaIni, fechaFin: v.fechaFin,
            farmaciaId: v.farmaciaId || undefined,
            usuarioId: v.usuarioId || undefined,
            clienteId: v.clienteId || undefined,
        };

        if (v.vista === 'resumen') {
            this.svc.getResumen({ ...comunes, topN: v.topN, orden: v.orden, dir: v.dir })
                .subscribe({
                    next: (data) => { this.resumen = data; this.rowsAgrupado = []; this.displayKeys = []; this.cargando = false; },
                    error: (e) => { console.error(e); this.cargando = false; }
                });
        } else {
            const tipo: Agrupacion = v.agrupacion;
            this.svc.getAgrupado(tipo, { ...comunes, topN: v.topNAgr, orden: v.ordenAgr, dir: v.dirAgr })
                .subscribe({
                    next: (resp) => {
                        this.resumen = null;
                        this.rowsAgrupado = resp?.rows || [];
                        this.displayKeys = this.buildDisplayKeys(tipo, this.rowsAgrupado);
                        this.cargando = false;
                    },
                    error: (e) => { console.error(e); this.cargando = false; }
                });
        }
    }

    // Ocultar IDs según agrupación
    private buildDisplayKeys(tipo: Agrupacion, rows: any[]): string[] {
        if (!rows?.length) return [];
        const keys = Object.keys(rows[0]);
        const hideMap: Record<string, string[]> = {
            usuario: ['usuarioId', '_id'],
            farmacia: ['farmaciaId', '_id'],
            cliente: ['clienteId', '_id'],
            _: []
        };
        const toHide = hideMap[tipo] ?? hideMap['_'];
        return keys.filter(k => !toHide.includes(k));
    }

    limpiar() {
        const vistaActual = this.filtroForm.value.vista as Vista;
        const hoy = new Date(); const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const toYmd = (d: Date) =>
            new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

        this.filtroForm.reset({
            vista: vistaActual,
            fechaIni: toYmd(first),
            fechaFin: toYmd(hoy),

            farmaciaId: '',
            usuarioId: '',
            clienteId: '',

            topN: 10, orden: 'importe', dir: 'desc',
            agrupacion: 'usuario', topNAgr: 10, ordenAgr: 'importe', dirAgr: 'desc',
        });

        // limpiar UI de inputs libres
        this.clienteSel = null;
        this.clienteOpts = [];
        this.filtroForm.patchValue({ clienteId: '' });

        // borrar el valor escrito en el input y notificar (por si escuchas (input))
        const el = this.cliInputRef?.nativeElement;
        if (el) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            // opcional: el.blur(); setTimeout(() => el.focus(), 0);
        }

        this.buscar();
    }

    // CSV de agrupado
    exportarCsv() {
        if (!this.rowsAgrupado?.length) return;
        const headers = this.displayKeys;
        const lines = this.rowsAgrupado.map(r =>
            headers.map(k => `"${String((r as any)[k] ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = [headers.join(','), ...lines].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a'); a.href = url; a.download = 'cancelaciones-agrupado.csv'; a.click();
        URL.revokeObjectURL(url);
    }
}

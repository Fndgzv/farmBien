import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ReportesComprasVentasService, ReporteRow, ProductoLite } from '../../services/reportes-compras-ventas.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';


type SortCol =
    | 'caducidad' | 'fecCompra' | 'proveedor' | 'producto'
    | 'cb' | 'lote' | 'existencia' | 'costo' | 'cantidad' | 'costoTotal';

@Component({
    selector: 'app-reporte-compras-ventas',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MatTooltipModule],
    templateUrl: './reporte-compras-ventas.component.html',
    styleUrls: ['./reporte-compras-ventas.component.css']
})
export class ReporteComprasVentasComponent implements OnInit {
    form!: FormGroup;

    proveedores: { _id: string; nombre: string }[] = [];

    // producto autocomplete
    prodOpts: ProductoLite[] = [];
    productoSel: ProductoLite | null = null;

    // tabla
    rows: ReporteRow[] = [];
    cargando = false;
    nota: string = '';
    total = 0; page = 1; limit = 20;

    get totalPaginas(): number { return Math.max(1, Math.ceil((this.total || 0) / (this.limit || 1))); }
    get totalPagina(): number { return this.rows.reduce((a, r) => a + (r.costoTotal || 0), 0); }

    constructor(
        private fb: FormBuilder,
        private reportesSvc: ReportesComprasVentasService
    ) { }

    sumCantidad: number = 0;
    sumExistencia: number = 0;
    avgVendidosFarmacia: number = 0;

    ngOnInit(): void {
        const hoy = new Date();
        const y = hoy.getFullYear(), m = hoy.getMonth();
        const ini = new Date(y, m, 1).toISOString().slice(0, 10);
        const fin = hoy.toISOString().slice(0, 10);

        this.form = this.fb.group({
            fechaIni: [ini],
            fechaFin: [fin],
            productoId: [''],
            proveedorId: [''],
            lote: [''],
            codigoBarras: [''],
            sortBy: ['caducidad'],
            sortDir: ['asc'],
            limit: [this.limit]
        });

        // proveedores
        this.reportesSvc.getProveedores().subscribe(list => this.proveedores = list);

        this.buscar(true);
    }

    isSorted(col: SortCol): boolean {
        return this.form?.value?.sortBy === col;
    }
    isAsc(): boolean {
        return (this.form?.value?.sortDir || 'asc') === 'asc';
    }

    isSort(col: SortCol): boolean {
        return this.form?.value?.sortBy === col;
    }
    dirIsAsc(): boolean {
        return (this.form?.value?.sortDir || 'asc') === 'asc';
    }
    clickSort(col: SortCol) {
        const cur = this.form.value.sortBy as SortCol;
        let dir: 'asc' | 'desc' = this.form.value.sortDir || 'asc';

        if (cur === col) {
            dir = dir === 'asc' ? 'desc' : 'asc';
        } else {
            dir = 'asc'; // primer click siempre asc
        }
        this.form.patchValue({ sortBy: col, sortDir: dir });
        this.page = 1;
        this.runQuery();
    }

    private runQuery() {
        const val = this.form.value;
        const params = {
            ...val,
            page: this.page,
            limit: this.limit
        };
        this.cargando = true;
        this.reportesSvc.getReporte(params).subscribe({
            next: (resp) => {
                this.rows = resp?.rows ?? [];
                this.total = resp?.paginacion?.total ?? 0;
                this.page = resp?.paginacion?.page ?? this.page;
                this.limit = resp?.paginacion?.limit ?? this.limit;
                this.nota = resp?.nota ?? '';
                this.sumCantidad = resp?.resumen?.sumCantidad ?? 0;
                this.sumExistencia = resp?.resumen?.sumExistencia ?? 0;
                this.avgVendidosFarmacia = resp?.resumen?.avgVendidosFarmacia ?? 0;
                this.cargando = false;

                console.log('respuesta', resp);
                
            },
            error: _ => {
                this.rows = [];
                this.total = 0;
                this.nota = '';
                this.sumCantidad = 0;
                this.sumExistencia = 0;
                this.avgVendidosFarmacia = 0;
                this.cargando = false;
            }
        });
    }

    // Llamadas de paginación
    goToFirstPage() {
        if (this.page > 1) {
            this.page = 1;
            this.runQuery();
        }
    }

    goToPrevPage() {
        if (this.page > 1) {
            this.page--;
            this.runQuery();
        }
    }

    goToNextPage() {
        if (this.page < this.totalPaginas) {
            this.page++;
            this.runQuery();
        }
    }

    goToLastPage() {
        const last = this.totalPaginas;
        if (this.page !== last) {
            this.page = last;
            this.runQuery();
        }
    }

    // Si el usuario cambia el límite, reinicia a página 1
    onChangeLimit() {
        this.page = 1;
        this.runQuery();
    }

    // ===== producto autocomplete =====
    onProductoInput(q: string) {
        const query = (q || '').trim();
        if (query.length < 2) { this.prodOpts = []; return; }
        this.reportesSvc.searchProductos(query).subscribe(list => this.prodOpts = list.slice(0, 10));
    }

    selectProducto(p: ProductoLite) {
        this.productoSel = p;
        this.prodOpts = [];
        // guarda el id en el form para la búsqueda real
        this.form.patchValue({ productoId: p._id });
    }

    clearProducto(input?: HTMLInputElement) {
        this.productoSel = null;
        this.form.patchValue({ productoId: '' });
        this.prodOpts = [];
        if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => input.focus(), 0);
        }
    }

    limpiar() {
        const hoy = new Date();
        const y = hoy.getFullYear(), m = hoy.getMonth();
        const ini = new Date(y, m, 1).toISOString().slice(0, 10);
        const fin = hoy.toISOString().slice(0, 10);
        this.productoSel = null;
        this.prodOpts = [];
        this.form.reset({
            fechaIni: ini, fechaFin: fin,
            productoId: '', proveedorId: '',
            lote: '', codigoBarras: '',
            sortBy: 'caducidad', sortDir: 'asc',
            limit: this.limit
        });
        this.buscar(true);
    }

    goPage(p: number) {
        if (p < 1 || p > this.totalPaginas) return;
        this.page = p;
        this.buscar(false);
    }

    buscar(reset = false) {
        if (reset) this.page = 1;
        this.runQuery();
    }
}

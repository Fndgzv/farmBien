// frontFarm/src/app/pages/reporte-presupuesto/reporte-presupuesto.component.ts
import { Component, OnInit } from '@angular/core';
import { ReportesPresupuestoService, PresupuestoRow, PresupuestoResponse } from '../../services/reportes-presupuesto.service';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faTimes, faPlus } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-reporte-presupuesto',
    templateUrl: './reporte-presupuesto.component.html',
    styleUrls: ['./reporte-presupuesto.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, MatTooltipModule, FontAwesomeModule]
})

export class ReportePresupuestoComponent implements OnInit {

     faTimes = faTimes;

    get totalPages(): number {
        return Math.max(Math.ceil(this.totalRows / this.limit), 1);
    }
    isFirstPage(): boolean {
        return this.page === 1;
    }
    isLastPage(): boolean {
        return this.page >= this.totalPages;
    }

    private allRows: PresupuestoRow[] = [];
    private filteredAll: PresupuestoRow[] = []
    // Filtros
    fechaIni = '';
    fechaFin = '';
    categoria = '';
    nombre = '';
    soloExistMenorQueVentas = false;

    // Tabla
    rows: PresupuestoRow[] = [];
    totalRows = 0;
    totalCostoEst = 0;

    // Paginación/orden
    page = 1;
    limit = 20;
    sortBy: 'nombre' | 'categoria' | 'existencia' | 'vendidos' = 'nombre';
    sortDir: 'asc' | 'desc' = 'asc';

    // UI
    cargando = false;
    seleccionarTodos = false;

    get selectedCount(): number {
        return this.allRows.reduce((acc, r) => acc + (r.grabar ? 1 : 0), 0);
    }

    constructor(private svc: ReportesPresupuestoService) { }

    ngOnInit(): void {
        this.setFechasPorDefecto();
        //this.buscar(true);
    }


    limpiarCategoria(){
        this.categoria = '';
        this.onFiltroChange();
    }

    limpiarNombre(){
        this.nombre = '';
        this.onFiltroChange();
    }

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

    // ====== Eventos UI ahora solo reconstruyen la vista local ======
    ordenarPor(campo: 'nombre' | 'categoria' | 'existencia' | 'vendidos'): void {
        if (this.sortBy === campo) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else { this.sortBy = campo; this.sortDir = 'asc'; }
        this.applyClientView(); // sin red
    }
    cambiarPagina(delta: number): void {
        const totalPages = this.totalPages;
        let nueva = this.page + delta;
        if (nueva < 1) nueva = 1;
        if (nueva > totalPages) nueva = totalPages;
        if (nueva !== this.page) { this.page = nueva; this.applyClientView(); }
    }
    irAPagina(p: number): void {
        const totalPages = this.totalPages;
        if (p >= 1 && p <= totalPages) { this.page = p; this.applyClientView(); }
    }
    cambiarLimit(n: number): void { this.limit = n; this.applyClientView(true); }
    // filtros de texto / checkbox pueden llamar a:
    onFiltroChange(): void { this.applyClientView(true); }

    toggleSeleccionTodos(): void {
        for (const r of this.filteredAll) r.grabar = this.seleccionarTodos;
        // también refleja en la página actual
        this.rows = [...this.rows];
    }

    // === Cuando el usuario marca/desmarca una fila, actualiza el estado del “todos” ===
    onRowCheckChange(): void {
        this.recalcSeleccionTodos();
    }

    private showLoader(title = 'Buscando...'): void {
        Swal.fire({
            title,
            text: 'Contando ventas de los productos, calculando stoks',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });
    }

    private closeLoader(): void {
        if (Swal.isVisible()) Swal.close();
    }

    async buscar(resetPage = false): Promise<void> {
        if (this.cargando) return;
        if (!this.fechaIni || !this.fechaFin) {
            await Swal.fire('Fechas requeridas', 'Debes elegir fecha inicial y final', 'info');
            return;
        }
        if (resetPage) this.page = 1;

        this.cargando = true;
        this.showLoader('Buscando...');

        try {
            // Pedimos TODO de una vez: usa un límite grande para traer todo el rango
            const res = await firstValueFrom(
                this.svc.getPresupuesto({
                    fechaIni: this.fechaIni,
                    fechaFin: this.fechaFin,
                    // ya NO enviamos filtros/orden/página al backend:
                    page: 1,
                    limit: 100000,   // o ajusta a tu máximo esperado
                })
            );

            // Guardamos el dataset completo
            this.allRows = (res?.rows || []).map(r => ({ ...r, grabar: r.grabar ?? false }));

            // Construimos la vista local
            this.applyClientView(true); // reset page y recalcula todo
            this.seleccionarTodos = false;
        } catch (e: any) {
            console.error(e);
            await Swal.fire('Error', e?.error?.mensaje || 'No se pudo cargar el reporte', 'error');
        } finally {
            this.closeLoader();
            this.cargando = false;
        }
    }

    private recalcSeleccionTodos(): void {
        this.seleccionarTodos =
            this.filteredAll.length > 0 && this.filteredAll.every(r => !!r.grabar);
    }

    // ====== Core: aplica filtros/orden/paginación en el cliente ======
    applyClientView(resetPage = false): void {
        if (resetPage) this.page = 1;

        const norm = (s: string) => (s || '').toLowerCase().trim();
        const wsplit = (s: string) => norm(s).split(/\s+/).filter(Boolean);
        const wordsNombre = wsplit(this.nombre);
        const wordsCat = wsplit(this.categoria);

        let filtered = this.allRows.filter(r => {
            const okNombre = wordsNombre.every(w => r.producto?.toLowerCase().includes(w));
            const okCat = wordsCat.every(w => r.categoria?.toLowerCase().includes(w));
            const okExist = !this.soloExistMenorQueVentas || ((r.existencia ?? 0) < (r.vendidosSMaxE ?? 0));
            return okNombre && okCat && okExist;
        });

        // <-- guarda TODOS los filtrados (antes de ordenar/paginar)
        this.filteredAll = filtered;

        const dir = this.sortDir === 'asc' ? 1 : -1;
        const safeStr = (v: any) => String(v ?? '').toLowerCase();
        const safeNum = (v: any) => Number.isFinite(v) ? Number(v) : 0;

        filtered = [...filtered].sort((a, b) => {
            switch (this.sortBy) {
                case 'nombre': return dir * (safeStr(a.producto) > safeStr(b.producto) ? 1 : -1);
                case 'categoria': return dir * (safeStr(a.categoria) > safeStr(b.categoria) ? 1 : -1);
                case 'existencia': return dir * (safeNum(a.existencia) - safeNum(b.existencia));
                case 'vendidos': return dir * (safeNum(a.vendidosSMaxE) - safeNum(b.vendidosSMaxE));
                default: return 0;
            }
        });

        this.totalCostoEst = filtered.reduce((acc, r) => acc + (r.costoEst ?? 0), 0);
        this.totalRows = filtered.length;

        const start = (this.page - 1) * this.limit;
        const end = start + this.limit;
        this.rows = filtered.slice(start, end);

        // sincroniza “Seleccionar todos”
        this.recalcSeleccionTodos();
    }

    async grabarSeleccionados(): Promise<void> {
        const items = this.allRows
            .filter(r => r.grabar)
            .map(r => ({ productoId: r._id, vendidosSMaxE: r.vendidosSMaxE }));

        if (items.length === 0) {
            await Swal.fire('Aviso', 'No hay renglones marcados para grabar', 'info');
            return;
        }

        const ok = await Swal.fire({
            icon: 'question',
            title: 'Confirmar actualización',
            html: `
      Se actualizará <b>stockMáximo = Vendidos SMaxE</b> y 
      <b>stockMínimo = ceil(30% de stockMáximo)</b> en ${items.length} productos.
      <br><br>¿Deseas continuar?
    `,
            showCancelButton: true,
            confirmButtonText: 'Sí, actualizar',
            cancelButtonText: 'Cancelar'
        });
        if (!ok.isConfirmed) return;

        this.showLoader('Aplicando cambios...'); // ← sin await
        try {
            const res = await firstValueFrom(this.svc.grabar(items));
            await Swal.fire('Listo', `Productos modificados: ${res?.modified ?? 0}`, 'success');
            this.buscar(false); // refrescar
        } catch (e: any) {
            console.error(e);
            await Swal.fire('Error', e?.error?.mensaje || 'No se pudo grabar', 'error');
        } finally {
            this.closeLoader();  // ← cerramos siempre
        }
    }


    // Utilidades de formateo local
    fmtNumber(n: number | null | undefined): string {
        return (n ?? 0).toLocaleString('es-MX');
    }
    fmtMoney(n: number | null | undefined): string {
        return (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
    }
}

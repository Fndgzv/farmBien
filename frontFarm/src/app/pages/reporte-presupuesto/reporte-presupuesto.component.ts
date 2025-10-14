// frontFarm/src/app/pages/reporte-presupuesto/reporte-presupuesto.component.ts
import { Component, OnInit } from '@angular/core';
import { ReportesPresupuestoService, PresupuestoRow, PresupuestoResponse } from '../../services/reportes-presupuesto.service';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-reporte-presupuesto',
    templateUrl: './reporte-presupuesto.component.html',
    styleUrls: ['./reporte-presupuesto.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, MatTooltipModule]
})

export class ReportePresupuestoComponent implements OnInit {

    get totalPages(): number {
        return Math.max(Math.ceil(this.totalRows / this.limit), 1);
    }
    isFirstPage(): boolean {
        return this.page === 1;
    }
    isLastPage(): boolean {
        return this.page >= this.totalPages;
    }

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

    constructor(private svc: ReportesPresupuestoService) { }

    ngOnInit(): void {
        this.setFechasPorDefecto();
        this.buscar(true);
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

    ordenarPor(campo: 'nombre' | 'categoria' | 'existencia' | 'vendidos'): void {
        if (this.sortBy === campo) {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortBy = campo;
            this.sortDir = 'asc';
        }
        this.buscar(true);
    }

    cambiarPagina(delta: number): void {
        const totalPages = Math.max(Math.ceil(this.totalRows / this.limit), 1);
        let nueva = this.page + delta;
        if (nueva < 1) nueva = 1;
        if (nueva > totalPages) nueva = totalPages;
        if (nueva !== this.page) {
            this.page = nueva;
            this.buscar(false);
        }
    }

    irAPagina(p: number): void {
        const totalPages = Math.max(Math.ceil(this.totalRows / this.limit), 1);
        if (p >= 1 && p <= totalPages) {
            this.page = p;
            this.buscar(false);
        }
    }

    cambiarLimit(n: number): void {
        this.limit = n;
        this.buscar(true);
    }

    toggleSeleccionTodos(): void {
        for (const r of this.rows) r.grabar = this.seleccionarTodos;
    }

    private showLoader(title = 'Buscando...'): void {
        // NO usar await aquí
        Swal.fire({
            title,
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });
    }

    private closeLoader(): void {
        if (Swal.isVisible()) Swal.close();
    }

    async buscar(resetPage = false): Promise<void> {
        if (this.cargando) return; // evita llamadas concurrentes
        if (!this.fechaIni || !this.fechaFin) {
            await Swal.fire('Fechas requeridas', 'Debes elegir fecha inicial y final', 'info');
            return;
        }
        if (resetPage) this.page = 1;

        this.cargando = true;
        this.showLoader('Buscando...'); // ← sin await

        try {
            const res = await firstValueFrom(
                this.svc.getPresupuesto({
                    fechaIni: this.fechaIni,
                    fechaFin: this.fechaFin,
                    categoria: this.categoria?.trim(),
                    nombre: this.nombre?.trim(),
                    soloExistMenorQueVentas: this.soloExistMenorQueVentas,
                    sortBy: this.sortBy,
                    sortDir: this.sortDir,
                    page: this.page,
                    limit: this.limit,
                })
                // .pipe(timeout(30000)) // opcional, corta si el backend no responde
            );

            this.rows = (res?.rows || []).map(r => ({ ...r, grabar: r.grabar ?? false }));
            this.totalRows = res?.paginacion?.total ?? 0;
            this.totalCostoEst = res?.resumen?.totalCostoEst ?? 0;
            this.seleccionarTodos = false;
        } catch (e: any) {
            console.error(e);
            await Swal.fire('Error', e?.error?.mensaje || 'No se pudo cargar el reporte', 'error');
        } finally {
            this.closeLoader();   // ← cerramos siempre
            this.cargando = false;
        }
    }

    async grabarSeleccionados(): Promise<void> {
        const items = this.rows
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

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportesService } from '../../../services/reportes.service';
import { FarmaciaService } from '../../../services/farmacia.service';

@Component({
    selector: 'app-ranking-productos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './ranking-productos.component.html',
    styleUrls: ['./ranking-productos.component.css']
})
export class RankingProductosComponent implements OnInit {

    desde!: string;
    hasta!: string;
    farmaciaSeleccionada!: string;

    farmacias: any[] = [];
    data: any[] = [];
    cargando = false;

    page = 1;
    limit = 20;
    total = 0;
    totalPages = 0;

    kpiTotalUtilidad = 0;
    kpiTotalVentas = 0;
    kpiProductos = 0;
    kpiMargenPromedio = 0;
    kpis: any = null;
    clasificacion: string = 'ALL';

    constructor(
        private reportesService: ReportesService,
        private farmaciaService: FarmaciaService
    ) { }

    ngOnInit() {

        const hoy = new Date()
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');

        const hoyLocal = `${yyyy}-${mm}-${dd}`;

        this.desde = hoyLocal;
        this.hasta = hoyLocal;

        // 🏥 farmacia desde localStorage
        const stored = localStorage.getItem('user_farmacia');
        const farmacia = stored ? JSON.parse(stored) : null;

        this.farmaciaSeleccionada = farmacia._id ?? 'ALL';

        this.cargarFarmacias();
    }

    cargarFarmacias() {
        this.farmaciaService.obtenerFarmacias().subscribe(res => {
            this.farmacias = res;
            if (this.farmaciaSeleccionada) {
                this.cargar();
            }
        });
    }

    cargar() {
        if (!this.farmaciaSeleccionada) return;

        this.cargando = true;

        const params = {
            desde: this.desde,
            hasta: this.hasta,
            farmacia: this.farmaciaSeleccionada,
            clasificacion: this.clasificacion,
            page: this.page,
            limit: this.limit
        };

        // 1️⃣ Tabla paginada
        this.reportesService.rankingProductos(params).subscribe(res => {
            this.data = res;
            this.cargando = false;
        });

        // 2️⃣ Conteo total (paginador)
        this.reportesService.rankingProductosCount(params).subscribe(res => {
            this.total = res.total;
            this.totalPages = Math.ceil(this.total / this.limit);
        });

        // 3️⃣ KPIs (🔥 SIN PAGE NI LIMIT)
        this.reportesService.rankingProductosKPIs({
            desde: this.desde,
            hasta: this.hasta,
            farmacia: this.farmaciaSeleccionada,
            clasificacion: this.clasificacion
        }).subscribe(kpis => {
            this.kpis = kpis;
            this.kpiTotalVentas = kpis.ventasTotales ?? 0;
            this.kpiTotalUtilidad = kpis.utilidadTotal ?? 0;
            this.kpiMargenPromedio = kpis.margenPromedio ?? 0;
            this.kpiProductos = kpis.productosAnalizados ?? 0;
        });
    }

    trackByProducto(index: number, item: any) {
        return item.productoId;
    }


    /* Paginación */
    irInicio() {
        if (this.page === 1) return;
        this.page = 1;
        this.cargar();
    }

    irAnterior() {
        if (this.page <= 1) return;
        this.page--;
        this.cargar();
    }

    irSiguiente() {
        if (this.page >= this.totalPages) return;
        this.page++;
        this.cargar();
    }

    irFinal() {
        if (this.page === this.totalPages) return;
        this.page = this.totalPages;
        this.cargar();
    }

}

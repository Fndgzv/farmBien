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

    kpiUtilidadTotal = 0;
    kpiVentasTotales = 0;
    kpiMargenPromedio = 0;
    kpiProductos = 0;
    kpiTopProducto: any = null;

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
            clasificacion: 'ALL', // o la que elijas
            page: this.page,
            limit: this.limit
        };

        // 🔹 1) Datos paginados
        this.reportesService.rankingProductos(params).subscribe(res => {
            this.data = res;
            this.calcularKPIs();
            this.cargando = false;
        });

        // 🔹 2) Conteo total (para paginador)
        this.reportesService.rankingProductosCount(params).subscribe(res => {
            this.total = res.total;
            this.totalPages = Math.ceil(this.total / this.limit);
        });
    }

    calcularKPIs() {
  if (!this.data.length) {
    this.kpiUtilidadTotal = 0;
    this.kpiVentasTotales = 0;
    this.kpiMargenPromedio = 0;
    this.kpiProductos = 0;
    this.kpiTopProducto = null;
    return;
  }

  this.kpiUtilidadTotal = this.data.reduce(
    (acc, p) => acc + (p.utilidad || 0),
    0
  );

  this.kpiVentasTotales = this.data.reduce(
    (acc, p) => acc + (p.ventas || 0),
    0
  );

  this.kpiProductos = this.data.length;

  this.kpiMargenPromedio =
    this.kpiVentasTotales > 0
      ? (this.kpiUtilidadTotal / this.kpiVentasTotales) * 100
      : 0;

  this.kpiTopProducto = [...this.data]
    .sort((a, b) => b.utilidad - a.utilidad)[0];
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

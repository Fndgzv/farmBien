import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
    NgApexchartsModule,
    ApexChart,
    ApexXAxis,
    ApexYAxis,
    ApexStroke,
    ApexTooltip,
    ApexDataLabels,
    ApexMarkers
} from 'ng-apexcharts';

import { ReportesService } from '../../../services/reportes.service';
import { FarmaciaService } from '../../../services/farmacia.service';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ChartOptions = {
    series: any[];
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis[];
    stroke: ApexStroke;
    tooltip: ApexTooltip;
    dataLabels: ApexDataLabels;
    markers: ApexMarkers;
    colors: string[];
};

@Component({
    selector: 'app-ventas-tiempo-chart',
    standalone: true,
    imports: [CommonModule, FormsModule, NgApexchartsModule, MatTooltipModule],
    templateUrl: './ventas-tiempo-chart.component.html',
    styleUrls: ['./ventas-tiempo-chart.component.css']
})
export class VentasTiempoChartComponent implements OnInit {

    data: any[] = [];

    escala: 'hora' | 'dia' | 'mes' | 'anio' = 'hora';
    desde!: string;
    hasta!: string;

    farmacias: any[] = [];
    farmaciaSeleccionada = 'ALL';

    kpiIngresosNetos = 0;
    kpiUtilidad = 0;
    kpiVentas = 0;
    kpiMargen = 0;
    kpiPedidosUnicos = 0;
    kpiPedidosMovs = 0;

    horaPico: any = null;
    horaMuerta: any = null;

    chartOptions: ChartOptions = {
        series: [],
        chart: { type: 'line', height: 360 },
        xaxis: { categories: [] },
        yaxis: [],
        stroke: { curve: 'smooth' },
        tooltip: { shared: true },
        dataLabels: { enabled: false },
        markers: { size: 4 },
        colors: ['#1E88E5', '#2E7D32', '#F57C00']
    };

    constructor(
        private reportesService: ReportesService,
        private farmaciaService: FarmaciaService
    ) { }

    ngOnInit() {
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');

        const fechaLocal = `${yyyy}-${mm}-${dd}`;

        this.desde = fechaLocal;
        this.hasta = fechaLocal;
        const stored = localStorage.getItem('user_farmacia');
        const farmacia = stored ? JSON.parse(stored) : null;
        this.farmaciaSeleccionada = farmacia?._id ?? 'ALL';

        this.cargarFarmacias();
        this.cargar();
    }

    /* =========================
       FARMACIAS
       ========================= */
    cargarFarmacias() {
        this.farmaciaService.obtenerFarmacias().subscribe(res => {
            this.farmacias = res || [];
        });
    }

    /* =========================
       DATOS
       ========================= */
    cargar() {
        this.reportesService.ventasPorTiempo({
            desde: this.desde,
            hasta: this.hasta,
            escala: this.escala,
            farmacia: this.farmaciaSeleccionada
        }).subscribe(res => {
            this.data = res || [];
            this.buildChart();
        });
    }

    buildChart() {

        this.data = this.ordenarData(this.data);
        const hasData = this.data.length > 0;

        /* ================= KPIs ================= */
        this.kpiIngresosNetos = hasData
            ? this.data.reduce((a, d) => a + (d.ingresos ?? 0), 0)   // ⚠️ realmente: ingresos netos
            : 0;

        this.kpiUtilidad = hasData
            ? this.data.reduce((a, d) => a + (d.utilidad ?? 0), 0)
            : 0;

        this.kpiVentas = hasData
            ? this.data.reduce((a, d) => a + (d.ventas ?? 0), 0)
            : 0;

        // ✅ NUEVOS KPIs
        this.kpiPedidosUnicos = hasData
            ? this.data.reduce((a, d) => a + (d.pedidosUnicos ?? 0), 0)
            : 0;

        this.kpiPedidosMovs = hasData
            ? this.data.reduce((a, d) => a + (d.pedidosMovs ?? 0), 0)
            : 0;

        this.kpiMargen = this.kpiIngresosNetos
            ? (this.kpiUtilidad / this.kpiIngresosNetos) * 100
            : 0;

        /* ================= DATA ================= */
        const categorias = hasData
            ? this.data.map(d => this.formatearPeriodo(d.periodo))
            : [];

        const ventas = hasData ? this.data.map(d => d.ingresos ?? 0) : [];
        const utilidad = hasData ? this.data.map(d => d.utilidad ?? 0) : [];
        const conteo = hasData ? this.data.map(d => d.ventas ?? 0) : [];

        const maxVentas = ventas.length ? Math.max(...ventas) : 0;
        const maxConteo = conteo.length ? Math.max(...conteo) : 0;
        const safeMaxConteo = Math.max(1, maxConteo);

        const tickConteo = safeMaxConteo <= 5 ? safeMaxConteo : 5;

        /* ================= CHART ================= */
        this.chartOptions = {
            chart: {
                type: 'line',
                height: 360,
                toolbar: { show: false },
                animations: { enabled: false }
            },

            series: [
                { name: 'Ingresos netos ($)', data: ventas, yAxisIndex: 0 },
                { name: 'Utilidad ($)', data: utilidad, yAxisIndex: 1 },
                { name: 'Número de ventas', data: conteo, yAxisIndex: 2 }
            ],

            xaxis: {
                type: 'category',
                categories: categorias,
                labels: { rotate: -45, style: { fontSize: '12px' } }
            },

            yaxis: [
                {
                    min: 0,
                    max: Math.ceil(maxVentas * 1),
                    title: { text: 'Ingresos ($)' },
                    labels: { formatter: v => `$${Math.round(v)}` }
                },
                {
                    min: 0,
                    max: Math.ceil((utilidad.length ? Math.max(...utilidad) : 0) * 1.6),
                    title: { text: 'Utilidad ($)' },
                    labels: { formatter: v => `$${Math.round(v)}` }
                },
                {
                    opposite: true,
                    min: 0,
                    max: Math.ceil(maxConteo * 1.2),
                    tickAmount: tickConteo,
                    forceNiceScale: true,
                    title: { text: 'Número de ventas' },
                    labels: { formatter: v => `${Math.round(v)}` }
                }
            ],

            stroke: { curve: 'smooth', width: [3, 3, 2] },
            markers: { size: 4 },
            tooltip: { shared: true },
            dataLabels: { enabled: false },
            colors: ['#1E88E5', '#2E7D32', '#F57C00']
        };

        this.calcularHorasClave();
    }


    /* =========================
   HORAS CLAVE
   ========================= */
    calcularHorasClave() {
        const validos = this.data.filter(d => d.ingresos > 0);

        if (!validos.length) {
            this.horaPico = null;
            this.horaMuerta = null;
            return;
        }

        this.horaPico = validos.reduce((a, b) =>
            b.utilidad > a.utilidad ? b : a
        );

        this.horaMuerta = validos.reduce((a, b) =>
            b.utilidad < a.utilidad ? b : a
        );

        /* this.horaPico = validos.reduce((a, b) =>
            b.ingresos > a.ingresos ? b : a
        );

        this.horaMuerta = validos.reduce((a, b) =>
            b.ingresos < a.ingresos ? b : a
        ); */
    }

    formatearPeriodo(periodo: string): string {
        if (!periodo) return '';

        switch (this.escala) {

            case 'hora':
                return periodo;

            case 'dia': {
                const [yyyy, mm, dd] = periodo.split('-');
                return `${dd}/${mm}/${yyyy}`;
            }

            case 'mes': {
                const [yyyy, mm] = periodo.split('-');
                return `${mm}/${yyyy}`;
            }

            case 'anio':
                return periodo;

            default:
                return periodo;
        }
    }

    get etiquetaAlta(): string {
        switch (this.escala) {
            case 'hora': return 'Hora pico';
            case 'dia': return 'Día más alto';
            case 'mes': return 'Mes más alto';
            case 'anio': return 'Año más alto';
            default: return 'Máximo';
        }
    }

    get etiquetaBaja(): string {
        switch (this.escala) {
            case 'hora': return 'Hora muerta';
            case 'dia': return 'Día más bajo';
            case 'mes': return 'Mes más bajo';
            case 'anio': return 'Año más bajo';
            default: return 'Mínimo';
        }
    }

    ordenarData(data: any[]): any[] {
        return [...data].sort((a, b) => {
            if (this.escala === 'hora') {
                return Number(a.periodo) - Number(b.periodo);
            }
            return a.periodo.localeCompare(b.periodo);
        });
    }


}

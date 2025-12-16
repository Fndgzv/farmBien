import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ReportesService } from '../../../services/reportes.service';
import { FarmaciaService } from '../../../services/farmacia.service';

import {
    NgApexchartsModule,
    ApexAxisChartSeries,
    ApexChart,
    ApexXAxis,
    ApexYAxis,
    ApexStroke,
    ApexTooltip,
    ApexDataLabels,
    ChartComponent,
    ApexMarkers
} from 'ng-apexcharts';


export type ChartOptions = {
    series: ApexAxisChartSeries;
    chart: ApexChart;
    xaxis: ApexXAxis;
    yaxis: ApexYAxis | ApexYAxis[];
    stroke: ApexStroke;
    tooltip: ApexTooltip;
    dataLabels: ApexDataLabels;
    markers: ApexMarkers;
    colors: string[];
};

@Component({
    selector: 'app-ventas-tiempo-chart',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        NgApexchartsModule
    ],
    templateUrl: './ventas-tiempo-chart.component.html',
    styleUrls: ['./ventas-tiempo-chart.component.css']
})

export class VentasTiempoChartComponent implements OnInit {

    @ViewChild('chart') chart!: ChartComponent;

    data: any[] = [];

    escala: 'hora' | 'dia' | 'mes' | 'anio' = 'hora';
    desde!: string;
    hasta!: string;

    chartOptions!: ChartOptions;

    farmacias: any[] = [];
    farmaciaSeleccionada: string = 'ALL';

    kpiTotalVentas = 0;
    kpiUtilidad = 0;
    kpiVentas = 0;
    kpiMargen = 0;

    horaPico: any = null;
    horaMuerta: any = null;

    chartReady = false;

    constructor(private reportesService: ReportesService,
        private farmaciaService: FarmaciaService) { }


    ngOnInit() {

        this.initChart();

        const hoy = new Date();

        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');

        const hoyLocal = `${yyyy}-${mm}-${dd}`;

        this.desde = hoyLocal;
        this.hasta = hoyLocal;

        this.escala = 'hora';

        // 🏥 farmacia desde localStorage
        const stored = localStorage.getItem('user_farmacia');
        const farmacia = stored ? JSON.parse(stored) : null;

        this.farmaciaSeleccionada = farmacia._id ?? 'ALL';

        this.cargarFarmacias();
        this.cargar();

    }


    initChart() {
        this.chartOptions = {
            series: [],
            chart: {
                type: 'line',
                height: 350,
                toolbar: { show: false }
            },
            colors: ['#1E88E5', '#2E7D32', '#F57C00'],
            stroke: {
                width: [3, 3, 2],
                curve: 'smooth'
            },
            dataLabels: {
                enabled: false
            },

            markers: {          // 🔥 ESTO FALTABA
                size: [0, 4, 0],
                strokeWidth: 0,
                hover: {
                    size: 6
                }
            },
            xaxis: {
                categories: []
            },
            yaxis: [
                {
                    title: { text: 'Importes ($)' },
                    labels: {
                        show: true,
                        formatter: (val: number) =>
                            `$${val.toLocaleString()}`
                    }
                },
                {
                    opposite: true,
                    title: { text: 'Número de ventas' },
                    decimalsInFloat: 0,
                    forceNiceScale: true,

                    labels: {
                        show: true,
                        formatter: (val: number) => Math.round(val).toString()
                    }
                }

            ],
            tooltip: {
                shared: true,
                intersect: false,
                y: {
                    formatter: (val: number) =>
                        typeof val === 'number'
                            ? val.toLocaleString()
                            : ''
                }
            }

        };

    }

    cargarFarmacias() {
        this.farmaciaService.obtenerFarmacias().subscribe(res => {
            this.farmacias = res;
        });
    }


    cargar() {


        console.log('📌 cargar() llamado', {
            desde: this.desde,
            hasta: this.hasta,
            escala: this.escala,
            farmacia: this.farmaciaSeleccionada
        });


        const desdeISO = this.desde?.slice(0, 10);
        const hastaISO = this.hasta?.slice(0, 10);

        this.reportesService.ventasPorTiempo({
            desde: desdeISO,
            hasta: hastaISO,
            escala: this.escala,
            farmacia: this.farmaciaSeleccionada
        }).subscribe(res => {
            this.data = res;
            this.actualizarGrafica();
        });
    }

    actualizarGrafica() {
        const categorias = this.data.map(d => d.periodo);
        const ventas = this.data.map(d => Number(d.totalVentas));
        const utilidades = this.data.map(d => Number(d.utilidad));
        const conteo = this.data.map(d => Number(d.numeroVentas));

        const maxVentas = Math.max(...ventas, 1);
        const maxUtilidad = Math.max(...utilidades, 1);
        const maxConteo = Math.max(...conteo, 1);

        this.chartReady = false;

        this.chartOptions = {
            ...this.chartOptions,

            series: [
                {
                    name: 'Total ventas ($)',
                    type: 'line',
                    data: ventas
                },
                {
                    name: 'Utilidad ($)',
                    type: 'line',
                    data: utilidades
                },
                {
                    name: 'Número de ventas',
                    type: 'line',
                    data: conteo
                }
            ],

            xaxis: {
                categories: categorias,
                labels: {
                    rotate: -45,
                    hideOverlappingLabels: true
                }
            },

            stroke: {
                width: [3, 3, 2],
                curve: 'smooth'
            },

            markers: {
                size: [0, 0, 0], // ❌ SIN NODOS EN NINGUNA
                hover: { size: 5 }
            },

            yaxis: [
                // 💰 Ventas
                {
                    min: 0,
                    max: Math.ceil(maxVentas * 1.15),
                    title: { text: 'Ventas ($)' },
                    labels: {
                        formatter: (val: number) => `$${val.toLocaleString()}`
                    }
                },

                // 🟢 Utilidad (SU PROPIO EJE)
                {
                    min: 0,
                    max: Math.ceil(maxUtilidad * 2),
                    title: { text: 'Utilidad ($)' },
                    labels: {
                        formatter: (val: number) => `$${val.toLocaleString()}`
                    }
                },

                // 🔢 Número de ventas
                {
                    opposite: true,
                    min: 0,
                    max: Math.ceil(maxConteo * 1.2),
                    title: { text: 'Número de ventas' },
                    labels: {
                        formatter: (val: number) => Math.round(val).toString()
                    }
                }
            ],

            tooltip: {
                shared: true,
                intersect: false,
                y: {
                    formatter: (val: number, { seriesIndex }) =>
                        seriesIndex === 2
                            ? `${Math.round(val)} ventas`
                            : `$${val.toLocaleString()}`
                }
            }
        };

        setTimeout(() => {
            this.chartReady = true;
        }, 0);

        this.calcularKPIs();
        this.calcularHorasClave();
    }


    calcularKPIs() {
        this.kpiTotalVentas = this.data.reduce(
            (acc, d) => acc + (d.totalVentas || 0),
            0
        );

        this.kpiUtilidad = this.data.reduce(
            (acc, d) => acc + (d.utilidad || 0),
            0
        );

        this.kpiVentas = this.data.reduce(
            (acc, d) => acc + (d.numeroVentas || 0),
            0
        );

        this.kpiMargen =
            this.kpiTotalVentas > 0
                ? (this.kpiUtilidad / this.kpiTotalVentas) * 100
                : 0;
    }


    calcularHorasClave() {
        if (!this.data || this.data.length === 0) {
            this.horaPico = null;
            this.horaMuerta = null;
            return;
        }

        // Solo horas con ventas reales
        const validos = this.data.filter(d => d.totalVentas > 0);

        if (validos.length === 0) {
            this.horaPico = null;
            this.horaMuerta = null;
            return;
        }

        this.horaPico = validos.reduce((max, curr) =>
            curr.totalVentas > max.totalVentas ? curr : max
        );

        this.horaMuerta = validos.reduce((min, curr) =>
            curr.totalVentas < min.totalVentas ? curr : min
        );
    }

}

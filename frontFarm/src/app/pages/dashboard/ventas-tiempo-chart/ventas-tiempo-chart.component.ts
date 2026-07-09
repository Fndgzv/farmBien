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

type EscalaVentasTiempo = 'hora' | 'dia' | 'semana' | 'mes' | 'anio';

type OpcionComparacion = {
    valor: string;
    label: string;
};

type PromediosVentasTiempo = {
    periodos: number;
    ventas: number;
    ingresos: number;
    utilidad: number;
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

    escala: EscalaVentasTiempo = 'hora';
    comparacionSeleccionada = '';
    desde!: string;
    hasta!: string;

    readonly horasComparacion: OpcionComparacion[] = Array.from({ length: 17 }, (_, index) => {
        const hora = index + 6;
        return { valor: String(hora), label: `${hora}:00` };
    });

    readonly diasComparacion: OpcionComparacion[] = [
        { valor: '1', label: 'Lunes' },
        { valor: '2', label: 'Martes' },
        { valor: '3', label: 'Miércoles' },
        { valor: '4', label: 'Jueves' },
        { valor: '5', label: 'Viernes' },
        { valor: '6', label: 'Sábado' },
        { valor: '7', label: 'Domingo' }
    ];

    readonly mesesComparacion: OpcionComparacion[] = [
        { valor: '1', label: 'Enero' },
        { valor: '2', label: 'Febrero' },
        { valor: '3', label: 'Marzo' },
        { valor: '4', label: 'Abril' },
        { valor: '5', label: 'Mayo' },
        { valor: '6', label: 'Junio' },
        { valor: '7', label: 'Julio' },
        { valor: '8', label: 'Agosto' },
        { valor: '9', label: 'Septiembre' },
        { valor: '10', label: 'Octubre' },
        { valor: '11', label: 'Noviembre' },
        { valor: '12', label: 'Diciembre' }
    ];

    private readonly mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    private promediosApi: PromediosVentasTiempo | null = null;

    farmacias: any[] = [];
    farmaciaSeleccionada = 'ALL';

    kpiIngresosNetos = 0;
    kpiUtilidad = 0;
    kpiVentas = 0;
    kpiMargen = 0;
    kpiPedidosUnicos = 0;
    kpiPedidosMovs = 0;

    horaPicoUtilidad: any = null;
    horaMuertaUtilidad: any = null;
    horaPicoIngresos: any = null;
    horaMuertaIngresos: any = null;
    horaPicoVentas: any = null;
    horaMuertaVentas: any = null;

    promedios: PromediosVentasTiempo = {
        periodos: 0,
        ventas: 0,
        ingresos: 0,
        utilidad: 0
    };

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
        if (!this.mostrarComparacion && this.comparacionSeleccionada) {
            this.comparacionSeleccionada = '';
        }

        this.reportesService.ventasPorTiempo({
            desde: this.desde,
            hasta: this.hasta,
            escala: this.escala,
            farmacia: this.farmaciaSeleccionada,
            comparar: this.mostrarComparacion ? this.comparacionSeleccionada : undefined,
            incluirPromedios: true
        }).subscribe(res => {
            const payload: any = res || [];
            this.data = Array.isArray(payload) ? payload : (payload.data || []);
            this.promediosApi = Array.isArray(payload) ? null : (payload.promedios || null);
            this.buildChart();
        });
    }

    onEscalaChange() {
        this.comparacionSeleccionada = '';
        this.cargar();
    }

    get mostrarComparacion(): boolean {
        return this.escala === 'hora' || this.escala === 'dia' || this.escala === 'mes';
    }

    get opcionesComparacion(): OpcionComparacion[] {
        switch (this.escala) {
            case 'hora':
                return this.horasComparacion;
            case 'dia':
                return this.diasComparacion;
            case 'mes':
                return this.mesesComparacion;
            default:
                return [];
        }
    }

    buildChart() {

        this.data = this.ordenarData(this.data);
        this.promedios = this.promediosApi || this.calcularPromedios(this.data);
        this.promediosApi = null;
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
            ? this.data.map(d => this.formatearPeriodo(d.periodo, d))
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

    calcularPromedios(data: any[]): PromediosVentasTiempo {
        const periodos = data.length;

        if (!periodos) {
            return {
                periodos: 0,
                ventas: 0,
                ingresos: 0,
                utilidad: 0
            };
        }

        const total = data.reduce((acc, row) => {
            acc.ventas += row.ventas ?? 0;
            acc.ingresos += row.ingresos ?? 0;
            acc.utilidad += row.utilidad ?? 0;
            return acc;
        }, { ventas: 0, ingresos: 0, utilidad: 0 });

        return {
            periodos,
            ventas: this.redondear(total.ventas / periodos),
            ingresos: this.redondear(total.ingresos / periodos),
            utilidad: this.redondear(total.utilidad / periodos)
        };
    }

    private redondear(value: number): number {
        return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    }


    /* =========================
   HORAS CLAVE
   ========================= */
    calcularHorasClave() {
        const validos = this.data.filter(d => d.ingresos > 0);

        if (!validos.length) {
            this.horaPicoUtilidad = null;
            this.horaMuertaUtilidad = null;
            this.horaPicoIngresos = null;
            this.horaMuertaIngresos = null;
            this.horaPicoVentas = null;
            this.horaMuertaVentas = null;
            return;
        }

        this.horaPicoUtilidad = validos.reduce((a, b) =>
            b.utilidad > a.utilidad ? b : a
        );

        this.horaMuertaUtilidad = validos.reduce((a, b) =>
            b.utilidad < a.utilidad ? b : a
        );

        this.horaPicoIngresos = validos.reduce((a, b) =>
            b.ingresos > a.ingresos ? b : a
        );

        this.horaMuertaIngresos = validos.reduce((a, b) =>
            b.ingresos < a.ingresos ? b : a
        );

        this.horaPicoVentas = validos.reduce((a, b) =>
            b.ventas > a.ventas ? b : a
        );

        this.horaMuertaVentas = validos.reduce((a, b) =>
            b.ventas < a.ventas ? b : a
        );
    }

    formatearPeriodo(periodo: string, item?: any): string {
        if (!periodo) return '';

        switch (this.escala) {

            case 'hora':
                if (this.comparacionSeleccionada) {
                    return this.formatearFechaCorta(periodo);
                }
                return periodo;

            case 'dia': {
                if (this.comparacionSeleccionada) {
                    return this.formatearFechaCorta(periodo);
                }
                const [yyyy, mm, dd] = periodo.split('-');
                return `${dd}/${mm}/${yyyy}`;
            }

            case 'semana': {
                const inicio = item?.periodoInicio || periodo;
                const fin = item?.periodoFin || this.sumarDias(periodo, 6);
                return `Semana ${inicio} a ${fin}`;
            }

            case 'mes': {
                if (this.comparacionSeleccionada) {
                    return this.formatearMesAnio(periodo);
                }
                const [yyyy, mm] = periodo.split('-');
                return `${mm}/${yyyy}`;
            }

            case 'anio':
                return periodo;

            default:
                return periodo;
        }
    }

    private formatearFechaCorta(periodo: string): string {
        const [yyyy, mm, dd] = periodo.split('-').map(Number);
        if (!yyyy || !mm || !dd) return periodo;

        return `${String(dd).padStart(2, '0')} ${this.mesesCortos[mm - 1] || ''}`.trim();
    }

    private formatearMesAnio(periodo: string): string {
        const [yyyy, mm] = periodo.split('-').map(Number);
        if (!yyyy || !mm) return periodo;

        return `${this.mesesCortos[mm - 1] || String(mm).padStart(2, '0')} ${yyyy}`;
    }

    private sumarDias(periodo: string, dias: number): string {
        const [yyyy, mm, dd] = periodo.split('-').map(Number);
        if (!yyyy || !mm || !dd) return periodo;

        const date = new Date(yyyy, mm - 1, dd);
        date.setDate(date.getDate() + dias);

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    get etiquetaAlta(): string {
        switch (this.escala) {
            case 'hora': return 'Hora pico';
            case 'dia': return 'Día más alto';
            case 'semana': return 'Semana más alta';
            case 'mes': return 'Mes más alto';
            case 'anio': return 'Año más alto';
            default: return 'Máximo';
        }
    }

    get etiquetaBaja(): string {
        switch (this.escala) {
            case 'hora': return 'Hora muerta';
            case 'dia': return 'Día más bajo';
            case 'semana': return 'Semana más baja';
            case 'mes': return 'Mes más bajo';
            case 'anio': return 'Año más bajo';
            default: return 'Mínimo';
        }
    }

    get etiquetaPromedio(): string {
        if (this.comparacionSeleccionada) {
            switch (this.escala) {
                case 'hora':
                case 'dia':
                    return 'Promedio por día';
                case 'mes':
                    return 'Promedio por mes';
                default:
                    break;
            }
        }

        switch (this.escala) {
            case 'hora': return 'Promedio por hora';
            case 'dia': return 'Promedio por día';
            case 'semana': return 'Promedio por semana';
            case 'mes': return 'Promedio por mes';
            case 'anio': return 'Promedio por año';
            default: return 'Promedio';
        }
    }

    ordenarData(data: any[]): any[] {
        return [...data].sort((a, b) => {
            const periodoA = String(a.periodo ?? '');
            const periodoB = String(b.periodo ?? '');

            if (
                this.escala === 'hora' &&
                !this.comparacionSeleccionada &&
                /^\d+$/.test(periodoA) &&
                /^\d+$/.test(periodoB)
            ) {
                return Number(periodoA) - Number(periodoB);
            }

            return periodoA.localeCompare(periodoB);
        });
    }


}

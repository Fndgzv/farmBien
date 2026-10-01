import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of, Subscription } from 'rxjs';

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

type PuntoComparacionAnual = {
    actual?: any;
    anterior?: any;
};

@Component({
    selector: 'app-ventas-tiempo-chart',
    standalone: true,
    imports: [CommonModule, FormsModule, NgApexchartsModule, MatTooltipModule],
    templateUrl: './ventas-tiempo-chart.component.html',
    styleUrls: ['./ventas-tiempo-chart.component.css']
})
export class VentasTiempoChartComponent implements OnInit, OnDestroy {

    data: any[] = [];

    escala: EscalaVentasTiempo = 'hora';
    comparacionSeleccionada = '';
    compararAnioAnterior = false;
    cargando = false;
    mensajeError = '';
    desde!: string;
    hasta!: string;

    private dataAnioAnterior: any[] = [];
    private comparacionAnualCargada = false;
    private cargaSubscription?: Subscription;

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
        // Cancela respuestas pendientes al cambiar filtros o apagar la comparación.
        this.cargaSubscription?.unsubscribe();
        this.mensajeError = '';

        if (!this.mostrarComparacion && this.comparacionSeleccionada) {
            this.comparacionSeleccionada = '';
        }

        if (!this.desde || !this.hasta) {
            this.cargando = false;
            this.data = [];
            this.dataAnioAnterior = [];
            this.promediosApi = null;
            this.comparacionAnualCargada = false;
            this.buildChart();
            return;
        }

        const params = {
            desde: this.desde,
            hasta: this.hasta,
            escala: this.escala,
            farmacia: this.farmaciaSeleccionada,
            comparar: this.mostrarComparacion ? this.comparacionSeleccionada : undefined,
            incluirPromedios: true
        };

        this.cargando = true;
        const anterior$ = this.compararAnioAnterior
            ? this.reportesService.ventasPorTiempo({
                ...params,
                desde: this.fechaAnioAnterior(this.desde),
                hasta: this.fechaAnioAnterior(this.hasta)
            }).pipe(catchError(() => {
                this.mensajeError = 'No se pudo cargar el año anterior. Pulsa Aplicar para reintentar.';
                return of(null);
            }))
            : of(null);

        this.cargaSubscription = forkJoin({
            actual: this.reportesService.ventasPorTiempo(params),
            anterior: anterior$
        }).subscribe({
            next: ({ actual, anterior }) => {
                const payload: any = actual || [];
                this.data = Array.isArray(payload) ? payload : (payload.data || []);
                this.promediosApi = Array.isArray(payload) ? null : (payload.promedios || null);
                this.dataAnioAnterior = Array.isArray(anterior) ? anterior : (anterior?.data || []);
                this.comparacionAnualCargada = anterior !== null;
                this.cargando = false;
                this.buildChart();
            },
            error: () => {
                this.cargando = false;
                this.mensajeError = 'No se pudieron cargar los datos. Pulsa Aplicar para reintentar.';
                this.data = [];
                this.dataAnioAnterior = [];
                this.promediosApi = null;
                this.comparacionAnualCargada = false;
                this.buildChart();
            }
        });
    }

    ngOnDestroy() {
        this.cargaSubscription?.unsubscribe();
    }

    alternarComparacionAnual() {
        this.compararAnioAnterior = !this.compararAnioAnterior;
        if (!this.compararAnioAnterior) {
            this.dataAnioAnterior = [];
            this.comparacionAnualCargada = false;
            this.buildChart();
        }
        this.cargar();
    }

    fechaAnioAnterior(fecha: string): string {
        if (!fecha) return '';
        const [anio, mes, dia] = fecha.split('-').map(Number);
        // El 29 de febrero se ajusta al último día de febrero si el año no es bisiesto.
        const ultimoDia = new Date(anio - 1, mes, 0).getDate();
        return `${anio - 1}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
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
        const comparar = this.compararAnioAnterior && this.comparacionAnualCargada;
        const puntos = comparar
            ? this.alinearComparacionAnual()
            : this.data.map(actual => ({ actual } as PuntoComparacionAnual));
        const categorias = puntos.map(({ actual, anterior }) => actual
            ? this.formatearPeriodo(actual.periodo, actual)
            : `${this.formatearPeriodo(anterior.periodo, anterior)} (año anterior)`);
        const valores = (campo: string, periodo: 'actual' | 'anterior') =>
            puntos.map(punto => punto[periodo] ? (punto[periodo][campo] ?? 0) : null);

        const ventas = valores('ingresos', 'actual');
        const utilidad = valores('utilidad', 'actual');
        const conteo = valores('ventas', 'actual');
        const ventasAnteriores = valores('ingresos', 'anterior');
        const utilidadAnterior = valores('utilidad', 'anterior');
        const conteoAnterior = valores('ventas', 'anterior');
        const maximo = (valores: (number | null)[]) => valores.reduce<number>((max, valor) => Math.max(max, valor ?? 0), 0);
        const maxVentas = maximo([...ventas, ...ventasAnteriores]);
        const maxUtilidad = maximo([...utilidad, ...utilidadAnterior]);
        const maxConteo = maximo([...conteo, ...conteoAnterior]);
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
                { name: 'Ingresos netos ($)', data: ventas },
                { name: 'Utilidad ($)', data: utilidad },
                { name: 'Número de ventas', data: conteo },
                ...(comparar ? [
                    { name: 'Ingresos netos ($) · Año anterior', data: ventasAnteriores },
                    { name: 'Utilidad ($) · Año anterior', data: utilidadAnterior },
                    { name: 'Número de ventas · Año anterior', data: conteoAnterior }
                ] : [])
            ],

            xaxis: {
                type: 'category',
                categories: categorias,
                labels: { rotate: -45, style: { fontSize: '12px' } }
            },

            yaxis: [
                {
                    seriesName: 'Ingresos netos ($)',
                    min: 0,
                    max: Math.max(1, Math.ceil(maxVentas)),
                    title: { text: 'Ingresos ($)' },
                    labels: { formatter: v => `$${Math.round(v)}` }
                },
                {
                    seriesName: 'Utilidad ($)',
                    min: 0,
                    max: Math.max(1, Math.ceil(maxUtilidad * 1.6)),
                    title: { text: 'Utilidad ($)' },
                    labels: { formatter: v => `$${Math.round(v)}` }
                },
                {
                    seriesName: 'Número de ventas',
                    opposite: true,
                    min: 0,
                    max: Math.max(1, Math.ceil(maxConteo * 1.2)),
                    tickAmount: tickConteo,
                    forceNiceScale: true,
                    title: { text: 'Número de ventas' },
                    labels: { formatter: v => `${Math.round(v)}` }
                }
            ],

            stroke: {
                curve: 'smooth',
                width: comparar ? [3, 3, 2, 2, 2, 2] : [3, 3, 2],
                dashArray: comparar ? [0, 0, 0, 6, 6, 6] : [0, 0, 0]
            },
            markers: { size: comparar ? [4, 4, 4, 2, 2, 2] : 4 },
            tooltip: {
                shared: true,
                intersect: false,
                ...(comparar ? {
                    x: {
                        formatter: (_: number, opts: any) => {
                            const punto = puntos[opts.dataPointIndex];
                            return punto
                                ? `Actual: ${this.etiquetaPeriodoAnual(punto.actual)} · Año anterior: ${this.etiquetaPeriodoAnual(punto.anterior)}`
                                : '';
                        }
                    }
                } : {})
            },
            dataLabels: { enabled: false },
            colors: comparar
                ? ['#1E88E5', '#2E7D32', '#F57C00', '#1E88E5', '#2E7D32', '#F57C00']
                : ['#1E88E5', '#2E7D32', '#F57C00']
        };

        if (comparar) {
            // ApexCharts 3 requiere un eje por serie; los ejes ocultos comparten
            // nombre y límites con la métrica actual para dibujar la misma escala.
            this.chartOptions.yaxis.push(...this.chartOptions.yaxis.map(eje => ({ ...eje, show: false })));
        }

        this.calcularHorasClave();
    }

    private alinearComparacionAnual(): PuntoComparacionAnual[] {
        const anteriores = this.ordenarData(this.dataAnioAnterior);
        if (this.escala === 'semana' || (this.escala === 'dia' && this.comparacionSeleccionada)) {
            // El API completa estas secuencias. Se empareja la primera semana/día
            // seleccionado de cada rango, ya que cambia de fecha entre años.
            return Array.from({ length: Math.max(this.data.length, anteriores.length) }, (_, index) => ({
                actual: this.data[index],
                anterior: anteriores[index]
            }));
        }

        const porPeriodo = new Map<string, PuntoComparacionAnual>();
        this.data.forEach(actual => porPeriodo.set(String(actual.periodo), { actual }));
        anteriores.forEach(anterior => {
            // Conserva mes, día y hora. No desplaza puntos si faltan ventas en una
            // fecha, ni mezcla el 29 de febrero con los datos del día 28.
            const clave = String(anterior.periodo).replace(/^\d{4}(?=-|$)/, anio => String(Number(anio) + 1));
            porPeriodo.set(clave, { ...porPeriodo.get(clave), anterior });
        });
        return this.ordenarData(Array.from(porPeriodo, ([periodo, punto]) => ({ periodo, ...punto })));
    }

    private etiquetaPeriodoAnual(item: any): string {
        if (!item) return 'Sin datos';
        if (this.escala === 'semana') return this.formatearPeriodo(item.periodo, item);
        // Incluye el año también cuando el filtro de hora/día usa etiquetas cortas.
        return String(item.periodo).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1');
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

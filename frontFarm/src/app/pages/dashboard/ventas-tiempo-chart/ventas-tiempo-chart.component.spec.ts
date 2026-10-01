import { of, Subject, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChartComponent } from 'ng-apexcharts';
import { VentasTiempoChartComponent } from './ventas-tiempo-chart.component';
import { ReportesService } from '../../../services/reportes.service';
import { FarmaciaService } from '../../../services/farmacia.service';

describe('VentasTiempoChartComponent comparación anual', () => {
    let component: VentasTiempoChartComponent;
    let reportes: jasmine.SpyObj<ReportesService>;

    const fila = (periodo: string, ingresos: number, utilidad = ingresos / 2, ventas = 1) =>
        ({ periodo, ingresos, utilidad, ventas });

    beforeEach(() => {
        reportes = jasmine.createSpyObj<ReportesService>('ReportesService', ['ventasPorTiempo']);
        reportes.ventasPorTiempo.and.returnValue(of([]));
        component = new VentasTiempoChartComponent(reportes, {} as FarmaciaService);
        component.desde = '2025-09-30';
        component.hasta = '2026-02-28';
        component.escala = 'mes';
        component.farmaciaSeleccionada = 'farmacia-1';
    });

    afterEach(() => component.ngOnDestroy());

    function cargarComparacion(actual: any, anterior: any) {
        reportes.ventasPorTiempo.and.callFake(params =>
            of(params.desde === component.desde ? actual : anterior));
        component.compararAnioAnterior = true;
        component.cargar();
    }

    it('inicia apagada y consulta únicamente el periodo actual', () => {
        component.cargar();

        expect(component.compararAnioAnterior).toBeFalse();
        expect(reportes.ventasPorTiempo).toHaveBeenCalledOnceWith({
            desde: '2025-09-30', hasta: '2026-02-28', escala: 'mes',
            farmacia: 'farmacia-1', comparar: '', incluirPromedios: true
        });
        expect(component.chartOptions.series.length).toBe(3);
    });

    it('resta un año a ambos extremos y conserva los demás filtros', () => {
        component.comparacionSeleccionada = '2';
        component.alternarComparacionAnual();

        expect(reportes.ventasPorTiempo).toHaveBeenCalledWith({
            desde: '2024-09-30', hasta: '2025-02-28', escala: 'mes',
            farmacia: 'farmacia-1', comparar: '2', incluirPromedios: true
        });
        expect(reportes.ventasPorTiempo).toHaveBeenCalledWith({
            desde: '2025-09-30', hasta: '2026-02-28', escala: 'mes',
            farmacia: 'farmacia-1', comparar: '2', incluirPromedios: true
        });
        expect(component.desde).toBe('2025-09-30');
        expect(component.hasta).toBe('2026-02-28');
    });

    it('superpone tres líneas punteadas con escalas comunes sin sumar los KPIs históricos', () => {
        cargarComparacion({
            data: [fila('2025-09', 100, 30, 2)],
            promedios: { periodos: 6, ingresos: 16.67, utilidad: 5, ventas: 0.33 }
        }, [fila('2024-09', 500, 200, 50)]);

        expect(component.chartOptions.series.map(serie => serie.data)).toEqual([
            [100], [30], [2], [500], [200], [50]
        ]);
        expect(component.chartOptions.stroke.dashArray).toEqual([0, 0, 0, 6, 6, 6]);
        expect(component.chartOptions.yaxis[0].max).toBe(500);
        expect(component.chartOptions.yaxis[1].max).toBe(320);
        expect(component.chartOptions.yaxis[2].max).toBe(60);
        for (let index = 0; index < 3; index++) {
            expect(component.chartOptions.yaxis[index + 3]).toEqual({
                ...component.chartOptions.yaxis[index], show: false
            });
        }
        expect(component.kpiIngresosNetos).toBe(100);
        expect(component.kpiUtilidad).toBe(30);
        expect(component.kpiVentas).toBe(2);
        expect(component.promedios.ingresos).toBe(16.67);
        component.buildChart();
        expect(component.promedios.ingresos).toBe(16.67);
    });

    it('alinea por fecha aunque falten meses y conserva los puntos exclusivos del año anterior', () => {
        cargarComparacion(
            [fila('2026-02', 20), fila('2025-09', 10)],
            { data: [fila('2024-09', 100), fila('2024-12', 150), fila('2025-02', 200)] }
        );

        expect(component.chartOptions.series[0].data).toEqual([10, null, 20]);
        expect(component.chartOptions.series[3].data).toEqual([100, 150, 200]);
        expect(component.chartOptions.xaxis.categories).toEqual([
            '09/2025', '12/2024 (año anterior)', '02/2026'
        ]);
    });

    it('alinea las horas por fecha y hora, incluso al cruzar el año', () => {
        component.escala = 'hora';
        cargarComparacion(
            [fila('2025-12-31 09:00', 10), fila('2026-01-01 10:00', 20)],
            [fila('2024-12-31 09:00', 100), fila('2025-01-01 09:00', 150), fila('2025-01-01 10:00', 200)]
        );

        expect(component.chartOptions.series[0].data).toEqual([10, null, 20]);
        expect(component.chartOptions.series[3].data).toEqual([100, 150, 200]);
    });

    it('mantiene el filtro de hora al comparar las fechas equivalentes', () => {
        component.escala = 'hora';
        component.comparacionSeleccionada = '9';
        cargarComparacion([fila('2025-09-30', 10)], [fila('2024-09-30', 100)]);

        expect(reportes.ventasPorTiempo.calls.allArgs().every(([params]) => params.comparar === '9')).toBeTrue();
        expect(component.chartOptions.series[3].data).toEqual([100]);
        expect(component.chartOptions.tooltip.x?.formatter?.(0, { dataPointIndex: 0 }))
            .toBe('Actual: 30/09/2025 · Año anterior: 30/09/2024');
    });

    it('empareja semanas en orden y muestra sus fechas reales en el tooltip', () => {
        component.escala = 'semana';
        cargarComparacion(
            [fila('2025-09-29', 10), fila('2025-10-06', 20)],
            [fila('2024-09-30', 100), fila('2024-10-07', 200), fila('2024-10-14', 300)]
        );

        expect(component.chartOptions.series[0].data).toEqual([10, 20, null]);
        expect(component.chartOptions.series[3].data).toEqual([100, 200, 300]);
        const tooltip = component.chartOptions.tooltip.x?.formatter?.(0, { dataPointIndex: 0 });
        expect(tooltip).toContain('Semana 2025-09-29 a 2025-10-05');
        expect(tooltip).toContain('Semana 2024-09-30 a 2024-10-06');
    });

    it('conserva el día de semana seleccionado aunque sus fechas cambien entre años', () => {
        component.escala = 'dia';
        component.comparacionSeleccionada = '1';
        cargarComparacion(
            [fila('2025-10-06', 10), fila('2025-10-13', 20)],
            [fila('2024-09-30', 100), fila('2024-10-07', 200)]
        );

        expect(reportes.ventasPorTiempo.calls.allArgs().every(([params]) => params.comparar === '1')).toBeTrue();
        expect(component.chartOptions.series[3].data).toEqual([100, 200]);
        expect(component.chartOptions.tooltip.x?.formatter?.(0, { dataPointIndex: 0 }))
            .toBe('Actual: 06/10/2025 · Año anterior: 30/09/2024');
    });

    it('alinea los años aunque no haya datos del periodo actual', () => {
        component.escala = 'anio';
        cargarComparacion([], [fila('2024', 100), fila('2025', 200)]);

        expect(component.chartOptions.series[0].data).toEqual([null, null]);
        expect(component.chartOptions.series[3].data).toEqual([100, 200]);
        expect(component.kpiIngresosNetos).toBe(0);
    });

    it('ajusta el 29 de febrero al consultar y no lo mezcla con el 28 al dibujar', () => {
        component.escala = 'dia';
        component.desde = '2024-02-29';
        component.hasta = '2024-03-01';
        component.alternarComparacionAnual();
        expect(reportes.ventasPorTiempo).toHaveBeenCalledWith(jasmine.objectContaining({
            desde: '2023-02-28', hasta: '2023-03-01'
        }));

        component.desde = '2025-02-28';
        component.hasta = '2025-03-01';
        cargarComparacion(
            [fila('2025-02-28', 10), fila('2025-03-01', 20)],
            [fila('2024-02-28', 100), fila('2024-02-29', 150), fila('2024-03-01', 200)]
        );
        expect(component.chartOptions.series[0].data).toEqual([10, null, 20]);
        expect(component.chartOptions.series[3].data).toEqual([100, 150, 200]);
        expect(component.chartOptions.xaxis.categories[1]).toBe('29/02/2024 (año anterior)');
    });

    it('apaga la comparación inmediatamente y descarta las consultas anteriores pendientes', () => {
        const pendiente = new Subject<any>();
        reportes.ventasPorTiempo.and.returnValue(pendiente);
        component.alternarComparacionAnual();
        expect(pendiente.observed).toBeTrue();

        reportes.ventasPorTiempo.and.returnValue(of([fila('2025-09', 10)]));
        component.alternarComparacionAnual();
        expect(pendiente.observed).toBeFalse();
        pendiente.next([fila('2024-09', 999)]);
        pendiente.complete();

        expect(component.compararAnioAnterior).toBeFalse();
        expect(component.chartOptions.series.length).toBe(3);
        expect(component.chartOptions.series[0].data).toEqual([10]);
    });

    it('descarta filtros anteriores y cancela la carga al destruir el componente', () => {
        const pendiente = new Subject<any>();
        reportes.ventasPorTiempo.and.returnValue(pendiente);
        component.alternarComparacionAnual();

        component.farmaciaSeleccionada = 'farmacia-2';
        cargarComparacion([fila('2025-09', 20)], [fila('2024-09', 200)]);
        expect(pendiente.observed).toBeFalse();
        expect(reportes.ventasPorTiempo.calls.mostRecent().args[0].farmacia).toBe('farmacia-2');
        expect(component.chartOptions.series[3].data).toEqual([200]);

        reportes.ventasPorTiempo.and.returnValue(pendiente);
        component.cargar();
        component.ngOnDestroy();
        expect(pendiente.observed).toBeFalse();
    });

    it('conserva los datos actuales y permite reintentar si falla el año anterior', () => {
        reportes.ventasPorTiempo.and.callFake(params => params.desde === component.desde
            ? of([fila('2025-09', 10)])
            : throwError(() => new Error('Error de red')));
        component.alternarComparacionAnual();

        expect(component.chartOptions.series.length).toBe(3);
        expect(component.kpiIngresosNetos).toBe(10);
        expect(component.mensajeError).toContain('año anterior');
        expect(component.cargando).toBeFalse();

        cargarComparacion([fila('2025-09', 10)], [fila('2024-09', 100)]);
        expect(component.mensajeError).toBe('');
        expect(component.chartOptions.series.length).toBe(6);
    });

    it('el interruptor dibuja y retira las líneas reales de ApexCharts con escalas equivalentes', async () => {
        await TestBed.configureTestingModule({
            imports: [VentasTiempoChartComponent],
            providers: [
                { provide: ReportesService, useValue: reportes },
                { provide: FarmaciaService, useValue: { obtenerFarmacias: () => of([]) } }
            ]
        }).compileComponents();
        const fixture = TestBed.createComponent(VentasTiempoChartComponent);
        const vista = fixture.componentInstance;
        reportes.ventasPorTiempo.and.callFake(params => of(params.desde === vista.desde
            ? [fila('2025-09', 100, 30, 2), fila('2026-02', 200, 60, 4)]
            : [fila('2024-09', 500, 150, 10), fila('2025-02', 1000, 300, 20)]));

        try {
            fixture.detectChanges();
            await fixture.whenStable();
            vista.desde = '2025-09-30';
            vista.hasta = '2026-02-28';
            vista.escala = 'mes';
            vista.cargar();
            fixture.detectChanges();
            await fixture.whenStable();
            const boton: HTMLButtonElement = fixture.nativeElement.querySelector('[role="switch"]');
            expect(boton.getAttribute('aria-checked')).toBe('false');
            expect(fixture.nativeElement.querySelectorAll('.apexcharts-line').length).toBe(3);

            boton.click();
            fixture.detectChanges();
            await fixture.whenStable();
            expect(boton.getAttribute('aria-checked')).toBe('true');
            const lineas: NodeListOf<SVGElement> = fixture.nativeElement.querySelectorAll('.apexcharts-line');
            expect(lineas.length).toBe(6);
            expect(Array.from(lineas).slice(3).every(linea => linea.getAttribute('stroke-dasharray') === '6')).toBeTrue();
            expect(fixture.nativeElement.querySelector('.comparacion-anual-info').textContent).toContain('30/09/2024');
            const grafica = fixture.debugElement.query(By.directive(ChartComponent)).componentInstance;
            const escalas = grafica.chartObj.w.globals.yAxisScale;
            for (let index = 0; index < 3; index++) {
                expect(escalas[index + 3]).toEqual(escalas[index]);
            }

            boton.click();
            fixture.detectChanges();
            await fixture.whenStable();
            expect(boton.getAttribute('aria-checked')).toBe('false');
            expect(fixture.nativeElement.querySelectorAll('.apexcharts-line').length).toBe(3);
        } finally {
            fixture.destroy();
        }
    });
});

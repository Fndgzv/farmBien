import { ReporteSurtidosComponent } from './reporte-surtidos.component';
import { SurtidoReporteItem, SurtidoReporteRow } from '../../services/reportes.service';

describe('ReporteSurtidosComponent costos historicos', () => {
  const component = new ReporteSurtidosComponent({} as any, {} as any);

  function row(items: SurtidoReporteItem[]): SurtidoReporteRow {
    return {
      _id: 'surtido-1',
      farmacia: 'Farmacia prueba',
      fechaSurtido: '2026-08-10T12:00:00.000Z',
      usuario: 'admin',
      usuarioExiste: true,
      items
    };
  }

  it('distingue un costo real de cero de un costo inexistente', () => {
    const costoCero = { cantidad: 4, costo: 0 } as SurtidoReporteItem;
    const historico = { cantidad: 4 } as SurtidoReporteItem;

    expect(component.costoUnitario(costoCero)).toBe(0);
    expect(component.costoTotalItem(costoCero)).toBe(0);
    expect(component.costoUnitario(historico)).toBeNull();
    expect(component.costoTotalItem(historico)).toBeNull();
  });

  it('suma solo los renglones que tienen costo almacenado', () => {
    const surtido = row([
      { cantidad: 4, costo: 125.5 } as SurtidoReporteItem,
      { cantidad: 10 } as SurtidoReporteItem,
      { cantidad: 3, costo: 0 } as SurtidoReporteItem
    ]);

    expect(component.costoTotalSurtido(surtido)).toBe(502);
    expect(component.costoTotalSurtido(row([{ cantidad: 1 } as SurtidoReporteItem]))).toBeNull();
  });

  it('mantiene la impresion sin columnas ni totales de costo', () => {
    const surtido = row([{
      producto: 'Producto A',
      codigoBarras: '123',
      categoria: 'General',
      cantidad: 4,
      ubicacionAlmacen: 'A-1',
      ubicacionFarmacia: 'F-1',
      costo: 125.5
    }]);

    const html = (component as any).buildPrintHtml(surtido);
    expect(html).not.toContain('Costo U.');
    expect(html).not.toContain('Costo Tot');
    expect(html).not.toContain('COSTO TOTAL del SURTIDO');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faCashRegister, faShoppingCart, faUndo } from '@fortawesome/free-solid-svg-icons';
import { of, Subject } from 'rxjs';
import { ClientesComponent } from './clientes.component';
import { ClienteService } from '../../services/cliente.service';

describe('Clientes: total y saldo de monedero', () => {
  let fixture: ComponentFixture<ClientesComponent>;
  let component: ClientesComponent;
  let servicio: jasmine.SpyObj<ClienteService>;

  beforeEach(async () => {
    servicio = jasmine.createSpyObj('ClienteService', ['listar', 'ventas', 'pedidos', 'devoluciones', 'cancelaciones', 'monedero']);
    servicio.listar.and.returnValue(of({ rows: [
      { _id: 'cliente-1', nombre: 'Ana', telefono: '5512345678', totalMonederoCliente: 120, totalMonedero: 15 },
      { _id: 'cliente-2', nombre: 'Beatriz', telefono: '5512345679', totalMonederoCliente: 0, totalMonedero: 0 }
    ], paginacion: { total: 2, page: 1, limit: 20 } }));
    servicio.ventas.and.returnValue(of({ rows: [], footer: null }));
    await TestBed.configureTestingModule({
      imports: [ClientesComponent, NoopAnimationsModule],
      providers: [{ provide: ClienteService, useValue: servicio }]
    }).compileComponents();
    TestBed.inject(FaIconLibrary).addIcons(faCashRegister, faShoppingCart, faUndo);
    fixture = TestBed.createComponent(ClientesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('muestra total después de domicilio y conserva el saldo en su propia columna', () => {
    const headers = Array.from(fixture.nativeElement.querySelectorAll('th')).map((th: any) => th.textContent.trim());
    expect(headers).toEqual(['Nombre', 'Teléfono', 'Email', 'Domicilio', 'Total monedero', 'Saldo monedero', 'Acciones']);
    const totales = fixture.nativeElement.querySelectorAll('td.mat-column-totalMonederoCliente');
    const saldos = fixture.nativeElement.querySelectorAll('td.mat-column-monedero');
    expect(totales[0].textContent).toContain('120.00');
    expect(saldos[0].textContent).toContain('15.00');
    expect(totales[1].textContent).toContain('0.00');
  });

  it('envía el rango de fechas en la primera carga', () => {
    expect(servicio.listar.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      fechaIni: component.fechaIni, fechaFin: component.fechaFin, page: 1, limit: 20
    }));
    expect(component.fechaIni).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('recarga totales al cambiar fechas sin necesidad de abrir una subtabla', () => {
    component.page = 3;
    component.fechaIni = '2026-10-01';
    component.fechaFin = '2026-10-17';
    component.filtro = 'Ana';
    component.filtroTelefono = '5512';
    component.onChangeFechas();
    expect(component.page).toBe(1);
    expect(servicio.listar.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      q: 'Ana', telefono: '5512', fechaIni: '2026-10-01', fechaFin: '2026-10-17', page: 1
    }));
  });

  it('alterna el orden total, conserva el orden de saldo y permite volver a nombre', () => {
    const totalButton = fixture.nativeElement.querySelector('[aria-label="Ordenar por total monedero"]') as HTMLButtonElement;
    component.page = 2;
    totalButton.click();
    fixture.detectChanges();
    expect(servicio.listar.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      sortBy: 'totalMonederoCliente', sortDir: 'desc', page: 1
    }));
    totalButton.click();
    fixture.detectChanges();
    expect(servicio.listar.calls.mostRecent().args[0].sortDir).toBe('asc');

    component.fechaFin = '2026-10-10';
    component.onChangeFechas();
    expect(servicio.listar.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      sortBy: 'totalMonederoCliente', sortDir: 'asc', fechaFin: '2026-10-10'
    }));

    (fixture.nativeElement.querySelector('[aria-label="Quitar orden de total monedero"]') as HTMLButtonElement).click();
    expect(component.sortBy).toBe('nombre');
    (fixture.nativeElement.querySelector('[aria-label="Ordenar por saldo monedero"]') as HTMLButtonElement).click();
    expect(servicio.listar.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ sortBy: 'totalMonedero', sortDir: 'desc' }));
    component.clearSort();
    expect(component.sortBy).toBe('nombre');
  });

  it('descarta respuestas anteriores cuando las fechas cambian rápidamente', () => {
    const anterior = new Subject<any>();
    const actual = new Subject<any>();
    servicio.listar.and.returnValues(anterior, actual);
    component.fechaFin = '2026-10-10';
    component.onChangeFechas();
    component.fechaFin = '2026-10-17';
    component.onChangeFechas();
    anterior.next({ rows: [{ nombre: 'Respuesta anterior', totalMonederoCliente: 999 }], paginacion: { total: 1 } });
    expect(component.cargando).toBeTrue();
    expect(component.clientes[0].nombre).toBe('Ana');
    actual.next({ rows: [{ nombre: 'Respuesta actual', totalMonederoCliente: 120 }], paginacion: { total: 1 } });
    expect(component.clientes[0].nombre).toBe('Respuesta actual');
    expect(component.cargando).toBeFalse();
  });

  it('recarga también las compras abiertas con el mismo rango', () => {
    component.expandedRow = 'cliente-1_ventas';
    component.subFooter[component.expandedRow] = { alMonedero: 999 };
    component.fechaIni = '2026-09-01';
    component.fechaFin = '2026-09-30';
    component.onChangeFechas();
    expect(servicio.ventas).toHaveBeenCalledOnceWith('cliente-1', {
      page: 1, limit: 20, fechaIni: '2026-09-01', fechaFin: '2026-09-30'
    });
    expect(component.expandedRow).toBe('cliente-1_ventas');
    expect(component.subFooter[component.expandedRow]).toBeUndefined();
  });
});

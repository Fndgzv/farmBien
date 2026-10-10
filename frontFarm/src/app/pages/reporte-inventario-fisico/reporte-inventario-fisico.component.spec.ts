import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ReporteInventarioFisicoComponent } from './reporte-inventario-fisico.component';
import { InventarioFisicoService } from '../../services/inventario-fisico.service';
import { ProductoService } from '../../services/producto.service';

describe('Reporte de inventario físico: ubicación y total', () => {
  let fixture: ComponentFixture<ReporteInventarioFisicoComponent>;
  let component: ReporteInventarioFisicoComponent;
  let servicio: jasmine.SpyObj<InventarioFisicoService>;

  beforeEach(async () => {
    servicio = jasmine.createSpyObj('InventarioFisicoService', ['obtenerRegistros']);
    servicio.obtenerRegistros.and.callFake(params => of({
      total: 2, diferenciaTotal: -15,
      resultados: [{ producto: { nombre: 'Producto' }, ubicacion: 'B-2', perdida: params.page === '1' ? -20 : 5 }]
    }));
    spyOn(ReporteInventarioFisicoComponent.prototype, 'ngOnInit');
    await TestBed.configureTestingModule({
      imports: [ReporteInventarioFisicoComponent],
      providers: [
        { provide: InventarioFisicoService, useValue: servicio },
        { provide: HttpClient, useValue: {} }, { provide: ProductoService, useValue: {} }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ReporteInventarioFisicoComponent);
    component = fixture.componentInstance;
    component.limit = 1;
    component.filtros.farmacia = 'farmacia-1';
  });

  it('muestra Ubicación después de Producto y conserva el total al cambiar de página', () => {
    component.buscar();
    fixture.detectChanges();
    const titulos = [...fixture.nativeElement.querySelectorAll('th')].map((th: any) => th.textContent.trim());
    expect(titulos.slice(0, 3)).toEqual(['Fecha', 'Producto', 'Ubicación']);
    expect(titulos).not.toContain('Farmacia');
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('B-2');
    const totalPrimera = fixture.nativeElement.querySelector('.diferencia-total').textContent;
    expect(totalPrimera).toContain('Diferencia total:');
    component.siguiente();
    fixture.detectChanges();
    expect(component.page).toBe(2);
    expect(component.registros[0].perdida).toBe(5);
    expect(fixture.nativeElement.querySelector('.diferencia-total').textContent).toBe(totalPrimera);
    component.buscar();
    expect(component.page).toBe(1);
  });

  it('envía la selección de almacén al backend', () => {
    component.filtros.almacen = true;
    component.buscar();
    expect(servicio.obtenerRegistros).toHaveBeenCalledWith(jasmine.objectContaining({ farmacia: 'Almacén', almacen: 'true' }));
  });
});

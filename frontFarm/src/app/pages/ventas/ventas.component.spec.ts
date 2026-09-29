import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { VentasComponent } from './ventas.component';
import { VentasService } from '../../services/ventas.service';
import { ProductoService } from '../../services/producto.service';
import { ClienteService } from '../../services/cliente.service';
import { VentaService } from '../../services/venta.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { FichasConsultorioService } from '../../services/fichas-consultorio.service';
import { VentaTicketPrintService } from '../../services/venta-ticket-print.service';

describe('Ventas: tabla y consulta de precio en pantallas pequeñas', () => {
  let fixture: ComponentFixture<VentasComponent>;
  let component: VentasComponent;
  let productoService: jasmine.SpyObj<ProductoService>;

  beforeEach(async () => {
    productoService = jasmine.createSpyObj<ProductoService>('ProductoService', ['consultarPrecioPorCodigo']);
    productoService.consultarPrecioPorCodigo.and.returnValue(of({
      nombre: 'Paracetamol 500 mg', precioNormal: 25, ubicacionFarmacia: 'A-1'
    }));
    // Evitar servicios de venta y cambios de foco ajenos al modal bajo prueba.
    spyOn(VentasComponent.prototype, 'ngOnInit').and.resolveTo();
    spyOn(VentasComponent.prototype, 'ngAfterViewInit');
    spyOn(VentasComponent.prototype, 'ngOnDestroy');
    await TestBed.configureTestingModule({
      imports: [VentasComponent, NoopAnimationsModule],
      providers: [
        { provide: ProductoService, useValue: productoService },
        ...[VentasService, ClienteService, VentaService, FarmaciaService, FichasConsultorioService,
          VentaTicketPrintService].map(provide => ({ provide, useValue: {} }))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(VentasComponent);
    component = fixture.componentInstance;
    component.farmaciaId = 'farmacia-prueba';
    component.productos = [
      { _id: '1', codigoBarras: '7501234567890', nombre: 'Paracetamol 500 mg' },
      { _id: '2', codigoBarras: '1234567890', nombre: 'Otro producto' }
    ];
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('mantiene un ancho legible para producto y permite desplazar la tabla con todas las escalas', () => {
    component.carrito = [{
      producto: '1', nombre: 'Paracetamol tabletas de 500 mg caja con veinte tabletas para adulto',
      ubicacionEnFarmacia: 'Estante A, nivel 2', cantidad: 1, precioOriginal: 25,
      precioFinal: 25, alMonedero: 0, descuentoUnitario: 0, tipoDescuento: 'Ninguno'
    }];
    const host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    for (const ancho of [320, 390, 768, 1440]) {
      host.style.width = `${ancho}px`;
      for (const escala of component.scales) {
        component.thumbScale = escala;
        fixture.detectChanges();
        const contenedor = host.querySelector<HTMLElement>('.ventas-container')!;
        const celda = host.querySelector<HTMLElement>('td.col-producto')!;
        expect(celda.getBoundingClientRect().width).withContext(`${ancho}px / imagen ${escala}×`).toBeGreaterThanOrEqual(239);
        expect(host.querySelector('.prod-nombre')!.getBoundingClientRect().height).toBeLessThan(100);
        expect(contenedor.clientWidth).toBeLessThanOrEqual(ancho);
        if (ancho < 1000) {
          contenedor.scrollLeft = 150;
          expect(contenedor.scrollLeft).toBeGreaterThan(0);
        }
      }
    }
  });

  for (const [indice, texto] of [[0, '750'], [1, 'PARACETAMOL']] as const) {
    it(`muestra y permite elegir la búsqueda por ${indice === 0 ? 'código' : 'nombre'} sin eventos de teclado físico`, fakeAsync(() => {
      component.mostrarModalConsultaPrecio = true;
      fixture.detectChanges();
      tick();
      const input = fixture.nativeElement.querySelectorAll('.consulta-precio-buscadores input')[indice] as HTMLInputElement;
      input.focus();
      // Teclados virtuales pueden producir input/composición sin keydown/keyup.
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = texto;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto, inputType: 'insertCompositionText', isComposing: true }));
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: texto }));
      fixture.detectChanges();
      tick(100);
      fixture.detectChanges();

      const panel = document.querySelector<HTMLElement>('.ventas-consulta-opciones')!;
      expect(panel).not.toBeNull();
      expect(input.getAttribute('aria-expanded')).toBe('true');
      const opcion = panel.querySelector<HTMLElement>('mat-option')!;
      expect(opcion.textContent).toContain('Paracetamol 500 mg');
      const rect = opcion.getBoundingClientRect();
      expect(rect.width).toBeGreaterThan(100);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
      const encima = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      expect(encima === opcion || opcion.contains(encima)).toBeTrue();

      opcion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      tick();
      fixture.detectChanges();
      expect(productoService.consultarPrecioPorCodigo).toHaveBeenCalledOnceWith('farmacia-prueba', '7501234567890');
      expect(component.productoConsultado.precioNormal).toBe(25);
      expect(component.productoConsultado.ubicacionEnFarmacia).toBe('A-1');
    }));
  }

  it('mantiene el modal dentro de la pantalla y permite recorrer resultados largos', fakeAsync(() => {
    component.mostrarModalConsultaPrecio = true;
    component.consultaEncontrado = true;
    component.productoConsultado = { nombre: 'Producto '.repeat(120), precioNormal: 25, ubicacionEnFarmacia: 'A-1' };
    fixture.detectChanges();
    tick();
    const modal = fixture.nativeElement.querySelector('.consulta-precio-modal') as HTMLElement;
    const rect = modal.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
    if (modal.scrollHeight > modal.clientHeight) {
      modal.scrollTop = 100;
      expect(modal.scrollTop).toBeGreaterThan(0);
    }
  }));
});

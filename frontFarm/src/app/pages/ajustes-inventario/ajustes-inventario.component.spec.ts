import { FormBuilder } from '@angular/forms';
import { of, throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { AjustesInventarioComponent } from './ajustes-inventario.component';
import { ProductoService } from '../../services/producto.service';

describe('AjustesInventarioComponent cambios masivos', () => {
  let component: AjustesInventarioComponent;
  let service: jasmine.SpyObj<ProductoService>;
  let swal: jasmine.Spy;

  function producto(id: string, seleccionado = true): any {
    return {
      _id: id, seleccionado, categoria: 'IV', inventario: true, precio: 100,
      nombre: 'Producto', unidad: 'PZA', costo: 40, stockMinimo: 2, stockMaximo: 10,
      lotes: [{ lote: 'Conservar', cantidad: 5, fechaCaducidad: '2020-01-01' }],
      imagen: 'data:image/png;base64,' + 'a'.repeat(100000)
    };
  }

  beforeEach(() => {
    service = jasmine.createSpyObj<ProductoService>('ProductoService', ['actualizarProductos']);
    service.actualizarProductos.and.returnValue(of({ actualizados: 1 }));
    component = new AjustesInventarioComponent(
      new FormBuilder(), {} as any, {} as any, service, {} as any, {} as any,
      {} as any, { addIcons: () => {} } as any, {} as any
    );
    component.inicializarFormulario();
    component.productos = [producto('1'), producto('2', false), producto('fuera-del-filtro')];
    component.productosFiltrados = component.productos.slice(0, 2);
    spyOn(component, 'cargarProductos');
    swal = spyOn(Swal, 'fire').and.resolveTo({ isConfirmed: true } as any);
    spyOn(Swal, 'close');
    spyOn(console, 'error');
  });

  for (const inventario of [true, false]) {
    it(`acepta inventario=${inventario} como único cambio y envía sólo los seleccionados del filtro`, async () => {
      component.formularioMasivo.patchValue({ inventario });
      expect(component.cambiosMasivosValidos).toBeTrue();
      await component.aplicarCambiosMasivos();
      expect(service.actualizarProductos).toHaveBeenCalledOnceWith({ productos: [{ _id: '1', inventario }] });
      expect(component.formularioMasivo.get('inventario')?.value).toBeNull();
      expect(component.guardandoMasivo).toBeFalse();
      expect(component.cargarProductos).toHaveBeenCalledOnceWith(false);
    });
  }

  it('no habilita aplicar cuando inventario y los demás campos están sin cambios', () => {
    expect(component.formularioMasivo.get('inventario')?.value).toBeNull();
    expect(component.cambiosMasivosValidos).toBeFalse();
    component.formularioMasivo.patchValue({ inventario: false });
    component.limpiarCamposCambioMasivo();
    expect(component.cambiosMasivosValidos).toBeFalse();
  });

  it('cambia IV por M - IV en todas las páginas sin enviar lotes, imágenes ni inventario sin modificar', async () => {
    component.productos = Array.from({ length: 35 }, (_, i) => producto(String(i)));
    component.productosFiltrados = component.productos;
    component.formularioMasivo.patchValue({ categoria: 'M - IV' });
    await component.aplicarCambiosMasivos();

    expect(service.actualizarProductos).toHaveBeenCalledOnceWith({ productos:
      component.productos.map(p => ({ _id: p._id, categoria: 'M - IV' }))
    });
    const bytes = new TextEncoder().encode(JSON.stringify(service.actualizarProductos.calls.mostRecent().args[0])).length;
    expect(bytes).toBeLessThan(3000);
  });

  it('conserva combinaciones de campos, ceros, quitar laboratorio y ajuste de precio', async () => {
    component.formularioMasivo.patchValue({
      categoria: 'M - IV', inventario: false, laboratorio: '__SIN__', ubicacion: 'B-1',
      stockMinimo: 0, stockMaximo: 20, descuentoINAPAM: false,
      ajustePrecioModo: 'porcentaje', ajustePrecioPorcentaje: 10,
      promosPorDia: { promoLunes: { porcentaje: 15, inicio: '2030-01-01', fin: '2030-01-31', monedero: false } }
    });
    await component.aplicarCambiosMasivos();
    expect(service.actualizarProductos).toHaveBeenCalledOnceWith({ productos: [{
      _id: '1', categoria: 'M - IV', inventario: false, laboratorio: null, ubicacion: 'B-1',
      stockMinimo: 0, stockMaximo: 20, descuentoINAPAM: false, precio: 110,
      promoLunes: { porcentaje: 15, inicio: new Date('2030-01-01'), fin: new Date('2030-01-31'), monedero: false }
    }] });
  });

  it('cancelar conserva el formulario y los productos originales, sin enviar escrituras', async () => {
    swal.and.resolveTo({ isConfirmed: false } as any);
    const antes = JSON.stringify(component.productos);
    component.formularioMasivo.patchValue({ categoria: 'M - IV', inventario: false });
    await component.aplicarCambiosMasivos();
    expect(service.actualizarProductos).not.toHaveBeenCalled();
    expect(JSON.stringify(component.productos)).toBe(antes);
    expect(component.formularioMasivo.get('categoria')?.value).toBe('M - IV');
    expect(component.guardandoMasivo).toBeFalse();
  });

  it('reporta un guardado parcial y refresca los datos sin mostrar éxito', async () => {
    component.productosFiltrados = [producto('1'), producto('2')];
    service.actualizarProductos.and.returnValue(throwError(() => ({
      productosConfirmados: ['1'], error: { mensaje: 'Fallo de prueba' }
    })));
    component.formularioMasivo.patchValue({ inventario: false });
    await component.aplicarCambiosMasivos();
    const aviso = swal.calls.mostRecent().args[0];
    expect(aviso.icon).toBe('error');
    expect(aviso.title).toBe('Actualización incompleta');
    expect(aviso.text).toContain('1 de 2 productos');
    expect(component.cargarProductos).toHaveBeenCalledOnceWith(false);
    expect(component.guardandoMasivo).toBeFalse();
  });

  it('impide envíos duplicados mientras se confirma o guarda', async () => {
    component.formularioMasivo.patchValue({ inventario: false });
    await Promise.all([component.aplicarCambiosMasivos(), component.aplicarCambiosMasivos()]);
    expect(service.actualizarProductos).toHaveBeenCalledTimes(1);
  });
});

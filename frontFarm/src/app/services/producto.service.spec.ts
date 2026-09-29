import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { CambioProductoMasivo, ProductoService } from './producto.service';

describe('ProductoService actualización masiva', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: ProductoService;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['put']);
    service = new ProductoService(http);
  });

  it('envía todos los productos una vez y limita cada solicitud por bytes UTF-8 y cantidad', async () => {
    const productos = Array.from({ length: 2500 }, (_, i) => ({
      _id: String(i).padStart(24, '0'), categoria: 'M - IV', ubicacion: 'Á💊'.repeat(100), inventario: false
    }));
    const solicitudes: CambioProductoMasivo[][] = [];
    expect(new TextEncoder().encode(JSON.stringify({ productos })).length).toBeGreaterThan(1024 * 1024);
    http.put.and.callFake((_url: any, body: any) => {
      expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(64 * 1024);
      expect(body.productos.length).toBeLessThanOrEqual(200);
      solicitudes.push(body.productos);
      return of({} as any);
    });

    const respuesta = await firstValueFrom(service.actualizarProductos({ productos }));

    expect(solicitudes.flat()).toEqual(productos);
    expect(respuesta.actualizados).toBe(productos.length);
    expect(http.put.calls.count()).toBeGreaterThan(1);
  });

  it('espera la respuesta de cada solicitud antes de enviar la siguiente', async () => {
    const productos = Array.from({ length: 201 }, (_, i) => ({ _id: String(i), categoria: 'M - IV' }));
    const primera = new Subject<any>();
    http.put.and.returnValues(primera, of({}));
    const resultado = firstValueFrom(service.actualizarProductos({ productos }));
    expect(http.put).toHaveBeenCalledTimes(1);

    primera.next({});
    await resultado;
    expect(http.put).toHaveBeenCalledTimes(2);
  });

  it('detiene el envío al fallar y reporta los productos confirmados sin reintentar', async () => {
    const productos = Array.from({ length: 450 }, (_, i) => ({ _id: String(i), inventario: false }));
    http.put.and.returnValues(of({}), throwError(() => new HttpErrorResponse({
      status: 500, error: { mensaje: 'Fallo de prueba' }
    })));

    const error = await firstValueFrom(service.actualizarProductos({ productos })).catch(err => err);

    expect(http.put).toHaveBeenCalledTimes(2);
    expect(error.productosConfirmados).toEqual(productos.slice(0, 200).map(p => p._id));
    expect(error.status).toBe(500);
    expect(error.error.mensaje).toBe('Fallo de prueba');
  });

  it('detecta un producto demasiado grande antes de realizar cualquier escritura', async () => {
    http.put.and.returnValue(of({}));
    await expectAsync(firstValueFrom(service.actualizarProductos({ productos: [
      { _id: '1', categoria: 'M - IV' },
      { _id: '2', ubicacion: 'á'.repeat(64 * 1024) }
    ] }))).toBeRejectedWithError(/exceden el tamaño/);
    expect(http.put).not.toHaveBeenCalled();
  });
});

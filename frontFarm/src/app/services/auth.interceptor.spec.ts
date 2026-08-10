import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { authInterceptor, isSafeMethod } from './auth.interceptor';

describe('authInterceptor retry policy', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'getToken',
      'checkSessionBeforeRequest',
      'isAuthenticated',
      'handleUnauthorized'
    ]);
    authService.checkSessionBeforeRequest.and.returnValue(true);
    authService.isAuthenticated.and.returnValue(true);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authService }]
    });
  });

  it('permite reintentar automaticamente solo metodos de lectura seguros', () => {
    expect(isSafeMethod('GET')).toBeTrue();
    expect(isSafeMethod('head')).toBeTrue();
    expect(isSafeMethod('OPTIONS')).toBeTrue();
  });

  it('no permite reintentar operaciones que pueden modificar inventario', () => {
    expect(isSafeMethod('POST')).toBeFalse();
    expect(isSafeMethod('PUT')).toBeFalse();
    expect(isSafeMethod('PATCH')).toBeFalse();
    expect(isSafeMethod('DELETE')).toBeFalse();
  });

  it('no reintenta una respuesta 500', () => {
    authService.getToken.and.returnValue('token-vigente');
    const error500 = new HttpErrorResponse({
      status: 500,
      error: { mensaje: 'Error interno' }
    });
    const next = jasmine.createSpy('next').and.returnValue(
      throwError(() => error500)
    );
    let errorRecibido: unknown;

    TestBed.runInInjectionContext(() =>
      authInterceptor(new HttpRequest('PUT', '/api/surtirFarmacias', {}), next)
    ).subscribe({ error: (error) => errorRecibido = error });

    expect(next).toHaveBeenCalledTimes(1);
    expect(errorRecibido).toBe(error500);
    expect(authService.handleUnauthorized).not.toHaveBeenCalled();
  });

  it('no reenvia un PUT si otro flujo roto el token mientras estaba en curso', () => {
    authService.getToken.and.returnValues('token-anterior', 'token-nuevo');
    const error401 = new HttpErrorResponse({
      status: 401,
      error: { codigo: 'TOKEN_INVALID', mensaje: 'Token no valido.' }
    });
    const next = jasmine.createSpy('next').and.returnValue(
      throwError(() => error401)
    );
    let errorRecibido: unknown;

    TestBed.runInInjectionContext(() =>
      authInterceptor(new HttpRequest('PUT', '/api/surtirFarmacias', {}), next)
    ).subscribe({ error: (error) => errorRecibido = error });

    expect(next).toHaveBeenCalledTimes(1);
    expect(errorRecibido).toBe(error401);
    expect(authService.handleUnauthorized).not.toHaveBeenCalled();
  });

  it('conserva el reintento unico para una lectura GET con token renovado', () => {
    authService.getToken.and.returnValues('token-anterior', 'token-nuevo');
    const error401 = new HttpErrorResponse({
      status: 401,
      error: { codigo: 'TOKEN_INVALID', mensaje: 'Token no valido.' }
    });
    const next = jasmine.createSpy('next').and.callFake((request: HttpRequest<unknown>) => {
      if (next.calls.count() === 1) return throwError(() => error401);
      return of(new HttpResponse({ status: 200, body: request.headers.get('x-auth-token') }));
    });
    let tokenRespuesta: unknown;

    TestBed.runInInjectionContext(() =>
      authInterceptor(new HttpRequest('GET', '/api/productos'), next)
    ).subscribe((response) => tokenRespuesta = (response as HttpResponse<unknown>).body);

    expect(next).toHaveBeenCalledTimes(2);
    expect(tokenRespuesta).toBe('token-nuevo');
    expect(authService.handleUnauthorized).not.toHaveBeenCalled();
  });
});

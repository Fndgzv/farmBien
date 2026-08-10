import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { EMPTY, catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const tokenAtRequest = authService.getToken();

  if (tokenAtRequest && !authService.checkSessionBeforeRequest()) {
    return EMPTY;
  }

  const authenticatedRequest = tokenAtRequest
    ? request.clone({ setHeaders: { 'x-auth-token': tokenAtRequest } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !tokenAtRequest) {
        return throwError(() => error);
      }

      const invalidSession =
        (error.status === 401 && isAuthenticationFailure(error)) ||
        (error.status === 403 && isDisabledAccountFailure(error));
      if (!invalidSession) {
        return throwError(() => error);
      }

      const isAuthenticationFlow = /\/auth\/(login|renew|logout)(?:\?|$)/.test(request.url);
      if (isAuthenticationFlow) {
        return throwError(() => error);
      }

      const currentToken = authService.getToken();
      if (
        error.status === 401 &&
        currentToken &&
        currentToken !== tokenAtRequest &&
        authService.isAuthenticated()
      ) {
        // Mutations must not be resent automatically. The first request may have
        // reached the server, so retrying it could apply the operation twice.
        if (!isSafeMethod(request.method)) {
          return throwError(() => error);
        }

        const retryRequest = request.clone({
          setHeaders: { 'x-auth-token': currentToken },
        });

        return next(retryRequest).pipe(
          catchError((retryError: unknown) => {
            if (
              retryError instanceof HttpErrorResponse &&
              ((retryError.status === 401 && isAuthenticationFailure(retryError)) ||
                (retryError.status === 403 && isDisabledAccountFailure(retryError)))
            ) {
              authService.handleUnauthorized();
              return EMPTY;
            }
            return throwError(() => retryError);
          })
        );
      }

      authService.handleUnauthorized();
      return EMPTY;
    })
  );
};

export function isSafeMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function isAuthenticationFailure(error: HttpErrorResponse): boolean {
  const code = String(error.error?.codigo || error.error?.code || '').toUpperCase();
  if (code.startsWith('SESSION_') || code.startsWith('TOKEN_')) return true;

  const message = String(error.error?.mensaje || error.error?.message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return /token no valido|no hay token|sesion (?:no valida|invalida|expir)|usuario no valido/.test(message);
}

function isDisabledAccountFailure(error: HttpErrorResponse): boolean {
  const code = String(error.error?.codigo || error.error?.code || '').toUpperCase();
  if (code === 'USER_DISABLED' || code === 'DISABLED_USER') return true;

  const message = String(error.error?.mensaje || error.error?.message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /usuario desactivado|cuenta (?:esta )?desactivada/.test(message);
}

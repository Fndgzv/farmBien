import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';

import { AuthService } from '../../app/services/auth.service';
import { TurnoCajaService } from '../../app/services/turno-caja.service';

export const authGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  const userData = authService.getUserData();
  const rolUsuario = userData?.rol;
  const rolesPermitidos = route.data?.['rolesPermitidos'];

  if (!rolUsuario) {
    console.warn('Usuario invalido o sin rol:', userData);
    router.navigate(['/login']);
    return false;
  }

  if (!rolesPermitidos || rolesPermitidos.includes(rolUsuario)) {
    return true;
  }

  router.navigate(['/home']);
  return false;
};

export const turnosOnlyGuard: CanActivateChildFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  const rolUsuario = authService.getUserData()?.rol;
  const url = state?.url || '';

  if (rolUsuario === 'turnos' && !url.startsWith('/pantalla-turnos')) {
    router.navigate(['/pantalla-turnos']);
    return false;
  }

  return true;
};

const rutasExcluidasTurno = new Set([
  '/login',
  '/logout',
  '/recuperar-password',
  '/olvide-password',
  '/inicio-turno'
]);

export const turnoCajaGuard: CanActivateChildFn = (_route, state): Observable<boolean | UrlTree> | boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const turnoCajaService = inject(TurnoCajaService);

  if (!authService.isAuthenticated()) {
    return true;
  }

  const rolUsuario = authService.getUserData()?.rol ?? null;
  if (!turnoCajaService.requiereTurno(rolUsuario)) {
    return true;
  }

  const url = normalizarRuta(state?.url || '');
  const esInicioTurno = url === '/inicio-turno' || url.startsWith('/inicio-turno/');
  const estaExcluida = [...rutasExcluidasTurno].some(ruta => url === ruta || url.startsWith(`${ruta}/`));

  return turnoCajaService.verificarTurnoActivo().pipe(
    map(turnoActivo => {
      if (!turnoActivo && !estaExcluida) {
        return router.createUrlTree(['/inicio-turno']);
      }

      if (turnoActivo && esInicioTurno) {
        return router.createUrlTree(['/home']);
      }

      return true;
    })
  );
};

function normalizarRuta(url: string): string {
  const sinHash = url.split('#')[0];
  return sinHash.split('?')[0] || '/';
}


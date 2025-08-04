import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../../app/services/auth.service';

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

// Validación de rol no nulo
if (!rolUsuario) {
  console.warn('⚠️ Usuario inválido o sin rol:', userData);
  router.navigate(['/login']);
  return false;
}

  // Validación de roles
  if (!rolesPermitidos || rolesPermitidos.includes(rolUsuario)) {
    
    // ✅ Corte activo solo aplica a empleados
    if (rolUsuario === 'empleado') {
      const rutaProtegidaConTurno = ['ventas', 'pedidos', 'devoluciones'];
      const corteActivo = localStorage.getItem('corte_activo');
      // Detecta si es una de las rutas que requieren turno y no hay corte
      if (rutaProtegidaConTurno.includes(route.routeConfig?.path || '') && !corteActivo) {
        router.navigate(['/inicio-turno']);
        return false;
      }
    }
    return true;
  }
  
  // Si el rol no está permitido
  router.navigate(['/home']);
  return false;
};

import { Routes } from '@angular/router';
import { authGuard } from '../environments/guards/auth.guard';

import { HomeComponent } from './pages/home/home.component'
import { LoginComponent } from './pages/login/login.component';
import { VentasComponent } from './pages/ventas/ventas.component';
import { PedidosComponent } from './pages/pedidos/pedidos.component';
import { DevolucionesComponent } from './pages/devoluciones/devoluciones.component';
import { InicioTurnoComponent } from './pages/inicio-turno/inicio-turno.component';
import { SurtirFarmaciaComponent } from './pages/surtir-farmacia/surtir-farmacia.component';
import { ComprasComponent } from './pages/compras/compras.component';
import { AjustesInventarioComponent } from './pages/ajustes-inventario/ajustes-inventario.component';
import { MainLayoutComponent } from './layouts/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', component: HomeComponent },
      {
        path: 'ventas',
        component: VentasComponent,
        canActivate: [authGuard],
        data: { rolesPermitidos: ['admin', 'empleado'] }
      },
      {
        path: 'pedidos',
        component: PedidosComponent,
        canActivate: [authGuard],
        data: { rolesPermitidos: ['admin', 'empleado'] }
      },
      {
        path: 'devoluciones',
        component: DevolucionesComponent,
        canActivate: [authGuard],
        data: { rolesPermitidos: ['admin', 'empleado'] }
      },
      {
        path: 'inicio-turno', component: InicioTurnoComponent,
        canActivate: [authGuard],
        data: {
          rolesPermitidos: ['admin', 'empleado']
        }
      },
      {
        path: 'surtir-farmacia', component: SurtirFarmaciaComponent,
        canActivate: [authGuard],
        data: {
          rolesPermitidos: ['admin']
        }
      },
      {
        path: 'compras', component: ComprasComponent,
        canActivate: [authGuard],
        data: {
          rolesPermitidos: ['admin']
        }
      },
      {
        path: 'ajustes-inventario', component: AjustesInventarioComponent,
        canActivate: [authGuard],
        data: {
          rolesPermitidos: ['admin']
        }
      },
      {
        path: 'farmacias',
        loadComponent: () =>
          import('./admin/farmacias/mantenimiento/farmacias.component').then(m => m.FarmaciasComponent),
        data: {
          rolesPermitidos: ['admin']
        },
        canActivate: [authGuard]
      },
      {
        path: 'inventario-farmacias',
        loadComponent: () =>
          import('./admin/farmacias/ajustes-inventario-farmacia/ajustes-inventario-farmacia.component').then(m => m.AjustesInventarioFarmaciaComponent),
        data: { rolesPermitidos: ['admin'] },
        canActivate: [authGuard]
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./admin/usuarios/usuarios.component').then(n => n.UsuariosComponent),
        data: {
          rolesPermitidos: ['admin']
        },
        canActivate: [authGuard]
      },
      {
        path: 'proveedores',
        loadComponent: () =>
          import('./admin/proveedores/proveedores.component').then(m => m.ProveedoresComponent),
        data: { rolesPermitidos: ['admin'] },
        canActivate: [authGuard]
      },
      {
        path: 'cortes-de-caja',
        loadComponent: () =>
          import('./admin/cortes-de-caja/cortes-de-caja.component').then(m => m.CortesDeCajaComponent),
        data: { rolesPermitidos: ['admin'] },
        canActivate: [authGuard]
      },
      // ... otras rutas protegidas
    ]
  },
  { path: 'login', component: LoginComponent } // fuera del layout
];


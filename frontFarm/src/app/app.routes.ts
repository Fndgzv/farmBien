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
import { ReporteVentasPorFarmaciaComponent } from './pages/reporte-ventas-por-farmacia/reporte-ventas-por-farmacia.component';
import { ReporteVentasProductoComponent } from './pages/reporte-ventas-producto/reporte-ventas-producto.component';
import { ReportePedidosComponent } from './pages/reporte-pedidos/reporte-pedidos.component';
import { ReporteVentasComponent } from './pages/reporte-ventas/reporte-ventas.component';
import { ReporteResumenUtilidadesComponent } from './pages/reporte-resumen-utilidades/reporte-resumen-utilidades.component';
import { ReportesUtilidadComponent } from './pages/reportes-utilidad/reportes-utilidad.component';
import { ReporteComprasComponent } from './pages/reporte-compras/reporte-compras.component';
import { devolucionesCatalogosResolver } from './reportes-devoluciones/devoluciones-catalogos.resolver';
import { HistorialProductoPageComponent } from './reportes-compras/historial-producto-page.component';
import { ReporteComprasVentasComponent } from './pages/reporte-compras-ventas/reporte-compras-ventas.component';
import { LabelDesignerComponent } from './pages/etiquetas/label-designer/label-designer.component';
import { EtiquetasPrintComponent } from './pages/etiquetas/etiquetas-print/etiquetas-print.component';
import { ReportePresupuestoComponent } from './pages/reporte-presupuesto/reporte-presupuesto.component';
import { SeleccionarFarmaciaComponent } from './inventario-portatil/seleccionar-farmacia/seleccionar-farmacia.component';
import { InventarioPortatilComponent } from './inventario-portatil/inventario-portatil.component';
import { BuscarProductoComponent } from './inventario-portatil/buscar-producto/buscar-producto.component';
import { AjustarExistenciaComponent } from './inventario-portatil/ajustar-existencia/ajustar-existencia.component';

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
        path: 'clientes',
        loadComponent: () =>
          import('./admin/clientes/clientes.component').then(n => n.ClientesComponent),
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
      { path: 'reporte/ventas-por-farmacia', component: ReporteVentasPorFarmaciaComponent },
      { path: 'reporte/ventas-producto', component: ReporteVentasProductoComponent },
      { path: 'reporte/ventas', component: ReporteVentasComponent },
      { path: 'reporte/pedidos', component: ReportePedidosComponent },
      { path: 'reporte/resumen-utilidades', component: ReporteResumenUtilidadesComponent },
      { path: 'reporte/utilidades', component: ReportesUtilidadComponent },
      { path: 'reporte/compras', component: ReporteComprasComponent },
      { path: 'reporte-presupuesto', component: ReportePresupuestoComponent },
      {
        path: 'reportes/devoluciones',
        loadComponent: () => import('./reportes-devoluciones/devoluciones-page.component')
          .then(m => m.DevolucionesPageComponent),
        resolve: { cat: devolucionesCatalogosResolver }
      },
      {
        path: 'reportes-compras',
        loadComponent: () => import('./reportes-compras/compras-page.component')
          .then(m => m.ComprasPageComponent)
      },
      {
        path: 'reportes/compras-historial-producto',
        component: HistorialProductoPageComponent
      },
      {
        path: 'reportes/cancelaciones',
        loadComponent: () => import('./reportes-cancelaciones/cancelaciones-page.component')
          .then(m => m.CancelacionesPageComponent)
      },
      {
        path: 'reportes/compras-ventas',
        component: ReporteComprasVentasComponent
      },
      {
        path: 'etiquetas/print',
        component: EtiquetasPrintComponent
      }
      ,
      {
        path: 'etiquetas/design',
        component: LabelDesignerComponent
      },

      {
        path: 'inventario-portatil',
        component: InventarioPortatilComponent,
        children: [
          { path: '', redirectTo: 'seleccionar', pathMatch: 'full' },
          { path: 'seleccionar', component: SeleccionarFarmaciaComponent },
          { path: 'buscar/:farmaciaId', component: BuscarProductoComponent },
          { path: 'ajustar/:farmaciaId/:productoId', component: AjustarExistenciaComponent }
        ]
      }
    ]
  },
  { path: 'login', component: LoginComponent } // fuera del layout
];


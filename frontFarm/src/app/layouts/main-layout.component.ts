import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Observable } from 'rxjs';

import { HeaderComponent } from '../components/header/header.component';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { LoginComponent } from '../pages/login/login.component';
import { AuthService } from '../services/auth.service';
import { TurnoCajaService } from '../services/turno-caja.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    HeaderComponent,
    SidebarComponent,
    LoginComponent
  ],
  template: `
<div class="layout-container">
  <app-sidebar
    *ngIf="usuario && !esTurnos && !bloqueadoPorTurno"
    [open]="isSidebarOpen">
  </app-sidebar>

  <div class="content-area">
    <app-header
      [isSidebarOpen]="isSidebarOpen"
      [bloqueadoPorTurno]="bloqueadoPorTurno"
      (toggleSidebar)="onToggleSidebar()">
    </app-header>

    <app-login *ngIf="isLoginVisible | async"></app-login>

    <main class="main-content" [class.turno-bloqueado]="bloqueadoPorTurno">
      <router-outlet></router-outlet>
    </main>
  </div>
</div>`,
  styles: [`
    .layout-container {
      display: flex;
      min-height: 100vh;
    }

    .content-area {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
    }

    .main-content {
      flex-grow: 1;
      padding: 1rem;
    }

    .main-content.turno-bloqueado {
      padding: 0;
    }
  `]
})
export class MainLayoutComponent {
  usuario: any = null;
  isLoginVisible!: Observable<boolean>;
  isSidebarOpen = false;
  esTurnos = false;
  turnoActivo = false;
  bloqueadoPorTurno = false;

  constructor(
    private authService: AuthService,
    private turnoCajaService: TurnoCajaService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.authService.notifyUserChange();
    this.turnoCajaService.sincronizarTurnoDesdeStorage();

    this.authService.usuario$.subscribe(usuario => {
      this.usuario = usuario;
      this.esTurnos = usuario?.rol === 'turnos';
      this.actualizarBloqueoTurno();
    });

    this.turnoCajaService.turnoActivo$.subscribe(turnoActivo => {
      this.turnoActivo = turnoActivo;
      this.actualizarBloqueoTurno();
    });

    this.isLoginVisible = this.authService.isLoginVisible.asObservable();

    this.router.events
      .pipe(filter(evento => evento instanceof NavigationEnd))
      .subscribe(() => {
        this.isSidebarOpen = false;
        this.actualizarBloqueoTurno();
      });
  }

  onToggleSidebar() {
    if (this.bloqueadoPorTurno) {
      this.isSidebarOpen = false;
      return;
    }

    this.isSidebarOpen = !this.isSidebarOpen;
  }

  private actualizarBloqueoTurno(): void {
    const rol = this.usuario?.rol ?? null;
    const requiereTurno = this.turnoCajaService.requiereTurno(rol);
    this.bloqueadoPorTurno = requiereTurno && !this.turnoActivo;

    if (this.bloqueadoPorTurno) {
      this.isSidebarOpen = false;
    }
  }
}


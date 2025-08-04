import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';

import { HeaderComponent } from '../components/header/header.component';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { LoginComponent } from '../pages/login/login.component';

import { AuthService } from '../services/auth.service';
import { filter, Observable } from 'rxjs';

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

<app-sidebar *ngIf="usuario" [open]="isSidebarOpen"></app-sidebar>

  <div class="content-area">
    <app-header
        [isSidebarOpen]="isSidebarOpen"
        (toggleSidebar)="onToggleSidebar()">
    </app-header>
    <app-login *ngIf="isLoginVisible | async"></app-login>
    <main class="main-content">
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

  `]
})

export class MainLayoutComponent {
  usuario: any = null;
  isLoginVisible!: Observable<boolean>;
  isSidebarOpen = false;

  constructor(
    private authService: AuthService,
    private router: Router) { }

  ngOnInit(): void {
    this.authService.notifyUserChange();

    this.authService.usuario$.subscribe(u => {
      this.usuario = u;
    });
    this.isLoginVisible = this.authService.isLoginVisible.asObservable();

    // **Al terminar cualquier navegación, cerramos el sidebar en el padre
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        this.isSidebarOpen = false;
      });
  }

  onToggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

}

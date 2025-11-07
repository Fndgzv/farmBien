import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { NgIf, } from '@angular/common';

import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  imports: [NgIf, RouterModule, MatIconModule, FormsModule, MatIconModule, MatTooltipModule]
})
export class HeaderComponent implements OnInit {

  @Input() isSidebarOpen: boolean = false;
  @Output() toggleSidebar = new EventEmitter<void>();


  usuario: any = null;
  userNombre: string | null = null;
  userRol: string | null = null;

  farmaciaId: string | null = null;
  farmaciaNombre: string = '';
  farmaciaImagen: string = 'assets/images/farmBienIcon.png';
  farmaciaTiulo1: string = 'Farmacias del Bienestar';
  farmaciaTiulo2: string = 'para todos';


  isEditProfileVisible = false;

  menuOpen = false;

  searchQuery: string = '';

  mostrarInicio = false;

  @Output() userLoggedOut = new EventEmitter<void>();

  constructor(public authService: AuthService, public router: Router) {
    this.authService.userNombre$.subscribe(nombre => {
      this.userNombre = nombre;
    });

    this.authService.userRol$.subscribe(rol => {
      this.userRol = rol;
    });

    this.authService.isEditProfileVisible.subscribe(visible => {
      this.isEditProfileVisible = visible;
      if (visible) {
        this.menuOpen = false; // 🔹 Cierra el menú inmediatamente si edit-profile está abierto
      }
    });

  }

  ngOnInit(): void {
    this.authService.usuario$.subscribe(user => {
      this.usuario = user;
      this.userNombre = user?.nombre || null;
      this.userRol = user?.rol || null;
    });

    this.authService.farmacia$.subscribe(farmacia => {
      if (farmacia) {
        this.farmaciaId = farmacia._id;
        this.farmaciaNombre = farmacia.nombre;
        this.farmaciaImagen = farmacia.imagen;
        this.farmaciaTiulo1 = farmacia.titulo1;
        this.farmaciaTiulo2 = farmacia.titulo2;
      } else {
        this.farmaciaId = null;
        this.farmaciaNombre = '';
        this.farmaciaImagen = 'assets/images/farmBienIcon.png';
        this.farmaciaTiulo1 = 'Farmacias del Bienestar';
        this.farmaciaTiulo2 = 'para todos';
      }
    });

    this.actualizarVisibilidadInicio();

    // Re-evaluar visibilidad cada vez que cambie la ruta
    this.router.events.subscribe(() => {
      this.actualizarVisibilidadInicio();
    });
  }

  actualizarVisibilidadInicio() {
    const rutaActual = this.router.url;

    // Ocultar si estamos en '/home'
    if (rutaActual === '/home') {
      this.mostrarInicio = false;
      return;
    }

    // Ocultar si hay ventas pausadas
    /* if (this.ventaService.existenVentasPausadas()) {
      this.mostrarInicio = false;
      return;
    } */

    // Mostrar si está autenticado y no hay restricciones
    this.mostrarInicio = this.authService.isLoggedIn;
  }


  irAInicio() {
    this.router.navigate(['/home']);
  }


  toggleMenu() {
    if (!this.isEditProfileVisible) {
      this.menuOpen = !this.menuOpen;
    }
  }


  logout() {
    this.authService.logout();
    this.userLoggedOut.emit();
  }


  openChangePassword() {
    this.menuOpen = false;
    this.authService.showChangePassword();
  }


  openUpdateProfile() {
    this.menuOpen = false;
    this.authService.showEditProfile();
  }

  clearSearch() {
    this.searchQuery = '';
  }

}

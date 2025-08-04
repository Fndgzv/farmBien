import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import {
  faUser, faHospital, faUserDoctor, faCapsules, faUsers,
  faTruck, faShoppingCart, faCashRegister, faUndo, faPrescription,
  faFileSignature, faStethoscope, faClipboardList, faWarehouse
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../services/auth.service';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  imports: [CommonModule, FontAwesomeModule, RouterModule]
})
export class SidebarComponent implements OnInit {

  @Input() open: boolean = false;

  @Output() openChange = new EventEmitter<boolean>();

  usuario: any = null;
  userRol: string | null = null;
  isSidebarOpen: boolean = false;

  expandedMenu: string | null = null;
  expandedSubMenu: string | null = null;

  constructor(
    private authService: AuthService,
    private library: FaIconLibrary,
    private router: Router
  ) {

    // Registra íconos
    this.library.addIcons(
      faUser, faHospital, faUserDoctor, faCapsules,
      faUsers, faTruck, faShoppingCart, faCashRegister,
      faUndo, faFileSignature, faStethoscope, faPrescription,
      faClipboardList, faWarehouse
    );

  }

  ngOnInit(): void {
    this.authService.usuario$.subscribe(user => {
      this.usuario = user;
      if (user && user.rol) {
        this.userRol = user.rol;
      }
    });

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.close());

  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  // Abre/cierra desde el botón de la UI
  toggleSidebar() {
    this.open = !this.open;
    this.openChange.emit(this.open);
  }

  toggleMenu(menu: string): void {
    if (this.expandedMenu === menu) {
      this.expandedMenu = null;
      this.expandedSubMenu = null;
    } else {
      this.expandedMenu = menu;
      this.expandedSubMenu = null;
    }
  }

  toggleSubMenu(submenu: string): void {
    this.expandedSubMenu = (this.expandedSubMenu === submenu) ? null : submenu;
  }

  close() {
    if (this.open) {
      this.open = false;
      this.openChange.emit(this.open);
    }
  }

  get isLoggedIn(): boolean {
    return !!this.usuario;
  }

  get currentRol(): string | null {
    return this.usuario?.rol || null;
  }
}

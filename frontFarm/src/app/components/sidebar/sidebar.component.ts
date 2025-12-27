import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import {
  faScaleBalanced, faSackDollar, faUser, faHospital, faUserDoctor, faCapsules, faUsers, faReceipt,
  faTruck, faShoppingCart, faCashRegister, faUndo, faPrescription,
  faFileSignature, faStethoscope, faClipboardList, faWarehouse, faChartLine, faDiagramProject,
  faTags, faPrint, faPenRuler, faRankingStar
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

  farmaciaId: string | null = null;
  farmaciaNombre: string = '';
  farmaciaImagen: string = 'assets/images/farmBienLogo.png';
  farmaciaTiulo1: string = 'Farmacias del Bienestar';
  farmaciaTiulo2: string = 'para todos';

  expandedMenu: string | null = null;
  expandedSubMenu: string | null = null;

  public icons = {
    reporteVentas: faChartLine,
    faReceipt: faReceipt, // o faProjectDiagram en FA v5
  };

  faTags = faTags;           // sección
  faPrint = faPrint;         // impresión
  faPenRuler = faPenRuler;   // diseño

  constructor(
    private authService: AuthService,
    private library: FaIconLibrary,
    private router: Router
  ) {

    // Registra íconos
    this.library.addIcons(
      faScaleBalanced, faSackDollar, faUser, faHospital,
      faUserDoctor, faCapsules,
      faUsers, faTruck, faShoppingCart, faCashRegister,
      faUndo, faFileSignature, faStethoscope, faPrescription,
      faClipboardList, faWarehouse, faChartLine, faDiagramProject,
      faRankingStar
    );

  }

  ngOnInit(): void {
    this.authService.usuario$.subscribe(user => {
      this.usuario = user;
      if (user && user.rol) {
        this.userRol = user.rol;
      }
    });

    this.authService.farmacia$.subscribe(farmacia => {
      if (farmacia) {
        this.farmaciaId = farmacia._id;
        this.farmaciaNombre = farmacia.nombre;
        this.farmaciaImagen = farmacia.imagen2;
        this.farmaciaTiulo1 = farmacia.titulo1;
        this.farmaciaTiulo2 = farmacia.titulo2;
      } else {
        this.farmaciaId = null;
        this.farmaciaNombre = '';
        this.farmaciaImagen = 'assets/images/farmBienLogo.png';
        this.farmaciaTiulo1 = 'Farmacias del Bienestar';
        this.farmaciaTiulo2 = 'para todos';
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

import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faUser, faHospital, faUserDoctor, faCapsules, faUsers, faTruck, faShoppingCart, faReceipt, faChartBar } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../services/auth.service';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  imports: [CommonModule, FontAwesomeModule, RouterModule]
})
export class SidebarComponent implements OnInit{
  usuario: any;

  @Output() sidebarToggled = new EventEmitter<boolean>();
  
  isOpen = signal(false);
  userRol: string | null = null;

  expandedMenu = signal<string | null>(null);

  constructor(private authService: AuthService, private library: FaIconLibrary, private router: Router) {
     this.authService.userRol$.subscribe(rol => {
      this.userRol = rol;
    });
    this.library.addIcons(faUser, faHospital, faUserDoctor, faCapsules, faUsers, faTruck, faShoppingCart, faReceipt, faChartBar);
    // 👇 Cierra el sidebar cuando cambie la ruta
    this.router.events.subscribe(() => {
      this.closeSidebar();
    });
  }

  ngOnInit(): void {
    this.authService.usuario$.subscribe(user => {
      this.usuario = user;
    });
  }

  closeSidebar() {
    this.isOpen.set(false);
  }
  
  toggleSidebar() {
    this.isOpen.set(!this.isOpen());
    this.sidebarToggled.emit(this.isOpen());
  }

  toggleMenu(menu: 'catalogs' | 'movements' | 'reports') {
      this.expandedMenu.set(this.expandedMenu() === menu ? null : menu);
  }

  get isLoggedIn(): boolean {
    return !!this.usuario;
  }
  
}



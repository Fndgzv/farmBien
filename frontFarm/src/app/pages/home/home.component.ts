import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../services/auth.service';

import { CarouselComponent } from '../carousel/carousel.component';

@Component({
  selector: 'app-home',
  standalone: true,

  /*   template: `
      <app-carousel></app-carousel>
      <app-catalogo></catalogo>
    `, */
  template: `
    <app-carousel></app-carousel>
  `,
  imports: [
    CommonModule,
    CarouselComponent,
    /* CatalogoComponent */
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})

export class HomeComponent implements OnInit {

  farmaciaId: string | null = null;
  farmaciaNombre: string = '';
  farmaciaImagen: string = 'assets/images/farmBienIcon.png';
  farmaciaImagen2: string = 'assets/images/farmBienLogo.png';
  farmaciaTiulo1: string = 'Farmacias del Bienestar';
  farmaciaTiulo2: string = 'para todos';

  constructor(public authService: AuthService, private cdRef: ChangeDetectorRef) { }

  ngOnInit() {
    this.authService.isEditProfileVisible.subscribe(() => {
      this.cdRef.detectChanges();
    });

    this.authService.farmacia$.subscribe(farmacia => {
      if (farmacia) {
        this.farmaciaId = farmacia._id;
        this.farmaciaNombre = farmacia.nombre;
        this.farmaciaImagen = farmacia.imagen1;
        this.farmaciaImagen2 = farmacia.imagen2;
        this.farmaciaTiulo1 = farmacia.titulo1;
        this.farmaciaTiulo2 = farmacia.titulo2;
      } else {
        this.farmaciaId = null;
        this.farmaciaNombre = '';
        this.farmaciaImagen = 'assets/images/farmBienIcon.png';
        this.farmaciaImagen2 = 'assets/images/farmBienLogo.png';
        this.farmaciaTiulo1 = 'Farmacias del Bienestar';
        this.farmaciaTiulo2 = 'para todos';
      }
    });

  }

  // Método para verificar si el login está visible
  isLoginVisible(): boolean {
    return this.authService.isLoginVisible.value;
  }


}

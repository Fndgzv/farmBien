import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../services/auth.service';

import { CarouselComponent } from '../carousel/carousel.component';
import { CatalogoComponent } from '../catalogo/catalogo.component';

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

export class HomeComponent implements OnInit{

  constructor(public authService: AuthService, private cdRef: ChangeDetectorRef) {}

  ngOnInit() {
    this.authService.isEditProfileVisible.subscribe(() => {
        this.cdRef.detectChanges();
    });
}

  // Método para verificar si el login está visible
  isLoginVisible(): boolean {
    return this.authService.isLoginVisible.value;
  }
  

}

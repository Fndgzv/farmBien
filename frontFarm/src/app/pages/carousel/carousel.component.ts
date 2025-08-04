import { AfterViewInit, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-carousel',
  standalone: true,
  templateUrl: './carousel.component.html',
  styleUrls: ['./carousel.component.css'],
  imports: [CommonModule]
})
export class CarouselComponent implements AfterViewInit {
  carouselItems = [
    { 
      image: "./assets/images/PromoLunes.jfif", 
      title: "LUNES !! de Bienestar", 
      description: "Aprovecha nuestros descuentos en medicamentos seleccionados."
    },
    { 
      image: "./assets/images/ofer4x3.png", 
      title: "Paga 3 y llévate 4", 
      description: "Ahorra aún más con nuestras grandes ofertas, consulta productos participantes"
    },
    { 
      image: "./assets/images/bebes.jfif", 
      title: "Cuida a tu Bebé", 
      description: "Encuentra productos esenciales para el cuidado de tu bebé."
    },
    { 
      image: "./assets/images/prodBelleza.jfif", 
      title: "Productos de Belleza", 
      description: "Descubre nuestra línea de productos de belleza y bienestar."
    },
    { 
      image: "./assets/images/saludSex.jfif", 
      title: "Salud Sexual y Bienestar", 
      description: "Todo lo que necesitas para tu salud y bienestar íntimo."
    }
  ];

  activeSlideIndex = 0; // 🔹 Almacena el índice del slide activo

  ngAfterViewInit() {
    const carouselElement = document.getElementById('carouselExampleIndicators');

    if (carouselElement) {
      carouselElement.addEventListener('slid.bs.carousel', (event: any) => {
        this.activeSlideIndex = event.to; // 🔹 Obtiene el nuevo índice del slide activo
      });
    }
  }
}

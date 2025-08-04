import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-catalogo',
  imports: [CommonModule],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css'
})
export class CatalogoComponent {
  categories = [
    { name: "Medicamentos", image: "https://via.placeholder.com/300" },
    { name: "Vitaminas y suplementos", image: "https://via.placeholder.com/300" },
    { name: "Mamá y Bebé", image: "https://via.placeholder.com/300" },
    { name: "Cuidado personal", image: "https://via.placeholder.com/300" },
    { name: "Belleza", image: "https://via.placeholder.com/300" },
    { name: "Salud sexual", image: "https://via.placeholder.com/300" }
  ];
}

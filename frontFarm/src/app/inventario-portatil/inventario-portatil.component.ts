import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { InventarioTitleService } from './inventario-title.service';

@Component({
    selector: 'app-inventario-portatil',
    standalone: true,
    imports: [RouterModule, CommonModule],
    templateUrl: './inventario-portatil.component.html',
    styleUrls: ['./inventario-portatil.component.css']
})
export class InventarioPortatilComponent implements OnInit {

    titulo: string = 'Inventario';

    constructor(private titleService: InventarioTitleService) {}

  ngOnInit() {

    // 🔥 Escuchar cambios del servicio GLOBAL
    this.titleService.titulo$.subscribe(t => {
      this.titulo = t;
    });

    // 🔥 Fijar título inicial correcto según usuario
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    if (usuario.rol === 'ajustaAlmacen' || usuario.rol === 'ajustaSoloAlmacen') {
      this.titleService.setTitulo('Inventario – Seleccionar ubicación');
    } else if (usuario.rol === 'ajustaFarma') {
      this.titleService.setTitulo(`Inventario – Farmacia ${usuario.farmacia?.nombre || ''}`);
    } 
  }
}

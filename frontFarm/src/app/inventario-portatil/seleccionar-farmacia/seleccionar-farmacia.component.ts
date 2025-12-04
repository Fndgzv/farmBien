import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventarioTitleService } from '../inventario-title.service';
import { FarmaciaService } from '../../services/farmacia.service';

@Component({
  selector: 'app-seleccionar-farmacia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './seleccionar-farmacia.component.html',
  styleUrls: ['./seleccionar-farmacia.component.css']
})
export class SeleccionarFarmaciaComponent implements OnInit {

  farmacias: any[] = [];
  cargando = true;

  constructor(
    private farmaciaService: FarmaciaService,
    private router: Router,
    private titleService: InventarioTitleService
  ) { }

  ngOnInit() {
    // Título inicial
    this.titleService.setTitulo('Inventario – Seleccionar ubicación');

    // Obtener farmacias
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data: any[]) => {
        this.farmacias = data;
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
        alert("Error al cargar farmacias.");
      }
    });
  }

  seleccionarAlmacen() {
    this.titleService.setTitulo('Inventario – ALMACÉN');
    this.router.navigate(['/inventario-portatil/buscar', 'almacen']);
  }

  seleccionarFarmacia(f: any) {
    this.titleService.setTitulo(`Inventario – Farmacia ${f.nombre}`);
    this.router.navigate(['/inventario-portatil/buscar', f._id]);
  }

  salir() {
    localStorage.removeItem('inventarioUbicacion');
    this.router.navigate(['/login']);
  }
}

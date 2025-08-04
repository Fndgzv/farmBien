import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FarmaciaService } from '../../services/farmacia.service';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-farmacia-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './farmacia-selector.component.html',
  styleUrls: ['./farmacia-selector.component.css']
})


export class FarmaciaSelectorComponent implements OnInit {

  farmacias: any[] = [];
  farmaciaSeleccionada: string = '';
  @Output() farmaciaConfirmada = new EventEmitter<any>();

  constructor(private farmaciaService: FarmaciaService, private http: HttpClient) { }

  ngOnInit(): void {
    const token = localStorage.getItem('token');

    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => (this.farmacias = data),
      error: () => Swal.fire('Error', 'No se pudieron cargar las farmacias', 'error')
    });
  }

  confirmar(): void {

    if (!this.farmaciaSeleccionada) {
      Swal.fire({
        icon: 'error',
        title: 'Selección de Farmacia',
        text: '¡Por favor, selecciona una farmacia para continuar!',
      });
      return; // Detenemos el proceso si no se seleccionó una farmacia
    }

    // Buscamos la farmacia seleccionada en el array farmacias
    const farmaciaSeleccionada = this.farmacias.find(f => f._id === this.farmaciaSeleccionada);

    // Si la farmacia no se encuentra, no hacemos nada
    if (!farmaciaSeleccionada) {
      console.error("Farmacia no encontrada");
      return;
    }

    // Crear el objeto con los datos completos de la farmacia
    const farmaciaObj = {
      _id: farmaciaSeleccionada._id,
      nombre: farmaciaSeleccionada.nombre,
      direccion: farmaciaSeleccionada.direccion,
      telefono: farmaciaSeleccionada.telefono
    };

    // Guardamos el objeto en el localStorage
    localStorage.setItem('user_farmacia', JSON.stringify(farmaciaObj));

    // Emitir el evento
    this.farmaciaConfirmada.emit(farmaciaObj);

    // Mostrar mensaje de éxito
    Swal.fire({
      icon: 'success',
      title: 'Inicio de sesión exitoso',
      text: 'Bienvenido, administrador',
      timer: 1000, // Cierra automáticamente después de 1 segundo
      showConfirmButton: false
    });
  }
}




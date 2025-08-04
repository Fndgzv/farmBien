import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';

import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import { FarmaciaService, Farmacia } from '../../../services/farmacia.service';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';

declare const bootstrap: any;

@Component({
  selector: 'app-farmacias',
  imports: [CommonModule, FontAwesomeModule, ReactiveFormsModule, FormsModule, MatTooltipModule],
  templateUrl: './farmacias.component.html',
  styleUrl: './farmacias.component.css'
})

export class FarmaciasComponent implements OnInit {
  formFarmacia: FormGroup;
  farmacias: Farmacia[] = [];
  guardando = false;
  modoEdicion = false;
  farmaciaEditandoId: string | null = null;

  constructor(private fb: FormBuilder, private farmaciaService: FarmaciaService, private library: FaIconLibrary,) {
    library.addIcons(faPen, faTrash, faPlus);
    this.formFarmacia = this.fb.group({
      nombre: ['', Validators.required],
      direccion: [''],
      telefono: [''],
      firma: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.cargarFarmacias();
  }

  cargarFarmacias() {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => (this.farmacias = data),
      error: () => Swal.fire('Error', 'No se pudieron cargar las farmacias', 'error')
    });
  }

  abrirModalAgregar() {
    const modalElement = document.getElementById('modalAgregarFarmacia');
    if (modalElement) {
      this.formFarmacia.reset();
      this.modoEdicion = false;
      this.farmaciaEditandoId = null;

      const modal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();
    } else {
      console.error('No se encontró el modal modalAgregarFarmacia');
    }
  }

  editar(f: Farmacia) {
  const modalElement = document.getElementById('modalAgregarFarmacia');
  if (modalElement) {
    this.modoEdicion = true;
    this.farmaciaEditandoId = f._id || null;

    this.formFarmacia.patchValue({
      nombre: f.nombre,
      direccion: f.direccion,
      telefono: f.telefono,
      firma: f.firma
    });

    const modal = new bootstrap.Modal(modalElement, {
      backdrop: 'static',
      keyboard: false
    });
    modal.show();
  }
}

guardar() {
  if (this.formFarmacia.invalid || this.guardando) return;
  this.guardando = true;

  const datos = this.formFarmacia.value;

  const accionFinal = () => {
    const modalElement = document.getElementById('modalAgregarFarmacia');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      modal?.hide();
    }
    this.formFarmacia.reset();
    this.farmaciaEditandoId = null;
    this.modoEdicion = false;
    this.guardando = false;
    this.cargarFarmacias();
  };

  if (this.modoEdicion && this.farmaciaEditandoId) {
    this.farmaciaService.actualizarFarmacia(this.farmaciaEditandoId, datos).subscribe({
      next: () => Swal.fire('Actualizado', 'Farmacia actualizada correctamente', 'success').then(accionFinal),
      error: () => { Swal.fire('Error', 'No se pudo actualizar', 'error'); this.guardando = false; }
    });
  } else {
    this.farmaciaService.crearFarmacia(datos).subscribe({
      next: () => Swal.fire('Creado', 'Farmacia creada correctamente', 'success').then(accionFinal),
      error: () => { Swal.fire('Error', 'No se pudo crear', 'error'); this.guardando = false; }
    });
  }
}



  eliminar(id: string) {
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'La farmacia será desactivada',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.farmaciaService.eliminarFarmacia(id).subscribe({
          next: () => {
            Swal.fire('Desactivada', 'La farmacia fue desactivada', 'success');
            this.cargarFarmacias();
          },
          error: () => Swal.fire('Error', 'No se pudo eliminar la farmacia', 'error')
        });
      }
    });
  }

}

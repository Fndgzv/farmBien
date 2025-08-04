import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ProveedorService, Proveedor } from '../../services/proveedor.service';
import Swal from 'sweetalert2';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faPlus, faSortAlphaDown, faSortAlphaUp } from '@fortawesome/free-solid-svg-icons';

declare const bootstrap: any;
@Component({
  selector: 'app-proveedores',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FontAwesomeModule],
  templateUrl: './proveedores.component.html',
  styleUrl: './proveedores.component.css'
})
export class ProveedoresComponent implements OnInit {
  proveedores: Proveedor[] = [];
  formProveedor: FormGroup = new FormGroup({});
  modoEdicion = false;
  proveedorEditandoId: string | null = null;
  guardando = false;

  paginaActual = 1;
  proveedoresPorPagina = 10;
  ordenAscendente = true;

  constructor(
    private fb: FormBuilder,
    private proveedorService: ProveedorService,
    private library: FaIconLibrary
  ) {
    library.addIcons(faPen, faPlus, faSortAlphaDown, faSortAlphaUp);
  }

  ngOnInit(): void {
    this.formProveedor = this.fb.group({
      nombre: ['', Validators.required],
      contacto: [''],
      telefono: [''],
      domicilio: ['']
    });

    this.cargarProveedores();
  }

  cargarProveedores() {
    this.proveedorService.obtenerProveedores().subscribe({
      next: (data) => this.proveedores = data,
      error: () => Swal.fire('Error', 'No se pudieron cargar los proveedores', 'error')
    });
  }

  get proveedoresPaginados() {
    const inicio = (this.paginaActual - 1) * this.proveedoresPorPagina;
    return this.proveedores.slice(inicio, inicio + this.proveedoresPorPagina);
  }

  get totalPaginas(): number {
    return Math.ceil(this.proveedores.length / this.proveedoresPorPagina);
  }

  ordenarPorNombre() {
    this.ordenAscendente = !this.ordenAscendente;
    this.proveedores.sort((a, b) => {
      const nombreA = a.nombre.toLowerCase();
      const nombreB = b.nombre.toLowerCase();

      if (this.ordenAscendente) {
        return nombreA.localeCompare(nombreB);
      } else {
        return nombreB.localeCompare(nombreA);
      }
    });

    // Reiniciamos a la primera página tras el ordenamiento
    this.paginaActual = 1;
  }

  abrirModalAgregar() {
    this.modoEdicion = false;
    this.proveedorEditandoId = null;
    this.formProveedor.reset();

    const modalElement = document.getElementById('modalProveedor');
    if (modalElement)
      new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false }).show();

  }

  editar(p: Proveedor) {
    this.modoEdicion = true;
    this.proveedorEditandoId = p._id || null;

    this.formProveedor.patchValue({
      nombre: p.nombre,
      contacto: p.contacto || '',
      telefono: p.telefono || '',
      domicilio: p.domicilio || ''
    });

    const modalElement = document.getElementById('modalProveedor');
    if (modalElement)
      new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false }).show();

  }

  guardar() {
    if (this.formProveedor.invalid || this.guardando) return;

    this.guardando = true;
    const datos = this.formProveedor.value;

    const finalizar = () => {
      const modalElement = document.getElementById('modalProveedor');
      if (modalElement) bootstrap.Modal.getInstance(modalElement)?.hide();
      this.formProveedor.reset();
      this.cargarProveedores();
      this.guardando = false;
      this.modoEdicion = false;
      this.proveedorEditandoId = null;
    };

    if (this.modoEdicion && this.proveedorEditandoId) {
      this.proveedorService.actualizarProveedor(this.proveedorEditandoId, datos).subscribe({
        next: () => Swal.fire('Actualizado', 'Proveedor actualizado', 'success').then(finalizar),
        error: () => { Swal.fire('Error', 'No se pudo actualizar', 'error'); this.guardando = false; }
      });
    } else {
      this.proveedorService.crearProveedor(datos).subscribe({
        next: () => Swal.fire('Agregado', 'Proveedor creado', 'success').then(finalizar),
        error: () => { Swal.fire('Error', 'No se pudo crear', 'error'); this.guardando = false; }
      });
    }
  }
}

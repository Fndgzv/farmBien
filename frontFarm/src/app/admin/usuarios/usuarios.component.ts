import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { UsuarioService, Usuario } from '../../services/usuario.service';
import { FarmaciaService, Farmacia } from '../../services/farmacia.service';
import Swal from 'sweetalert2';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faPlus } from '@fortawesome/free-solid-svg-icons';

declare const bootstrap: any;
@Component({
  selector: 'app-usuarios',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FontAwesomeModule, MatTooltipModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css'
})
export class UsuariosComponent implements OnInit {
  usuarios: Usuario[] = [];
  farmacias: Farmacia[] = [];
  formUsuario: FormGroup = new FormGroup({});
  guardando = false;
  modoEdicion = false;
  usuarioEditandoId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private usuarioService: UsuarioService,
    private farmaciaService: FarmaciaService,
    private library: FaIconLibrary
  ) {
    library.addIcons(faPen, faPlus);
  }

  ngOnInit(): void {
    this.inicializarFormulario();
    this.cargarUsuarios();
    this.cargarFarmacias();
  }

  inicializarFormulario() {
    this.formUsuario = this.fb.group({
      nombre: ['', Validators.required],
      usuario: ['', Validators.required],
      telefono: ['', [Validators.pattern(/^\d{10}$/)]],
      email: [''],
      password: ['', [Validators.minLength(6)]],
      domicilio: [''],
      rol: ['', Validators.required],
      farmacia: [''],
      cedulaProfesional: ['']
    });
  }

  obtenerNombreFarmacia(farmacia: string | { _id: string; nombre: string } | undefined): string {
    if (typeof farmacia === 'object' && farmacia?.nombre) {
      return farmacia.nombre;
    }
    return '-';
  }

  cargarUsuarios() {
    this.usuarioService.obtenerUsuarios().subscribe({
      next: (usuarios) => (this.usuarios = usuarios),
      error: () => Swal.fire('Error', 'No se pudieron cargar los usuarios', 'error')
    });
  }

  cargarFarmacias() {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => (this.farmacias = data),
      error: () => Swal.fire('Error', 'No se pudieron cargar las farmacias', 'error')
    });
  }

  abrirModalAgregar() {
    this.modoEdicion = false;
    this.usuarioEditandoId = null;
    this.formUsuario.reset();
    this.mostrarModal();
  }

  editar(usuario: Usuario) {
    this.modoEdicion = true;
    this.usuarioEditandoId = usuario._id || null;

    // Normalizar campos para evitar errores
    const datos = {
      ...usuario,
      farmacia: typeof usuario.farmacia === 'object' && usuario.farmacia !== null
        ? usuario.farmacia._id
        : '',
      cedulaProfesional: usuario.rol === 'medico'
        ? usuario.cedulaProfesional || ''
        : ''
    };


    this.formUsuario.patchValue(datos);

    // Mostrar modal
    const modalElement = document.getElementById('modalUsuario');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false });
      modal.show();
    }
  }


  mostrarModal() {
    const modalElement = document.getElementById('modalUsuario');
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();
    }
  }

  guardar() {
    if (this.formUsuario.invalid || this.guardando) return;
    this.guardando = true;

    const datos = this.limpiarDatosUsuarioPorRol(this.formUsuario.value);

    const finalizar = () => {
      const modalElement = document.getElementById('modalUsuario');
      if (modalElement) bootstrap.Modal.getInstance(modalElement)?.hide();
      this.cargarUsuarios();
      this.guardando = false;
      this.usuarioEditandoId = null;
      this.modoEdicion = false;
      this.formUsuario.reset();
    };

    // Si NO es edición, forzamos validación de contraseña
    if (!this.modoEdicion) {
      const passwordControl = this.formUsuario.get('password');
      passwordControl?.setValidators([Validators.required, Validators.minLength(6)]);
      passwordControl?.updateValueAndValidity();

      if (passwordControl?.invalid) {
        this.formUsuario.markAllAsTouched();
        this.guardando = false;
        return;
      }
    }

    if (this.modoEdicion && this.usuarioEditandoId) {
      this.usuarioService.actualizarUsuario(this.usuarioEditandoId, datos).subscribe({
        next: () => Swal.fire('Actualizado', 'Usuario actualizado', 'success').then(finalizar),
        error: () => { Swal.fire('Error', 'No se pudo actualizar', 'error'); this.guardando = false; }
      });
    } else {
      this.usuarioService.crearUsuario(datos).subscribe({
        next: () => Swal.fire('Registrado', 'Usuario creado', 'success').then(finalizar),
        error: (err) => {
          const mensaje = err?.error?.mensaje || 'No se pudo crear';
          Swal.fire('Error', mensaje, 'error');
          this.guardando = false;
        }
      });
    }
  }

  private limpiarDatosUsuarioPorRol(datos: any): any {
    const rol = datos.rol;

    switch (rol) {
      case 'admin':
        datos.farmacia = null;
        datos.cedulaProfesional = undefined;
        break;

      case 'empleado':
        if (!datos.farmacia) datos.farmacia = null;
        datos.cedulaProfesional = undefined;
        break;

      case 'medico':
        if (!datos.farmacia) datos.farmacia = null;
        if (!datos.cedulaProfesional) datos.cedulaProfesional = undefined;
        break;
    }

    // Valores vacíos en general también pueden limpiarse:
    if (!datos.email) datos.email = undefined;
    if (!datos.domicilio) datos.domicilio = undefined;
    if (!datos.telefono) datos.telefono = undefined;

    return datos;
  }


}

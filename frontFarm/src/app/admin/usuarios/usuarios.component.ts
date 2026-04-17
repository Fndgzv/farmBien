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
    this.configurarValidacionesPorRol();
    this.cargarUsuarios();
    this.cargarFarmacias();
  }

  get rolSeleccionado(): string {
    return this.formUsuario.get('rol')?.value || '';
  }

  get requiereFarmacia(): boolean {
    return ['empleado', 'medico', 'ajustaFarma'].includes(this.rolSeleccionado);
  }

  get esRolMedico(): boolean {
    return this.rolSeleccionado === 'medico';
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
      cedulaProfesional: [''],
      titulo: [''],
      escuela: ['']
    });
  }

  configurarValidacionesPorRol() {
    this.formUsuario.get('rol')?.valueChanges.subscribe((rol) => {
      this.aplicarValidacionesPorRol(rol);
    });

    this.aplicarValidacionesPorRol(this.formUsuario.get('rol')?.value);
  }

  aplicarValidacionesPorRol(rol: string | null | undefined) {
    const farmaciaControl = this.formUsuario.get('farmacia');
    const cedulaControl = this.formUsuario.get('cedulaProfesional');
    const tituloControl = this.formUsuario.get('titulo');
    const escuelaControl = this.formUsuario.get('escuela');

    if (['empleado', 'medico', 'ajustaFarma'].includes(rol || '')) {
      farmaciaControl?.setValidators([Validators.required]);
    } else {
      farmaciaControl?.clearValidators();
      farmaciaControl?.setValue('', { emitEvent: false });
    }

    if (rol === 'medico') {
      cedulaControl?.setValidators([Validators.required]);
      tituloControl?.setValidators([Validators.required]);
      escuelaControl?.setValidators([Validators.required]);
    } else {
      cedulaControl?.clearValidators();
      tituloControl?.clearValidators();
      escuelaControl?.clearValidators();
      cedulaControl?.setValue('', { emitEvent: false });
      tituloControl?.setValue('', { emitEvent: false });
      escuelaControl?.setValue('', { emitEvent: false });
    }

    farmaciaControl?.updateValueAndValidity({ emitEvent: false });
    cedulaControl?.updateValueAndValidity({ emitEvent: false });
    tituloControl?.updateValueAndValidity({ emitEvent: false });
    escuelaControl?.updateValueAndValidity({ emitEvent: false });
  }

  resetFormularioUsuario() {
    this.formUsuario.get('password')?.setValidators([Validators.minLength(6)]);
    this.formUsuario.get('password')?.updateValueAndValidity({ emitEvent: false });

    this.formUsuario.reset({
      nombre: '',
      usuario: '',
      telefono: '',
      email: '',
      password: '',
      domicilio: '',
      rol: '',
      farmacia: '',
      cedulaProfesional: '',
      titulo: '',
      escuela: ''
    });
    this.aplicarValidacionesPorRol('');
  }

  obtenerNombreFarmacia(farmacia: string | { _id: string; nombre: string } | undefined | null): string {
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
    this.resetFormularioUsuario();
    this.mostrarModal();
  }

  editar(usuario: Usuario) {
    this.modoEdicion = true;
    this.usuarioEditandoId = usuario._id || null;

    const datos = {
      ...usuario,
      password: '',
      farmacia: typeof usuario.farmacia === 'object' && usuario.farmacia !== null
        ? usuario.farmacia._id
        : (usuario.farmacia || ''),
      cedulaProfesional: usuario.rol === 'medico'
        ? usuario.cedulaProfesional || ''
        : '',
      titulo: usuario.rol === 'medico'
        ? usuario.titulo || ''
        : '',
      escuela: usuario.rol === 'medico'
        ? usuario.escuela || ''
        : ''
    };

    this.formUsuario.get('password')?.setValidators([Validators.minLength(6)]);
    this.formUsuario.get('password')?.updateValueAndValidity({ emitEvent: false });

    this.formUsuario.patchValue(datos);
    this.aplicarValidacionesPorRol(usuario.rol);

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
    if (this.guardando) return;

    if (this.formUsuario.invalid) {
      this.formUsuario.markAllAsTouched();
      return;
    }

    this.guardando = true;

    const datosOriginal = this.formUsuario.value;
    const datos = this.limpiarDatosUsuarioPorRol({
      ...datosOriginal,
      nuevaPassword: datosOriginal.password
    });

    const finalizar = () => {
      const modalElement = document.getElementById('modalUsuario');
      if (modalElement) bootstrap.Modal.getInstance(modalElement)?.hide();
      this.cargarUsuarios();
      this.guardando = false;
      this.usuarioEditandoId = null;
      this.modoEdicion = false;
      this.resetFormularioUsuario();
    };

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
        error: (err) => {
          const mensaje = err?.error?.mensaje || 'No se pudo actualizar';
          Swal.fire('Error', mensaje, 'error');
          this.guardando = false;
        }
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
        datos.titulo = undefined;
        datos.escuela = undefined;
        break;

      case 'empleado':
        if (!datos.farmacia) datos.farmacia = null;
        datos.cedulaProfesional = undefined;
        datos.titulo = undefined;
        datos.escuela = undefined;
        break;

      case 'medico':
        if (!datos.farmacia) datos.farmacia = null;
        if (!datos.cedulaProfesional) datos.cedulaProfesional = undefined;
        if (!datos.titulo) datos.titulo = undefined;
        if (!datos.escuela) datos.escuela = undefined;
        break;

      case 'ajustaAlmacen':
        datos.farmacia = null;
        datos.cedulaProfesional = undefined;
        datos.titulo = undefined;
        datos.escuela = undefined;
        break;

      case 'ajustaSoloAlmacen':
        datos.farmacia = null;
        datos.cedulaProfesional = undefined;
        datos.titulo = undefined;
        datos.escuela = undefined;
        break;

      case 'ajustaFarma':
        if (!datos.farmacia) datos.farmacia = null;
        datos.cedulaProfesional = undefined;
        datos.titulo = undefined;
        datos.escuela = undefined;
        break;
    }

    if (!datos.email) datos.email = undefined;
    if (!datos.domicilio) datos.domicilio = undefined;
    if (!datos.telefono) datos.telefono = undefined;
    if (!datos.password) datos.password = undefined;

    return datos;
  }
}

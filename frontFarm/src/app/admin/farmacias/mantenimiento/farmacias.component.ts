// frontFarm\src\app\admin\farmacias\mantenimiento\farmacias.component.ts
import { of } from 'rxjs';
import { switchMap, map, catchError, finalize } from 'rxjs/operators';

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, AbstractControl, ValidationErrors } from '@angular/forms';

import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import { FarmaciaService, Farmacia, FarmaciaUI } from '../../../services/farmacia.service';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faTrash, faPlus, faEye, faEyeSlash, faKey } from '@fortawesome/free-solid-svg-icons';

declare const bootstrap: any;

@Component({
  selector: 'app-farmacias',
  imports: [CommonModule, FontAwesomeModule, ReactiveFormsModule, FormsModule, MatTooltipModule],
  templateUrl: './farmacias.component.html',
  styleUrl: './farmacias.component.css'
})

export class FarmaciasComponent implements OnInit {
  farmacias: FarmaciaUI[] = [];
  cargando = false;

  formFarmacia: FormGroup;
  guardando = false;
  modoEdicion = false;
  farmaciaEditandoId: string | null = null;

  showFirma = false;
  showFirmaConfirm = false;

  formCambiarFirma!: FormGroup;
  guardandoFirma = false;

  showAdminPass = false;
  showNueva = false;
  showConfirm = false;
  farmaciaTarget: any = null;

  constructor(private fb: FormBuilder, private farmaciaService: FarmaciaService, private library: FaIconLibrary,) {
    library.addIcons(faPen, faTrash, faPlus, faEye, faEyeSlash, faKey);
    this.formFarmacia = this.fb.group({
      nombre: ['', Validators.required],
      direccion: [''],
      telefono: [''],
      firma: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.cargarFarmacias();
    this.formFarmacia = this.fb.group(
      {
        nombre: ['', [Validators.required, Validators.minLength(2)]],
        direccion: [''],
        telefono: [''],

        // edición
        firmaActual: [''],      // required solo en edición cuando se cambia firma
        // creación o edición (si cambia):
        nuevaFirma: ['']        // required + minLength(6) según modo
      },
      { validators: [this.nuevaDistintaDeActualValidator] }
    );

    this.formCambiarFirma = this.fb.group(
      {
        adminPassword: ['', [Validators.required, Validators.minLength(4)]],
        nuevaFirma: ['', [Validators.required, Validators.minLength(4)]],
        confirmFirma: ['', [Validators.required]]
      },
      { validators: [this.firmasIgualesValidatorCambiar] }
    );
  }

  nuevaDistintaDeActualValidator = (group: AbstractControl) => {
    const actual = (group.get('firmaActual')?.value || '').trim();
    const nueva = (group.get('nuevaFirma')?.value || '').trim();
    if (!actual || !nueva) return null;        // sin ambos, no validamos igualdad
    return actual === nueva ? { nuevaIgualAActual: true } : null;
  };

  private configurarValidadoresFirma() {
    const firmaActual = this.formFarmacia.get('firmaActual')!;
    const nuevaFirma = this.formFarmacia.get('nuevaFirma')!;

    if (this.modoEdicion) {
      // En edición: cambiar firma es opcional. Si capturan nueva, pedimos actual.
      const nueva = (nuevaFirma.value || '').trim();
      if (nueva) {
        firmaActual.setValidators([Validators.required]);  // deben poner la actual
        nuevaFirma.setValidators([Validators.minLength(6)]);
      } else {
        firmaActual.clearValidators();
        nuevaFirma.clearValidators();
      }
    } else {
      // En crear: nuevaFirma requerida y min 6
      firmaActual.clearValidators();
      nuevaFirma.setValidators([Validators.required, Validators.minLength(6)]);
    }

    firmaActual.updateValueAndValidity({ emitEvent: false });
    nuevaFirma.updateValueAndValidity({ emitEvent: false });
  }

  // Llama esto cuando abras el modal y en (input) de nuevaFirma para reevaluar:
  onNuevaFirmaChange() { this.configurarValidadoresFirma(); }

  // Abrir en modo editar
  editar(f: Farmacia) {
    const modalElement = document.getElementById('modalAgregarFarmacia');
    if (!modalElement) return;

    this.modoEdicion = true;
    this.farmaciaEditandoId = f._id || null;

    this.formFarmacia.reset({
      nombre: f.nombre,
      direccion: f.direccion,
      telefono: f.telefono,
      firmaActual: '',
      nuevaFirma: ''
    });

    this.configurarValidadoresFirma();

    const modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false });
    modal.show();
  }

  firmasIgualesValidatorCambiar = (group: AbstractControl): ValidationErrors | null => {
    const a = (group.get('nuevaFirma')?.value || '').trim();
    const b = (group.get('confirmFirma')?.value || '').trim();
    if (!a && !b) return null;
    return a === b ? null : { firmaNoCoincide: true };
  };

  abrirCambiarFirma(f: Farmacia) {
    this.farmaciaTarget = f;
    this.formCambiarFirma.reset();
    const el = document.getElementById('modalCambiarFirma');
    if (el) new bootstrap.Modal(el, { backdrop: 'static', keyboard: false }).show();
  }

  confirmarCambioFirma() {
    if (this.formCambiarFirma.invalid || !this.farmaciaTarget?._id) return;
    this.guardandoFirma = true;

    const { adminPassword, nuevaFirma } = this.formCambiarFirma.value;

    this.farmaciaService.cambiarFirma(this.farmaciaTarget._id!, {
      adminPassword,
      nuevaFirma: (nuevaFirma || '').trim()
    }).subscribe({
      next: (res: any) => {
        Swal.fire('Actualizada', 'La firma se cambió correctamente', 'success').then(() => {
          const el = document.getElementById('modalCambiarFirma');
          if (el) bootstrap.Modal.getInstance(el)?.hide();
          this.guardandoFirma = false;
          // refresca para ver firmaUpdatedAt
          this.cargarFarmacias();
        });
      },
      error: (err) => {
        console.error(err);
        this.guardandoFirma = false;
        Swal.fire('Error', err.error?.mensaje || 'No se pudo cambiar la firma', 'error');
      }
    });
  }

  // Validador cruzado: si hay firma o confirm, deben coincidir
  firmasIgualesValidator = (group: AbstractControl): ValidationErrors | null => {
    const f = (group.get('firma')?.value || '').trim();
    const c = (group.get('firmaConfirm')?.value || '').trim();
    if (!f && !c) return null;          // ambos vacíos: válido (en edición)
    if (f !== c) return { firmaNoCoincide: true };
    return null;
  };

cargarFarmacias() {
  this.cargando = true;

  this.farmaciaService.obtenerFarmacias().pipe(
    switchMap((lista: Farmacia[]) =>
      this.farmaciaService.abiertosPorFarmacia().pipe(
        map(({ mapa }: { mapa: Record<string, number> }) =>
          lista.map(f => {
            const abiertos = mapa[f._id!] ?? 0;
            return {
              ...f,
              _abiertos: abiertos,
              _bloquearEliminar: abiertos > 0
            } as FarmaciaUI;
          })
        ),
        // si falla el endpoint de abiertos, no bloquees el botón
        catchError(() =>
          of(
            lista.map(f => ({ ...f, _abiertos: 0, _bloquearEliminar: false } as FarmaciaUI))
          )
        )
      )
    ),
    finalize(() => (this.cargando = false))
  )
  .subscribe({
    next: (arr: FarmaciaUI[]) => (this.farmacias = arr),
    error: () => Swal.fire('Error', 'No se pudieron cargar las farmacias', 'error')
  });
}


  abrirModalAgregar() {
    const modalElement = document.getElementById('modalAgregarFarmacia');
    if (!modalElement) return;

    this.modoEdicion = false;
    this.farmaciaEditandoId = null;

    this.formFarmacia.reset({
      nombre: '',
      direccion: '',
      telefono: '',
      firma: '',
      firmaConfirm: ''
    });

    this.configurarValidadoresFirma();

    const modal = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false });
    modal.show();
  }

  guardar() {
    if (this.guardando) return;

    // Re-sincroniza validadores dinámicos por si el usuario escribió recién
    this.configurarValidadoresFirma();

    if (this.formFarmacia.invalid) {
      this.formFarmacia.markAllAsTouched();
      Swal.fire('Datos incompletos', 'Revisa los campos del formulario.', 'warning');
      return;
    }

    this.guardando = true;

    const { nombre, direccion, telefono, firmaActual, nuevaFirma } = this.formFarmacia.value;

    // Payload base
    const datos: any = {
      nombre: (nombre || '').trim(),
      direccion: (direccion || '').trim(),
      telefono: (telefono || '').trim()
    };

    const terminar = () => {
      const modalElement = document.getElementById('modalAgregarFarmacia');
      if (modalElement) bootstrap.Modal.getInstance(modalElement)?.hide();
      this.formFarmacia.reset();
      this.farmaciaEditandoId = null;
      this.modoEdicion = false;
      this.guardando = false;
      this.cargarFarmacias();
    };

    if (this.modoEdicion && this.farmaciaEditandoId) {
      // EDICIÓN
      const nueva = (nuevaFirma || '').trim();

      if (nueva) {
        // Validaciones de la nueva firma en edición
        if (nueva.length < 6) {
          this.formFarmacia.get('nuevaFirma')?.markAsTouched();
          this.guardando = false;
          Swal.fire('Firma inválida', 'La nueva firma debe tener al menos 6 caracteres.', 'warning');
          return;
        }
        if (this.formFarmacia.errors?.['nuevaIgualAActual']) {
          this.formFarmacia.get('nuevaFirma')?.markAsTouched();
          this.formFarmacia.get('firmaActual')?.markAsTouched();
          this.guardando = false;
          Swal.fire('Firma inválida', 'La nueva firma no puede ser igual a la actual.', 'warning');
          return;
        }
        // Enviar ambas al backend para verificación y re-hash
        datos.firmaActual = (firmaActual || '').trim();
        datos.nuevaFirma = nueva;
      }

      this.farmaciaService.actualizarFarmacia(this.farmaciaEditandoId, datos).subscribe({
        next: () =>
          Swal.fire({
            icon: 'success',
            title: 'Actualización',
            text: `Farmacia actualizada correctamente.`,
            timer: 1500,
            showConfirmButton: false
          }).then(terminar),
        /* Swal.fire('Actualizado', 'Farmacia actualizada correctamente', 'success').then(terminar), */
        error: (err) => {
          console.error(err);
          this.guardando = false;
          Swal.fire('Error', err?.error?.mensaje || 'No se pudo actualizar', 'error');
        }
      });

    } else {
      // CREACIÓN
      const nueva = (nuevaFirma || '').trim();
      if (!nueva || nueva.length < 6) {
        this.formFarmacia.get('nuevaFirma')?.markAsTouched();
        this.guardando = false;
        Swal.fire('Firma requerida', 'La firma debe tener al menos 6 caracteres.', 'warning');
        return;
      }

      datos.firma = nueva; // el backend la hashea en crearFarmacia

      this.farmaciaService.crearFarmacia(datos).subscribe({
        next: () =>
          Swal.fire({
            icon: 'success',
            title: 'Creación',
            text: `Farmacia creada correctamente.`,
            timer: 1500,
            showConfirmButton: false
          }).then(terminar),
        /* Swal.fire('Creado', 'Farmacia creada correctamente', 'success').then(terminar), */
        error: (err) => {
          console.error(err);
          this.guardando = false;
          Swal.fire('Error', err?.error?.mensaje || 'No se pudo crear', 'error');
        }
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

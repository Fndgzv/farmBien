import { Component, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

import { AuthService } from '../../services/auth.service';

import Swal from 'sweetalert2';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  templateUrl: './edit-profile.component.html',
  styleUrls: ['./edit-profile.component.css'],
  imports: [ReactiveFormsModule, CommonModule, MatButtonModule, MatInputModule, MatFormFieldModule]
})


export class EditProfileComponent implements OnInit, AfterViewInit {
  @ViewChild('passwordInput') passwordInput!: ElementRef;

  editProfileForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private cdr: ChangeDetectorRef) {
    const userData = this.authService.getUserData();

    this.editProfileForm = this.fb.group({
      nombre: [userData.nombre || '', [Validators.required]],
      password: ['', [Validators.required]],  // Mantener vacío por seguridad 
      email: [userData.email || ''],
      telefono: [userData.telefono || '', [Validators.required, Validators.minLength(10), Validators.maxLength(10), Validators.pattern("^[0-9]*$")]],
      domicilio: [userData.domicilio || '']
    });

    setTimeout(() => this.editProfileForm.updateValueAndValidity(), 0);
  }

  ngOnInit(): void {
    this.authService.isEditProfileVisible.subscribe(isVisible => {
      if (isVisible) {
        const userData = this.authService.getUserData();

        this.editProfileForm.patchValue({
          nombre: userData.nombre,
          email: userData.email,
          telefono: userData.telefono,
          domicilio: userData.domicilio,
          password: ''  // 🔹 Asegurar que siempre esté vacío
        });
        setTimeout(() => {
          this.cdr.detectChanges();
        }, 200);
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
  }

  updateProfile() {
    if (this.editProfileForm.valid) {
      const { nombre, password, email, telefono, domicilio } = this.editProfileForm.value;

      this.authService.updateUser(nombre, password, email, telefono, domicilio)
        .subscribe({
          next: (response: any) => {

            // 🔹 Actualizamos el localStorage con los nuevos datos
            this.authService.setUserData(
              localStorage.getItem('auth_token')!, // Mantiene el mismo token
              response.usuario.nombre, // Datos actualizados desde el backend 
              //localStorage.getItem('user_password')!, // Mantiene el mismo password
              localStorage.getItem('user_rol')!, // Mantiene el mismo rol
              email,
              telefono,
              domicilio,
            );

            Swal.fire({
              icon: 'success',
              title: 'Perfil actualizado',
              text: 'Tus datos han sido actualizados correctamente.',
              timer: 1500,
              showConfirmButton: false,
              backdrop: true, // 🔹 Mantiene el fondo bloqueando la página
              allowOutsideClick: false, // ✅ Bloquea interacciones fuera de Swal
              didOpen: () => {
                document.body.classList.add('swal-active'); // 🔹 Agrega una clase al body para bloquear el modal
              },
              willClose: () => {
                document.body.classList.remove('swal-active'); // 🔹 Elimina la clase cuando Swal se cierre
                this.closeEditProfile(); // ✅ Cierra el modal después del Swal
              }
            });


          },
          error: (error: any) => {
            console.error("❌ Error al actualizar perfil:", error);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.error?.mensaje || 'No se pudo actualizar el perfil. Intenta de nuevo.',
              backdrop: true,
              allowOutsideClick: false, // ✅ Bloquea interacciones fuera de Swal
              didOpen: () => {
                document.body.classList.add('swal-active');
              },
              willClose: () => {
                document.body.classList.remove('swal-active');
              }
            });
          }
        });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Por favor, completa todos los campos correctamente.',
        backdrop: true,
        allowOutsideClick: false, // ✅ Bloquea interacciones fuera de Swal
        didOpen: () => {
          document.body.classList.add('swal-active');
        },
        willClose: () => {
          document.body.classList.remove('swal-active');
        }
      });
    }
  }

  closeEditProfile() {
    this.authService.hideEditProfile();
    this.cdr.detectChanges();
  }

  forceUpdate() {
    this.cdr.detectChanges();
  }

}

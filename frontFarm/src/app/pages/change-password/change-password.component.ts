import { Component, ChangeDetectorRef, ViewChild, ElementRef, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthService } from '../../services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-change-password',
  standalone: true,
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.css'],
  imports: [ReactiveFormsModule, CommonModule, MatButtonModule, MatInputModule, MatFormFieldModule]
})

export class ChangePasswordComponent implements OnInit {
  @ViewChild('currentPasswordInput') currentPasswordInput!: ElementRef;

  changePasswordForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private cdr: ChangeDetectorRef) {
    this.changePasswordForm = this.fb.group({
      passwordActual: ['', [Validators.required]],
      nuevaPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmarPassword: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    this.authService.isChangePasswordVisible.subscribe(isVisible => {
      if (isVisible) {
        this.changePasswordForm.patchValue({
          passwordActual: '',
          nuevaPassword: '',
          confirmarPassword: ''
        });

        setTimeout(() => {
          this.cdr.detectChanges();
        }, 50);
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
  }

  submitChangePassword() {
    if (this.changePasswordForm.valid) {
      const passwordActual = this.changePasswordForm.get('passwordActual')?.value || '';
      const nuevaPassword = this.changePasswordForm.get('nuevaPassword')?.value || '';
      const confirmarPassword = this.changePasswordForm.get('confirmarPassword')?.value || '';

      if (!passwordActual || !nuevaPassword || !confirmarPassword) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Por favor, llena todos los campos.',
          backdrop: false
        });
        return;
      }

      if (nuevaPassword !== confirmarPassword) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Las contraseñas nuevas no coinciden.',
          backdrop: false
        });
        return;
      }

      this.authService.changePassword(passwordActual, nuevaPassword, confirmarPassword)
        .subscribe({
          next: (response: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Contraseña Actualizada',
              text: response.mensaje,
              timer: 1500,
              showConfirmButton: false,
              backdrop: true,
              allowOutsideClick: false, // ✅ Bloquea interacciones fuera de Swal
              didOpen: () => {
                document.body.classList.add('swal-active');
              },
              willClose: () => {
                document.body.classList.remove('swal-active');
                this.closeChangePassword(); // ✅ Cierra el modal después del Swal
              }
            });
          },
          error: (error: any) => {
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: error.error?.mensaje || 'No se pudo cambiar la contraseña. Intenta de nuevo.',
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

  closeChangePassword() {
    this.authService.hideChangePassword();
  }
}

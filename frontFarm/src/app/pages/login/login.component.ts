import { Component, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { FarmaciaSelectorComponent } from "../../components/farmacia-selector/farmacia-selector.component";

import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  imports: [ReactiveFormsModule,
    CommonModule,
    FarmaciaSelectorComponent,
    FontAwesomeModule,
  ]
})

export class LoginComponent {
  loginForm: FormGroup;

  errorMessage: string = '';

  showFarmaciaSelector = false;
  farmaciaSubject: any;

  mostrarPassword = false;

  farmaciaId = '';

  constructor(public fb: FormBuilder,
    private http: HttpClient,
    public authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef,
    private library: FaIconLibrary
  ) {

    library.addIcons(faEye, faEyeSlash);

    this.loginForm = this.fb.group({
      usuario: ['', Validators.required],
      password: ['', Validators.required]
    });

  }

  closeLogin() {
    this.authService.hideLogin();
    this.cdr.detectChanges(); // 🔹 Forzar la actualización del DOM
  }


  // 🔹 Función para iniciar sesión
  onSubmit(): void {

    if (this.loginForm.valid) {
      const { usuario, password } = this.loginForm.value;

      this.authService.login(usuario, password).subscribe({
        next: (response: any) => {

          if (response && response.token && response.user) {
            this.authService.setUserData(
              response.token,
              response.user.nombre,
              response.user.rol,
              response.user.email,
              response.user.farmacia,
              response.user.telefono,
              response.user.domicilio
            );

            if (response.user.rol === 'admin') {
              this.showFarmaciaSelector = true;
            } else {

              this.farmaciaId = response.user.farmacia._id;

              this.verificarCorteActivoYRedirigir();
            }

          } else {
            /* this.errorMessage = 'Respuesta del servidor no válida'; */
            this.showErrorAlert('Respuesta del servidor no válida');
          }
        },
        error: (error: any) => {
          console.error("❌ Error en login:", error);
          this.showErrorAlert(error.error?.mensaje || 'Error en autenticación');
        }
      });

    } else {
      /* console.error("⚠️ Formulario inválido:", this.loginForm.value); */
      this.showErrorAlert('Por favor, completa todos los campos correctamente.');
    }
  }


  onFarmaciaConfirmada(farmacia: any) {
    this.authService.setFarmacia(farmacia);
    this.showFarmaciaSelector = false;
    this.farmaciaId = farmacia._id;
    this.verificarCorteActivoYRedirigir();
  }

  toggleMostrarPassword() {
    this.mostrarPassword = !this.mostrarPassword;
  }

  // 🔹 Función para mostrar alertas de error
  private showErrorAlert(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Error en el inicio de sesión',
      text: message,
      confirmButtonText: 'Intentar de nuevo'
    });
  }

  verificarCorteActivoYRedirigir(): void {
    const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    const token = localStorage.getItem('auth_token');

    if (!usuario || !usuario.id || !usuario.rol) {
      console.error('Usuario no válido en localStorage');
      this.router.navigate(['/home']);
      return;
    }

    // Si es empleado, verificar si tiene corte activo
    const headers = new HttpHeaders({ 'x-auth-token': token || '' });

    this.http.get(`${environment.apiUrl}/cortes/activo/${usuario.id}/${this.farmaciaId}`, { headers }).subscribe({
      next: (res: any) => {
        if (res.corte) {
          // 🔹 Guardar ID del corte activo
          localStorage.setItem('corte_activo', res.corte._id);
          const fecha = new Date(res.corte.fechaInicio).toLocaleString();
          const monto = `$${res.corte.efectivoInicial.toFixed(2)}`;

          Swal.fire({
            title: 'Turno ya activo',
            html: `
            <p>Ya tienes un turno abierto.</p>
            <p><strong>Inicio:</strong> ${fecha}</p>
            <p><strong>Efectivo inicial:</strong> ${monto}</p>
          `, icon: 'info',
            timer: 2000,
            showConfirmButton: false,
            allowOutsideClick: false,
            allowEscapeKey: false,
          }).then(() => {
            this.authService.hideLogin();
            this.router.navigate(['/home']);
          });
        } else {
          //verificar si puede abrir nuevo turno
          this.http.get<{ puedeAbrirTurno: boolean }>(
            `${environment.apiUrl}/cortes/verificar-turno/${this.farmaciaId}`, { headers }
          ).subscribe({
            next: (resp) => {
              if (resp.puedeAbrirTurno) {
                this.authService.hideLogin();
                this.router.navigate(['/inicio-turno']);
              } else {
                Swal.fire(
                  'Acceso denegado',
                  'Ya cerraste tu turno de hoy. No puedes iniciar otro sin autorización.',
                  'warning'
                ).then(() => {
                  this.authService.logout();
                });
              }
            },
            error: err => {
              console.error('Error al verificar si puede abrir turno:', err);
              this.authService.logout();
            }
          });
        }
      },
      error: (err) => {
        console.error('Error al verificar corte activo:', err);
        this.authService.hideLogin();
        this.router.navigate(['/inicio-turno']);
      }
    });
  }

}

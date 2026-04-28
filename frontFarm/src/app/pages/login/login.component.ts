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
    library: FaIconLibrary
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

    if (!this.loginForm.valid) {
      this.showErrorAlert('Por favor, completa todos los campos correctamente.');
      return;
    }

    const { usuario, password } = this.loginForm.value;

    const intentarLogin = (firma?: string) => {

      this.authService.login(usuario, password, firma).subscribe({
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

            // ⭐ Redirección según rol
            const rol = response.user.rol;

            // ---- 1) ajustaAlmacen: NO necesita farmacia ni corte ----
            if (rol === 'ajustaAlmacen') {
              localStorage.removeItem('inventarioUbicacion');
              this.authService.hideLogin();
              this.router.navigate(['/inventario-portatil/seleccionar']);
              return;
            }

            if (rol === 'ajustaSoloAlmacen') {
              localStorage.removeItem('inventarioUbicacion');
              this.authService.hideLogin();
              this.router.navigate(['/inventario-portatil/buscar', 'almacen']);
              return;
            }

            // ---- 2) ajustaFarma: va directo a su farmacia ----
            if (rol === 'ajustaFarma') {
              const farmacia = response.user.farmacia;
              localStorage.setItem('inventarioUbicacion', JSON.stringify({
                tipo: 'farmacia',
                id: farmacia?._id,
                nombre: farmacia?.nombre
              }));

              this.authService.hideLogin();
              this.router.navigate(['/inventario-portatil/buscar', farmacia?._id]);
              return;
            }

            // ---- 3) ADMIN: Selecciona farmacia ----
            if (rol === 'admin') {
              this.showFarmaciaSelector = true;
              return;
            }

            // ---- 4) TURNOS: acceso directo a pantalla de turnos ----
            if (rol === 'turnos') {
              this.authService.hideLogin();
              this.router.navigate(['/pantalla-turnos']);
              return;
            }

            // ---- 5) EMPLEADO / MEDICO: flujo normal ----
            this.farmaciaId = response.user.farmacia?._id || '';
            this.verificarCorteActivoYRedirigir();

          } else {
            this.showErrorAlert('Respuesta del servidor no válida');
          }
        },
        error: async (error: any) => {
          // ¿Se requiere firma?
          const requiereFirma = error?.status === 401 && error?.error?.requiereFirma;
          if (requiereFirma) {
            const { value: firmaIngresada } = await Swal.fire({
              title: 'Autorización requerida',
              input: 'password',
              inputLabel: 'Firma de la farmacia',
              inputPlaceholder: 'Ingresa la firma',
              inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
              showCancelButton: true,
              confirmButtonText: 'Autorizar',
              cancelButtonText: 'Cancelar'
            });

            if (!firmaIngresada) {
              // Canceló o no capturó firma
              return;
            }

            // Reintentar login con firma
            intentarLogin(firmaIngresada);
            return;
          }

          console.error('Error en login:', error);
          const codigo = error?.error?.codigo;
          const mensaje =
            codigo === 'SESSION_ACTIVE_EXISTS'
              ? 'Ya existe una sesi�n activa para este usuario. Cierra la sesi�n anterior para volver a iniciar.'
              : (error?.error?.mensaje || 'Error en autenticaci�n');
          this.showErrorAlert(mensaje);
        }
      });
    };

    // Primer intento SIN firma
    intentarLogin();
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

    const headers = new HttpHeaders({ 'x-auth-token': token || '' });

    this.http
      .get(`${environment.apiUrl}/cortes/activo/${usuario.id}/${this.farmaciaId}`, { headers })
      .subscribe({
        next: (res: any) => {
          if (res?.corte) {
            // ✅ Turno activo → guardar y a /home
            localStorage.setItem('corte_activo', res.corte._id);

            const fecha = new Date(res.corte.fechaInicio).toLocaleString('es-MX', {
              timeZone: 'America/Mexico_City'
            });
            const efectivo = Number(res.corte.efectivoInicial || 0).toFixed(2);
            const recargasHtml =
              res.corte.saldoInicialRecargas !== undefined
                ? `<p><strong>Saldo inicial recargas:</strong> $${Number(res.corte.saldoInicialRecargas).toFixed(2)}</p>`
                : '';

            Swal.fire({
              title: 'Turno ya activo',
              html: `
              <p>Ya tienes un turno abierto.</p>
              <p><strong>Inicio:</strong> ${fecha}</p>
              <p><strong>Efectivo inicial:</strong> $${efectivo}</p>
              ${recargasHtml}
            `,
              icon: 'info',
              timer: 2000,
              showConfirmButton: false,
              allowOutsideClick: false,
              allowEscapeKey: false,
            }).then(() => {
              this.authService.hideLogin();
              this.router.navigate(['/home']);
            });
          } else {
            // 🚪 Sin turno activo → limpiar posible residuo y a /inicio-turno
            localStorage.removeItem('corte_activo');
            this.authService.hideLogin();
            this.router.navigate(['/inicio-turno']);
          }
        },
        error: (err) => {
          console.error('Error al verificar corte activo:', err);
          // En error tratamos como si no hubiera corte activo
          localStorage.removeItem('corte_activo');
          this.authService.hideLogin();
          this.router.navigate(['/inicio-turno']);
        }
      });
  }

}


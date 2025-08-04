import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { CorteCajaTicketComponent } from "../../impresiones/corte-caja-ticket/corte-caja-ticket.component";


@Component({
  selector: 'app-inicio-turno',
  imports: [CommonModule, FormsModule, CorteCajaTicketComponent],
  templateUrl: './inicio-turno.component.html',
  styleUrls: ['./inicio-turno.component.css']
})
export class InicioTurnoComponent implements OnInit {
  efectivoInicial: number = 0;
  corteActivo: any = null;
  usuarioId: string | null = null;
  usuarioNombre: string | null = null;
  
  farmaciaId: string | null = null;
  farmaciaNombre: string | null = null;
  farmaciaDireccion: string | null = null;
  farmaciaTelefono: string | null = null;

  mostrarFormulario: boolean = false;

  procesando: boolean = false;

  mostrarTicketCorte = false;
  datosCorteParaImpresion: any = null;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    const usuario = localStorage.getItem('usuario');
    const farmacia = localStorage.getItem('user_farmacia');

    if (usuario) {
      this.usuarioId = JSON.parse(usuario)?.id;
      this.usuarioNombre = JSON.parse(usuario)?.nombre;
    }
    if (farmacia) {
      this.farmaciaId = JSON.parse(farmacia)._id;
      this.farmaciaNombre = JSON.parse(farmacia).nombre;
      this.farmaciaDireccion = JSON.parse(farmacia).direccion;
      this.farmaciaTelefono = JSON.parse(farmacia).telefono;

    }

    if (!this.usuarioId || !this.farmaciaId) {
      Swal.fire('Error', 'Faltan datos de sesión o farmacia activa.', 'error');
      return;
    }

    this.verificarCorteActivo();
  }

  verificarCorteActivo(): void {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'x-auth-token': token || ''
    });
    this.http.get(`${environment.apiUrl}/cortes/activo/${this.usuarioId}/${this.farmaciaId}`, { headers }).subscribe({
      next: (res: any) => {
        if (res.corte) {
          this.corteActivo = res.corte;
        } else {
          this.mostrarFormulario = true;
          this.cdr.detectChanges(); // 🔄 forzar render
        }
      },
      error: (err) => {
        if (err.status === 409) {
          Swal.fire({
            icon: 'error',
            title: 'Corte duplicado detectado',
            text: err.error?.mensaje || 'Conflicto en cortes activos',
          });
        } else {
          Swal.fire('Error', 'No se pudo verificar el corte activo.', 'error');
        }
      }
    });
  }

  iniciarTurno(): void {
    if (this.efectivoInicial <= 0) {
      Swal.fire('Error', 'El efectivo inicial debe ser mayor a cero.', 'warning');
      return;
    }
    this.procesando = true;
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'x-auth-token': token || '',
      'Content-Type': 'application/json'
    });

    const payload = {
      efectivoInicial: this.efectivoInicial,
      farmaciaId: this.farmaciaId
    };

    this.http.post(`${environment.apiUrl}/cortes`, payload, { headers }).subscribe({
      next: (res: any) => {
        const corte = res.corte;
        localStorage.setItem('corte_activo', corte._id);

        Swal.fire({
          icon: 'success',
          title: 'Turno iniciado',
          text: `Turno iniciado con $${this.efectivoInicial.toFixed(2)} en caja.`,
          timer: 2000,
          showConfirmButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false,
        }).then(() => {
          this.router.navigate(['/home']);
        });
      },
      error: (err) => {
        console.error('Error al iniciar turno:', err);
        Swal.fire('Error', err.error?.mensaje || 'No se pudo iniciar el turno.', 'error');
      }
    });
  }

finalizarTurno(): void {
  Swal.fire({
    title: '¿Finalizar turno de caja?',
    text: 'Se generará el corte con los balances actuales.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, finalizar',
    cancelButtonText: 'Cancelar',
    allowOutsideClick: false,
    allowEscapeKey: false,
  }).then(result => {
    if (!result.isConfirmed) return;

    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({ 'x-auth-token': token || '' });

    // Obtener datos sin grabar aún
    this.http.put(`${environment.apiUrl}/cortes/${this.corteActivo._id}/finalizar/false`, {}, { headers }).subscribe({
      next: (res: any) => {
        // Preparar datos para el ticket
        this.datosCorteParaImpresion = {
          responsable: this.usuarioNombre,
          fechaInicio: this.corteActivo.fechaInicio,
          fechaFin: new Date().toISOString(),
          nomFarm: this.farmaciaNombre,
          dirFarm: this.farmaciaDireccion,
          telFarm: this.farmaciaTelefono,
          ...res.corte
        };

        this.mostrarTicketCorte = true;

        // Esperar renderizado antes de imprimir
        setTimeout(() => {
          requestAnimationFrame(() => {
            window.print();

            setTimeout(() => {
              this.mostrarTicketCorte = false;

              // Confirmar impresión con el usuario
              Swal.fire({
                title: '¿La impresión fue exitosa?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí',
                cancelButtonText: 'No',
                allowOutsideClick: false,
                allowEscapeKey: false
              }).then(resp => {
                if (resp.isConfirmed) {
                  // Ahora sí: grabar en el backend
                  this.http.put(`${environment.apiUrl}/cortes/${this.corteActivo._id}/finalizar/true`, {}, { headers }).subscribe({
                    next: () => {
                      localStorage.removeItem('corte_activo');
                      this.authService.logout();
                      this.router.navigate(['/home']);
                    },
                    error: err => {
                      console.error('Error al guardar corte:', err);
                      Swal.fire('Error', 'No se pudo guardar el corte.', 'error');
                    }
                  });
                } else {
                  Swal.fire('Aviso', 'La impresión no fue confirmada. El corte sigue activo.', 'info');
                }
              });

            }, 300);
          });
        }, 300);
      },
      error: (err) => {
        console.error('Error al cerrar turno:', err);
        Swal.fire('Error', 'No se pudo generar el corte.', 'error');
      }
    });
  });
}




}
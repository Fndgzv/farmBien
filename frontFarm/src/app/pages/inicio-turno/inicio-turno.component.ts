import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { TurnoCajaService } from '../../services/turno-caja.service';
import { CorteCajaTicketComponent } from '../../impresiones/corte-caja-ticket/corte-caja-ticket.component';

@Component({
  selector: 'app-inicio-turno',
  imports: [CommonModule, FormsModule, CorteCajaTicketComponent],
  templateUrl: './inicio-turno.component.html',
  styleUrls: ['./inicio-turno.component.css']
})
export class InicioTurnoComponent implements OnInit {
  efectivoInicial: number | null = null;
  saldoInicialRecargas: number | null = null;
  corteActivo: any = null;
  usuarioId: string | null = null;
  usuarioNombre: string | null = null;

  farmaciaId: string | null = null;
  farmaciaNombre: string | null = null;
  farmaciaDireccion: string | null = null;
  farmaciaTelefono: string | null = null;
  farmaciaImagen: string | null = null;
  farmaciaImagen2: string | null = null;
  farmaciaTitulo1: string | null = null;
  farmaciaTitulo2: string | null = null;

  mostrarFormulario = false;
  procesando = false;

  mostrarTicketCorte = false;
  datosCorteParaImpresion: any = null;

  constructor(
    private authService: AuthService,
    private turnoCajaService: TurnoCajaService,
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    const usuario = this.parseJson(localStorage.getItem('usuario'));
    const farmacia = this.parseJson(localStorage.getItem('user_farmacia'));

    this.usuarioId = usuario?.id || usuario?._id || null;
    this.usuarioNombre = usuario?.nombre || null;

    this.farmaciaId = farmacia?._id || null;
    this.farmaciaNombre = farmacia?.nombre || null;
    this.farmaciaDireccion = farmacia?.direccion || null;
    this.farmaciaTelefono = farmacia?.telefono || null;
    this.farmaciaImagen = farmacia?.imagen || null;
    this.farmaciaImagen2 = farmacia?.imagen2 || null;
    this.farmaciaTitulo1 = farmacia?.titulo1 || null;
    this.farmaciaTitulo2 = farmacia?.titulo2 || null;

    if (!this.usuarioId || !this.farmaciaId) {
      this.turnoCajaService.limpiarTurnoActivo();
      Swal.fire('Error', 'Faltan datos de sesion o farmacia activa.', 'error');
      return;
    }

    this.verificarCorteActivo();
  }

  verificarCorteActivo(): void {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    this.http.get(`${environment.apiUrl}/cortes/activo/${this.usuarioId}/${this.farmaciaId}`, { headers }).subscribe({
      next: (res: any) => {
        const corte = res?.corte ?? null;
        if (corte?._id) {
          this.corteActivo = corte;
          this.mostrarFormulario = false;
          this.turnoCajaService.marcarTurnoActivo(corte._id);
          return;
        }

        this.corteActivo = null;
        this.mostrarFormulario = true;
        this.turnoCajaService.limpiarTurnoActivo();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.turnoCajaService.limpiarTurnoActivo();

        if (err.status === 409) {
          Swal.fire({
            icon: 'error',
            title: 'Corte duplicado detectado',
            text: err.error?.mensaje || 'Conflicto en cortes activos'
          });
        } else {
          Swal.fire('Error', 'No se pudo verificar el corte activo.', 'error');
        }
      }
    });
  }

  iniciarTurno(): void {
    const efectivoInicial = this.obtenerNumeroValido(this.efectivoInicial);
    if (efectivoInicial === null) {
      this.mostrarAdvertencia('Debes capturar el efectivo inicial recibido con un valor numerico.');
      return;
    }

    if (efectivoInicial < 0) {
      this.mostrarAdvertencia('El efectivo inicial recibido debe ser 0 o mayor.');
      return;
    }

    const saldoInicialRecargas = this.obtenerNumeroValido(this.saldoInicialRecargas);
    if (saldoInicialRecargas === null) {
      this.mostrarAdvertencia('Debes capturar el saldo inicial de recargas con un valor numerico.');
      return;
    }

    if (saldoInicialRecargas < 0) {
      this.mostrarAdvertencia('El saldo inicial de recargas debe ser 0 o mayor.');
      return;
    }

    this.procesando = true;
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    const headers = new HttpHeaders({
      'x-auth-token': token,
      'Content-Type': 'application/json'
    });

    const payload = {
      efectivoInicial,
      saldoInicialRecargas,
      farmaciaId: this.farmaciaId
    };

    this.http.post(`${environment.apiUrl}/cortes`, payload, { headers }).subscribe({
      next: (res: any) => {
        const corteId = res?.corte?._id;
        if (corteId) {
          this.turnoCajaService.marcarTurnoActivo(corteId);
        } else {
          this.turnoCajaService.sincronizarTurnoDesdeStorage();
        }

        Swal.fire({
          icon: 'success',
          title: 'Turno iniciado',
          html: `
          <div style="text-align:left">
            <p><strong>Efectivo inicial:</strong> $${efectivoInicial.toFixed(2)}</p>
            <p><strong>Saldo inicial de recargas:</strong> $${saldoInicialRecargas.toFixed(2)}</p>
          </div>`,
          timer: 2200,
          showConfirmButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false
        }).then(() => {
          this.router.navigate(['/home']);
        });
      },
      error: (err) => {
        console.error('Error al iniciar turno:', err);
        Swal.fire('Error', err.error?.mensaje || 'No se pudo iniciar el turno.', 'error');
      }
    }).add(() => { this.procesando = false; });
  }

  finalizarTurno(): void {
    if (!this.corteActivo?._id) {
      Swal.fire('Error', 'No hay un corte activo para finalizar.', 'error');
      return;
    }

    Swal.fire({
      title: 'Finalizar turno de caja?',
      text: 'Se generara el corte con los balances actuales.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Si, finalizar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false
    }).then(result => {
      if (!result.isConfirmed) return;

      const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
      const headers = new HttpHeaders({ 'x-auth-token': token });

      this.http.put(`${environment.apiUrl}/cortes/${this.corteActivo._id}/finalizar/false`, {}, { headers }).subscribe({
        next: (res: any) => {
          this.datosCorteParaImpresion = {
            responsable: this.usuarioNombre,
            fechaInicio: this.corteActivo.fechaInicio,
            fechaFin: new Date().toISOString(),
            nomFarm: this.farmaciaNombre,
            dirFarm: this.farmaciaDireccion,
            telFarm: this.farmaciaTelefono,
            imgFarm: this.farmaciaImagen,
            ti1Farm: this.farmaciaTitulo1,
            ti2Farm: this.farmaciaTitulo2,
            ...res.corte
          };

          this.mostrarTicketCorte = true;

          setTimeout(() => {
            requestAnimationFrame(() => {
              window.print();

              setTimeout(() => {
                this.mostrarTicketCorte = false;

                Swal.fire({
                  title: 'La impresion fue exitosa?',
                  icon: 'question',
                  showCancelButton: true,
                  confirmButtonText: 'Si',
                  cancelButtonText: 'No',
                  allowOutsideClick: false,
                  allowEscapeKey: false
                }).then(resp => {
                  if (resp.isConfirmed) {
                    this.http.put(`${environment.apiUrl}/cortes/${this.corteActivo._id}/finalizar/true`, {}, { headers }).subscribe({
                      next: () => {
                        this.turnoCajaService.limpiarTurnoActivo();
                        this.authService.logout();
                        this.router.navigate(['/home']);
                      },
                      error: err => {
                        console.error('Error al guardar corte:', err);
                        Swal.fire('Error', 'No se pudo guardar el corte.', 'error');
                      }
                    });
                  } else {
                    Swal.fire('Aviso', 'La impresion no fue confirmada. El corte sigue activo.', 'info');
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

  private mostrarAdvertencia(texto: string): void {
    Swal.fire({
      icon: 'warning',
      title: 'Datos incompletos',
      text: texto,
      timer: 1700,
      timerProgressBar: true,
      allowOutsideClick: false,
      allowEscapeKey: false
    });
  }

  private obtenerNumeroValido(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') {
      return null;
    }

    const numero = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }

  private parseJson(raw: string | null): any {
    if (!raw || raw === 'undefined') {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}


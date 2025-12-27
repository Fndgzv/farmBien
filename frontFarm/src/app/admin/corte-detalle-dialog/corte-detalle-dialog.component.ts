import { Router } from '@angular/router';
import { Component, Inject, OnInit } from '@angular/core';
import { DatePipe, CurrencyPipe, CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA, MatDialogRef,
  MatDialogModule,
  MatDialogActions,
} from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../src/environments/environment';
import { MatButtonModule } from '@angular/material/button';
import Swal from 'sweetalert2';

type ModoDialog = 'cerrado' | 'previo';

@Component({
  selector: 'app-corte-detalle-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    DatePipe,
    CurrencyPipe,
    CommonModule,
    MatDialogActions
  ]
  ,
  templateUrl: './corte-detalle-dialog.component.html',
  styleUrl: './corte-detalle-dialog.component.css'
})


export class CorteDetalleDialogComponent implements OnInit{
  cargando = false;

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: {
      modo: ModoDialog;
      corte: any;
      cortePreview?: any;              // solo en modo 'previo'
      puedeAutorizarTurnoExtra?: boolean; // solo en modo 'cerrado'
      headers: any;
      usuarioId: string;
    },
    private http: HttpClient,
    private dialogRef: MatDialogRef<CorteDetalleDialogComponent>,
    private router: Router
  ) { }


  ngOnInit(): void {
    console.log('Corte de caja en detalle', this.data.corte);    
  }

  salir() {
    this.dialogRef.close(false);
  }

  finalizarTurnoCaja() {
    if (!this.data?.corte?._id) return;
    this.cargando = true;

    this.http.put(
      `${environment.apiUrl}/cortes/${this.data.corte._id}/finalizar/true`,
      {},
      { headers: this.data.headers }
    ).subscribe({
      next: () => {
        this.cargando = false;

        const cerreMiTurno = this.esMiTurnoActual();

        this.dialogRef.close(true); // refrescar tabla

        if (cerreMiTurno) {
          Swal.fire({
            icon: 'success',
            title: 'Turno finalizado',
            text: 'Se cerró tu turno. Cerrando sesión…',
            timer: 1600,
            showConfirmButton: false,
            allowOutsideClick: false,
            allowEscapeKey: false
          }).then(() => this.logoutPorCierre());
        }
      },
      error: (e) => {
        this.cargando = false;
        console.error('Error finalizando turno', e);
        Swal.fire('Error', e?.error?.mensaje || 'No se pudo finalizar el turno', 'error');
      }
    });
  }

  private esMiTurnoActual(): boolean {
    // el corte puede traer usuario como ObjectId o como objeto poblado { _id: ... }
    const usuarioCorte =
      this.data?.corte?.usuario?._id ??
      this.data?.corte?.usuario ??
      this.data?.corte?.idUsuario; // por si usas otro nombre

    const usuarioActual =
      this.data?.usuarioId ||
      (JSON.parse(localStorage.getItem('usuario') || '{}').id ?? '');

    return !!usuarioCorte && !!usuarioActual &&
           String(usuarioCorte) === String(usuarioActual);
  }

  private logoutPorCierre() {
    // Si tienes un AuthService con logout, úsalo:
    // this.authService.logout();

    // Fallback directo: limpiar storage y navegar
    try {
      localStorage.removeItem('corte_activo');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('usuario');
    } catch { /* ignore */ }

    // Redirige a home o login (según tu app)
    this.router.navigate(['/home']);
    // Si quieres forzar recarga total:
    location.reload();
  }

  private num(v: any): number { return v == null ? 0 : Number(v); }

  get totales() {
    const src = this.data?.modo === 'cerrado'
      ? (this.data?.corte ?? {})
      : (this.data?.cortePreview ?? {});
    return {
      ventasEfectivo: this.num(src.ventasEfectivo),
      ventasTarjeta: this.num(src.ventasTarjeta),
      ventasTransferencia: this.num(src.ventasTransferencia),
      ventasVale: this.num(src.ventasVale),

      devolucionesEfectivo: this.num(src.devolucionesEfectivo),
      devolucionesVale: this.num(src.devolucionesVale),

      pedidosEfectivo: this.num(src.pedidosEfectivo),
      pedidosTarjeta: this.num(src.pedidosTarjeta),
      pedidosTransferencia: this.num(src.pedidosTransferencia),
      pedidosVale: this.num(src.pedidosVale),

      pedidosCanceladosEfectivo: this.num(src.pedidosCanceladosEfectivo),
      pedidosCanceladosVale: this.num(src.pedidosCanceladosVale),

      totalEfectivoEnCaja: this.num(src.totalEfectivoEnCaja),
      totalTarjeta: this.num(src.totalTarjeta),
      totalTransferencia: this.num(src.totalTransferencia),
      totalVale: this.num(src.totalVale),

      totalRecargas: this.num(src.totalRecargas),
      abonosMonederos: this.num(src.abonosMonederos),
    };
  }


}

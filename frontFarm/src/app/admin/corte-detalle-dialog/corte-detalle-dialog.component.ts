import { Component, Inject } from '@angular/core';
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


export class CorteDetalleDialogComponent {
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
    private dialogRef: MatDialogRef<CorteDetalleDialogComponent>
  ) { }

  salir() {
    this.dialogRef.close(false);
  }

  autorizarTurnoExtra() {
    const corteId = this.data?.corte?._id;
    const headers = this.data?.headers;

    // ID del admin logueado (el que autoriza)
    const adminId = localStorage.getItem('user_id') || this.data?.usuarioId || '';

    if (!corteId || !adminId) return;

    this.cargando = true;
    this.http.put(
      `${environment.apiUrl}/cortes/${corteId}/autorizar-turno-extra/${adminId}`,
      {},
      { headers }
    ).subscribe({
      next: () => {
        this.cargando = false;
        this.dialogRef.close(true); // refrescar tabla
      },
      error: (e) => {
        this.cargando = false;
        console.error('Error autorizando turno extra', e);
        // mensajes más claros
        if (e.status === 403) Swal.fire('Permisos', 'Tu usuario no es admin o el token expiró.', 'warning');
        else Swal.fire('Error', e.error?.mensaje || 'No se pudo autorizar turno extra.', 'error');

      }
    });
  }


  finalizarTurnoCaja() {
    if (!this.data?.corte?._id) return;
    this.cargando = true;
    // mismo endpoint que el preview pero con grabar=true
    this.http.put(
      `${environment.apiUrl}/cortes/${this.data.corte._id}/finalizar/true`,
      {},
      { headers: this.data.headers }
    ).subscribe({
      next: () => {
        this.cargando = false;
        this.dialogRef.close(true); // refrescar tabla
      },
      error: (e) => {
        this.cargando = false;
        console.error('Error finalizando turno', e);
      }
    });
  }



private num(v: any): number { return v == null ? 0 : Number(v); }
get totales() {
  const src = this.data?.modo === 'cerrado'
    ? (this.data?.corte ?? {})
    : (this.data?.cortePreview ?? {});

  return {
    ventasEfectivo:       this.num(src.ventasEfectivo),
    ventasTarjeta:        this.num(src.ventasTarjeta),
    ventasTransferencia:  this.num(src.ventasTransferencia),
    ventasVale:           this.num(src.ventasVale),

    devolucionesEfectivo: this.num(src.devolucionesEfectivo),
    devolucionesVale:     this.num(src.devolucionesVale),

    pedidosEfectivo:      this.num(src.pedidosEfectivo),
    pedidosTarjeta:       this.num(src.pedidosTarjeta),
    pedidosTransferencia: this.num(src.pedidosTransferencia),
    pedidosVale:          this.num(src.pedidosVale),

    pedidosCanceladosEfectivo:  this.num(src.pedidosCanceladosEfectivo),
    pedidosCanceladosVale:      this.num(src.pedidosCanceladosVale),

    totalEfectivoEnCaja:  this.num(src.totalEfectivoEnCaja),
    totalTarjeta:         this.num(src.totalTarjeta),
    totalTransferencia:   this.num(src.totalTransferencia),
    totalVale:            this.num(src.totalVale),

    totalRecargas:        this.num(src.totalRecargas),
    abonosMonederos:      this.num(src.abonosMonederos),
  };
}


}

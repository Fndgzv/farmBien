import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faUserCheck, faEye, faFileInvoice, faTimes, faTrash } from '@fortawesome/free-solid-svg-icons';

import { FormBuilder, FormGroup } from '@angular/forms';
import { environment } from '../../../environments/environment';

import { CorteDetalleDialogComponent } from '../corte-detalle-dialog/corte-detalle-dialog.component';

type UsuarioRef = string | { _id: string; nombre?: string };
interface CorteCaja {
  _id: string;
  fechaInicio: string | Date;
  fechaFin: string | Date | null;
  usuario: UsuarioRef;
  farmacia: any;
  turnoExtraAutorizado: boolean;
  efectivoInicial: number;

  // ventas
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  ventasVale: number;
  devolucionesVale: number;
  devolucionesEfectivo: number;
  ventasRealizadas: number;
  devolucionesRealizadas: number;

  // pedidos
  pedidosEfectivo: number;
  pedidosTarjeta: number;
  pedidosTransferencia: number;
  pedidosVale: number;
  pedidosCanceladosEfectivo: number;
  pedidosCanceladosVale: number;
  pedidosLevantados: number;
  pedidosEntregados: number;
  pedidosCancelados: number;

  // totales
  totalEfectivoEnCaja: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalVale: number;
  totalRecargas: number;

  // total de abonos al monedero los clientes 
  abonosMonederos: number;
}

@Component({
  selector: 'app-cortes-de-caja',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FontAwesomeModule, MatTooltipModule, MatDialogModule],
  templateUrl: './cortes-de-caja.component.html',
  styleUrl: './cortes-de-caja.component.css'
})
export class CortesDeCajaComponent implements OnInit {

  fechaInicioDesde: string = '';
  fechaInicioHasta: string = '';
  filtroUsuario: string = '';

  filtroForm: FormGroup;
  cargando = false;
  faTimes = faTimes;

  farmaciaId!: string;
  usuario!: { id: string, rol: string, nombre: string };

  cortes: CorteCaja[] = [];

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private dialog: MatDialog,
    library: FaIconLibrary
  ) {
    const toYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const hoy = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);

    this.filtroForm = this.fb.group({
      fechaInicioDesde: [toYMD(ayer)],   // un día antes
      fechaInicioHasta: [toYMD(manana)], // un día después
      nombreUsuario: ['']
    });


    library.addIcons(faUserCheck, faEye, faFileInvoice, faTimes, faTrash);
  }

  ngOnInit(): void {
    this.buscarCortes();
  }

  buscarCortes(): void {
    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    const { fechaInicioDesde, fechaInicioHasta, nombreUsuario } = this.filtroForm.value;

    const params: any = {
      fechaInicioDesde,
      fechaInicioHasta,
    };
    if (nombreUsuario && nombreUsuario.trim().length > 2) {
      params.nombreUsuario = nombreUsuario.trim();
    }

    this.cargando = true;
    this.http.get(`${environment.apiUrl}/cortes/filtrados`, { headers, params }).subscribe({
      next: (resp: any) => {
        this.cortes = resp.cortes;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al buscar cortes:', err);
        Swal.fire('Error', 'No se pudieron cargar los cortes de caja.', 'error');
        this.cargando = false;
      }
    });
  }

  esFechaDeHoy(fecha: string | Date | null | undefined): boolean {
    if (!fecha) return false; // Fecha nula => no es hoy
    const hoy = new Date();
    const fechaCorte = new Date(fecha);
    return fechaCorte.getDate() === hoy.getDate() &&
      fechaCorte.getMonth() === hoy.getMonth() &&
      fechaCorte.getFullYear() === hoy.getFullYear();
  }

  mostrarDetalle(corte: any) {
    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    const usuarioIdDelCorte = typeof corte.usuario === 'string' ? corte.usuario : corte.usuario?._id;
    if (!usuarioIdDelCorte) {
      // Evita abrir el modal si no tenemos el usuario del corte
      Swal.fire({
        icon: 'warning',
        title: 'Dato faltante',
        text: 'No se encontró el usuario del corte.',
        timer: 1600,
        timerProgressBar: true,
        allowOutsideClick: false,
        allowEscapeKey: false
      });
      return;
    }

    // Caso 1: corte con fechaFin -> mostrar datos cerrados
    if (corte.fechaFin) {
      this.dialog.open(CorteDetalleDialogComponent, {
        width: '720px',
        disableClose: true,
        data: {
          modo: 'cerrado',
          corte,
          puedeAutorizarTurnoExtra: this.esFechaDeHoy(corte.fechaFin) && !corte.turnoExtraAutorizado,
          headers,
          usuarioId: usuarioIdDelCorte
        }
      }).afterClosed().subscribe(refrescar => {
        if (refrescar) this.buscarCortes();
      });
      return;
    }

    // Caso 2: fechaFin nula -> pedir preview (finalizar=false)
    this.http.put<any>(`${environment.apiUrl}/cortes/${corte._id}/finalizar/false`, {}, { headers })
      .subscribe({
        next: (preview) => {         
          const cortePreview = this.normalizarPreview(preview); // 👈 normaliza aquí
          console.log('corte de caja previo Normalizado:', cortePreview);
          this.dialog.open(CorteDetalleDialogComponent, {
            width: '720px',
            disableClose: true,
            data: {
              modo: 'previo',
              corte,
              cortePreview,
              headers,
              usuarioId: (typeof corte.usuario === 'string') ? corte.usuario : (corte.usuario?._id || '')
            }
          }).afterClosed().subscribe(refrescar => {
            if (refrescar) this.buscarCortes();
          });
        },
        error: (err) => {
          console.error('Error obteniendo preview de corte:', err);
          Swal.fire('Error', 'No se pudo obtener el previo del corte.', 'error');
        }
      });
  }

  eliminarCorte(corte: any) {
  if (!corte?._id) return;

  Swal.fire({
    title: 'Eliminar corte',
    html: `
      <div style="text-align:left">
        <p><b>Usuario:</b> ${corte.usuario?.nombre ?? 'N/A'}</p>
        <p><b>Inicio:</b> ${new Date(corte.fechaInicio).toLocaleString()}</p>
        <p><b>Fin:</b> ${corte.fechaFin ? new Date(corte.fechaFin).toLocaleString() : '—'}</p>
      </div>
      <p style="margin-top:8px;color:#b91c1c;">Esta acción no se puede deshacer.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#d33'
  }).then((res) => {
    if (!res.isConfirmed) return;

    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    this.cargando = true;
    this.http.delete(`${environment.apiUrl}/cortes/${corte._id}`, { headers })
      .subscribe({
        next: (resp: any) => {
          this.cargando = false;
          Swal.fire({
          icon: 'success',
          title: 'Eliminado',
          text: 'Corte de caja eliminado correctamente.',
          timer: 1600,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false
        });
          
          this.buscarCortes();
        },
        error: (err) => {
          this.cargando = false;
          const msg = err?.error?.mensaje || 'No se pudo eliminar el corte';
          Swal.fire('Error', msg, 'error');
        }
      });
  });
}

esEliminable(corte: any): boolean {
  return !!corte?.fechaFin; // solo eliminable si tiene fechaFin
}


/** Acepta distintas formas de respuesta y devuelve el shape que espera el diálogo */
private normalizarPreview(resp: any) {
  // 1) Encuentra el nodo que realmente trae los totales
  const root =
    resp?.preview ??
    resp?.data ??
    resp?.totales ??
    resp?.resumen ??
    resp?.result ??
    resp?.corte ?? // algunos devuelven { corte: {...} }
    resp;

  // Si aún así no hay nada util, devuelve todo en 0
  if (!root || typeof root !== 'object') {
    return {
      ventasEfectivo: 0, ventasTarjeta: 0, ventasTransferencia: 0, ventasVale: 0,
      devolucionesEfectivo: 0, devolucionesVale: 0,
      pedidosEfectivo: 0, pedidosTarjeta: 0, pedidosTransferencia: 0, pedidosVale: 0,
      pedidosCanceladosEfectivo: 0, pedidosCanceladosVale: 0,
      totalEfectivoEnCaja: 0, totalTarjeta: 0, totalTransferencia: 0, totalVale: 0,
      totalRecargas: 0, abonosMonederos: 0,
    };
  }

  // 2) Helper para tomar el primer campo definido de una lista de alias
  const pick = (obj: any, keys: string[]) => {
    for (const k of keys) {
      if (obj?.[k] != null) return obj[k];
    }
    return undefined;
  };

  // 3) Conversión robusta a number (acepta strings y reemplaza comas decimales)
  const n = (v: any) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = v.trim().replace(/\s/g, '').replace(',', '.');
      const num = Number(t);
      return isNaN(num) ? 0 : num;
    }
    return Number(v) || 0;
  };

  // 4) Si viene anidado de otra forma (p. ej. { totales: {...} } dentro de root)
  const src =
    (typeof root.totales === 'object' ? root.totales : undefined) ??
    (typeof root.resumen === 'object' ? root.resumen : undefined) ??
    root;

  // 5) Mapear con alias (Monedero/Vales, etc.)
  return {
    // Ventas
    ventasEfectivo:       n(pick(src, ['ventasEfectivo', 'ventas_efectivo', 'ventasEfe'])),
    ventasTarjeta:        n(pick(src, ['ventasTarjeta', 'ventas_tarjeta', 'ventasTj'])),
    ventasTransferencia:  n(pick(src, ['ventasTransferencia', 'ventas_transferencia', 'ventasTransf'])),
    ventasVale:           n(pick(src, ['ventasVale', 'ventasMonedero', 'ventas_monedero', 'ventasVales'])),

    // Devoluciones
    devolucionesEfectivo: n(pick(src, ['devolucionesEfectivo', 'devoluciones_efectivo', 'devEfectivo'])),
    devolucionesVale:     n(pick(src, ['devolucionesVale', 'devolucionesMonedero', 'devoluciones_monedero', 'devVales'])),

    // Pedidos (ingresos)
    pedidosEfectivo:      n(pick(src, ['pedidosEfectivo', 'pedidos_efectivo'])),
    pedidosTarjeta:       n(pick(src, ['pedidosTarjeta', 'pedidos_tarjeta'])),
    pedidosTransferencia: n(pick(src, ['pedidosTransferencia', 'pedidos_transferencia'])),
    pedidosVale:          n(pick(src, ['pedidosVale', 'pedidosMonedero', 'pedidos_monedero'])),

    // Pedidos cancelados (egresos)
    pedidosCanceladosEfectivo: n(pick(src, ['pedidosCanceladosEfectivo', 'pedidos_cancelados_efectivo'])),
    pedidosCanceladosVale:     n(pick(src, ['pedidosCanceladosVale', 'pedidosCanceladosMonedero', 'pedidos_cancelados_monedero'])),

    // Totales
    totalEfectivoEnCaja:  n(pick(src, ['totalEfectivoEnCaja', 'total_efectivo_en_caja', 'totalEfectivo'])),
    totalTarjeta:         n(pick(src, ['totalTarjeta', 'total_tarjeta'])),
    totalTransferencia:   n(pick(src, ['totalTransferencia', 'total_transferencia'])),
    totalVale:            n(pick(src, ['totalVale', 'totalMonedero', 'total_monedero'])),

    totalRecargas:        n(pick(src, ['totalRecargas', 'recargas', 'total_recargas'])),
    abonosMonederos:      n(pick(src, ['abonosMonederos', 'abonosMonedero', 'abonos_monedero'])),
  };
}


}

// src/app/services/reportes.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';

import { Observable } from 'rxjs';
import {
  ResumenVentasResponse,
  VentasProductoDetalleResponse
} from '../models/reportes.models';

import { environment } from '../../environments/environment';

export interface ConsultarVentasParams {
  farmaciaId?: string;
  fechaInicial?: string; // 'YYYY-MM-DD'
  fechaFinal?: string;   // 'YYYY-MM-DD'
  clienteId?: string;
  usuarioId?: string;
  totalDesde?: number | string;
  totalHasta?: number | string;
  page?: number;
  limit?: number;
}

export interface ConsultarVentasResponse {
  ok: boolean;
  filtrosAplicados: any;
  paginacion: { page: number; limit: number; totalRegistros: number; totalPaginas: number; };
  resumen: { sumaTotalFiltro: number; };
  ventas: any[];
}
@Injectable({ providedIn: 'root' })

export class ReportesService {
  private readonly url = `${environment.apiUrl}/reportes`;

  constructor(private http: HttpClient) { }

  getVentasPorFarmacia(params: {
    farmaciaId?: string;
    fechaIni?: string | Date;
    fechaFin?: string | Date;
  }): Observable<ResumenVentasResponse> {
    const httpParams = this.buildParams(params);
    return this.http.get<ResumenVentasResponse>(`${this.url}/ventas-por-farmacia`, { params: httpParams });
  }

  // Helpers
  private buildParams(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      const value = v instanceof Date ? this.toLocalISODate(v) : String(v);
      p = p.set(k, value);
    });
    return p;
  }

  private toLocalISODate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }


  getVentasProductoDetalle(params: {
    farmaciaId?: string;
    productoId?: string;
    codigoBarras?: string;
    nombre?: string;
    fechaIni?: string | Date;
    fechaFin?: string | Date;
  }) {
    const httpParams = this.buildParams(params);
    return this.http.get<VentasProductoDetalleResponse>(
      `${this.url}/ventas-producto-detalle`,
      { params: httpParams }
    );
  }
// src/app/services/reportes.service.ts

getVentas(params: ConsultarVentasParams) {
  // ⚠️ Asegúrate que environment.apiUrl incluya el prefijo correcto.
  // Si en server haces app.use('/api', router), entonces apiUrl debe ser 'http://localhost:5000/api'
  const url = `${this.url}/ventas/consultar`;

  // Token para rutas con authMiddleware
  const token = localStorage.getItem('auth_token') || '';
  const headers = new HttpHeaders({ 'x-auth-token': token });

  let hp = new HttpParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v));
  });

  return this.http.get<ConsultarVentasResponse>(url, { params: hp, headers });
}


}

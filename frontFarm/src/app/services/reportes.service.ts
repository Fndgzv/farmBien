// src/app/services/reportes.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ResumenVentasResponse,
  VentasProductoDetalleResponse 
} from '../models/reportes.models';

import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly url = `${environment.apiUrl}/reportes`;

  constructor(private http: HttpClient) {}

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

}

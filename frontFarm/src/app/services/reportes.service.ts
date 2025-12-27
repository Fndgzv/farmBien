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
  resumen: {
    sumaTotalFiltro: number;
    sumaCantidadProductos?: number;
    sumaTotalDescuento?: number;
    sumaTotalMonederoCliente?: number;
    sumaCosto?: number;
    sumaUtilidad?: number;
  };
  ventas: any[];
}

export interface ResumenUtilidadesRow {
  concepto: 'Ventas' | 'Pedidos' | 'Devoluciones' | 'Cancelaciones';
  cantidad: number;
  importe: number;
  costo: number;
  utilidad: number;
}

export interface ResumenUtilidadesParams {
  fechaIni?: string | Date;   // YYYY-MM-DD o Date
  fechaFin?: string | Date;   // YYYY-MM-DD o Date
  farmaciaId?: string;
}

export interface ResumenUtilidadesResponse {
  ok: boolean;
  reporte: string;
  rango: { fechaIni: string; fechaFin: string } | any;
  filtros: { farmaciaId: string | null };
  rows: ResumenUtilidadesRow[];
}
@Injectable({ providedIn: 'root' })

export class ReportesService {
  private readonly url = `${environment.apiUrl}/reportes`;

  constructor(private http: HttpClient) { }

  getVentasPorFarmacia(params: {
    farmaciaId?: string;
    productoId?: string;
    fechaIni?: string | Date;
    fechaFin?: string | Date;
    productoQ?: string;
    categoriaQ?: string;
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


  private toYmdLocal(v: any): string | undefined {
    if (!v) return undefined;

    if (typeof v === 'string') {
      // dd/MM/yyyy -> YYYY-MM-DD
      const m1 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
      // YYYY-MM-DD (o ISO al inicio) -> conserva los primeros 10
      const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
      return undefined;
    }

    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return undefined;

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  getVentas(p: ConsultarVentasParams) {
    const url = `${this.url}/ventas/consulta`;

    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    const obj: any = {
      farmaciaId: p.farmaciaId,
      clienteId: p.clienteId,
      usuarioId: p.usuarioId,
      totalDesde: p.totalDesde != null ? String(p.totalDesde) : undefined,
      totalHasta: p.totalHasta != null ? String(p.totalHasta) : undefined,
      // 💡 UNA SOLA normalización aquí:
      fechaInicial: this.toYmdLocal(p.fechaInicial),
      fechaFinal: this.toYmdLocal(p.fechaFinal),
      page: p.page != null ? String(p.page) : undefined,
      limit: p.limit != null ? String(p.limit) : undefined,
    };

    let params = new HttpParams();
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v !== undefined && v !== '') params = params.set(k, v);
    });

    return this.http.get<ConsultarVentasResponse>(url, { params, headers });
  }

  getResumenUtilidades(p: ResumenUtilidadesParams) {
    const url = `${this.url}/resumen-utilidades`;

    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    const obj: any = {
      fechaIni: this.toYmdLocal(p.fechaIni),
      fechaFin: this.toYmdLocal(p.fechaFin),
      farmaciaId: p.farmaciaId || undefined,
    };

    let params = new HttpParams();
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v !== undefined && v !== '') params = params.set(k, v);
    });

    return this.http.get<ResumenUtilidadesResponse>(url, { params, headers });
  }

  getUtilidadPorClientes(p: any) {
    const url = `${this.url}/utilidad-cliente`;
    const headers = new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });

    const obj: any = {
      fechaIni: this.toYmdLocal(p.fechaIni),
      fechaFin: this.toYmdLocal(p.fechaFin),
      clienteId: p.clienteId || undefined,
      CantClientes: p.CantClientes || p.cantClientes,
      orden: p.orden || 'utilidad',
      dir: p.dir || 'desc'
    };
    let params = new HttpParams();
    Object.keys(obj).forEach(k => { const v = obj[k]; if (v !== undefined && v !== '') params = params.set(k, v); });
    return this.http.get(url, { params, headers });
  }

  getUtilidadPorProductos(p: any) {
    const url = `${this.url}/utilidad-producto`;
    const headers = new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });

    const obj: any = {
      fechaIni: this.toYmdLocal(p.fechaIni),
      fechaFin: this.toYmdLocal(p.fechaFin),
      productoId: p.productoId || undefined,
      cantProductos: p.cantProductos,
      orden: p.orden || 'utilidad',
      dir: p.dir || 'desc',
      farmaciaId: p.farmaciaId || undefined
    };
    let params = new HttpParams();
    Object.keys(obj).forEach(k => { const v = obj[k]; if (v !== undefined && v !== '') params = params.set(k, v); });
    return this.http.get(url, { params, headers });
  }

  getUtilidadPorUsuarios(p: any) {
    const url = `${this.url}/utilidad-usuario`; // ajusta si tu endpoint se llama distinto
    const headers = new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });

    const obj: any = {
      fechaIni: this.toYmdLocal(p.fechaIni),
      fechaFin: this.toYmdLocal(p.fechaFin),
      usuarioId: p.usuarioId || undefined,
      orden: p.orden || 'utilidad',
      dir: p.dir || 'desc'
    };
    let params = new HttpParams();
    Object.keys(obj).forEach(k => { const v = obj[k]; if (v !== undefined && v !== '') params = params.set(k, v); });
    return this.http.get(url, { params, headers });
  }


  ventasPorTiempo(params: {
    desde: string;
    hasta: string;
    escala: string;
    farmacia: string;
  }) {
    let httpParams = new HttpParams();

    Object.entries(params).forEach(([k, v]) => {
      httpParams = httpParams.set(k, v);
    });

    return this.http.get<any[]>(`${this.url}/ingresos-por-tiempo`, {
      params: httpParams
    });
  }

  rankingProductos(params: any) {
    return this.http.get<any[]>(
      `${this.url}/ranking-productos`,
      { params }
    );
  }

  rankingProductosCount(params: any) {
    return this.http.get<{ total: number }>(
      `${this.url}/ranking-productos/count`,
      { params }
    );
  }

rankingProductosKPIs(params: any) {
  return this.http.get<any>(`${this.url}/ranking-productos-kpis`, { params });
}



}


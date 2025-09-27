// src/app/services/pedidos.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Pedido {
  _id: string;
  folio: string;
  estado: string;
  fechaPedido: string;
  descripcion: string;
  costo: number;
  // …otros campos que devuelve el backend…
}

export type PedidosResponse = {
  paginacion: any;
  pedidos: any[];
  resumen: any;
};

export interface ObtenerPedidosArgs {
  farmaciaId: string;
  fechaIni?: string;
  fechaFin?: string;
  folio?: string;
  estado?: string;
  descripcion?: string;
  descripcionMinima?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string; // 'cliente.nombre'|'descripcion'|'estado'|'fechaPedido'|'costo'|'total'|'aCuenta'|'resta'
  sortDir?: 'asc' | 'desc';
  clienteNombre?: string;
  clienteNull?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  // Ajusta si tu base es environment.api o environment.apiUrl
  private apiUrl = `${environment.apiUrl}/pedidos/`;

  constructor(private http: HttpClient) {}

  // ================== SOBRECARGAS ==================
  obtenerPedidos(args: ObtenerPedidosArgs): Observable<PedidosResponse>;
  obtenerPedidos(
    farmaciaId: string,
    fechaIni?: string,
    fechaFin?: string,
    folio?: string,
    estado?: string,
    descripcion?: string,
    descripcionMinima?: boolean
  ): Observable<PedidosResponse>;

  // ================== IMPLEMENTACIÓN ÚNICA ==================
  obtenerPedidos(a1: any, ...rest: any[]): Observable<PedidosResponse> {
    let args: ObtenerPedidosArgs;

    if (typeof a1 === 'string') {
      // ---- Firma legacy (posicional) ----
      const [fechaIni, fechaFin, folio, estado, descripcion, descripcionMinima] = rest;
      args = {
        farmaciaId: a1,
        fechaIni,
        fechaFin,
        folio,
        estado,
        descripcion,
        descripcionMinima,
      };
    } else {
      // ---- Nueva firma (objeto) ----
      args = a1 as ObtenerPedidosArgs;
    }

    let params = new HttpParams().set('farmacia', args.farmaciaId);

    const setDate = (v?: string, key?: 'fechaInicio' | 'fechaFin') => {
      if (!v || !key) return;
      const d = new Date(v);
      params = params.set(key, d.toISOString().slice(0, 10)); // YYYY-MM-DD
    };

    setDate(args.fechaIni, 'fechaInicio');
    setDate(args.fechaFin, 'fechaFin');

    if (args.folio && /^[A-Za-z0-9]{6}$/.test(args.folio)) {
      params = params.set('folio', args.folio);
    }
    if (args.estado) {
      params = params.set('estado', args.estado);
    }
    if (args.descripcion) {
      params = params.set('descripcion', args.descripcion);
    }
    if (args.descripcionMinima !== undefined) {
      params = params.set('descripcionMinima', String(!!args.descripcionMinima));
    }

    // ====== Nuevos parámetros ======
    if (args.page)          params = params.set('page', String(args.page));
    if (args.limit)         params = params.set('limit', String(args.limit));
    if (args.sortBy)        params = params.set('sortBy', args.sortBy);
    if (args.sortDir)       params = params.set('sortDir', (args.sortDir || 'desc').toLowerCase());
    if (args.clienteNombre) params = params.set('clienteNombre', args.clienteNombre);
    if (args.clienteNull !== undefined) {
      params = params.set('clienteNull', String(!!args.clienteNull));
    }

    return this.http.get<PedidosResponse>(this.apiUrl, { params });
  }

  agregarPedido(data: any) {
    return this.http.post<{ mensaje: string; pedido: any }>(this.apiUrl, data);
  }

  surtirPedido(data: any) {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'x-auth-token': token ? token : '',
      'Content-Type': 'application/json',
    });
    return this.http.put(`${this.apiUrl}surtir`, data, { headers });
  }

  cancelarPedido(data: any) {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'x-auth-token': token ? token : '',
      'Content-Type': 'application/json',
    });
    return this.http.put(`${this.apiUrl}cancelar`, data, { headers });
  }

  actualizarCostoPedido(pedidoId: string, nuevoCosto: number) {
    return this.http.patch<{ pedido: Pedido }>(
      `${this.apiUrl}actualizar-costo/${pedidoId}`,
      { costo: nuevoCosto }
    );
  }
}

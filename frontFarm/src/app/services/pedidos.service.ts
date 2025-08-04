// services/pedidos.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';

import { environment } from '../../environments/environment';


export interface Pedido {
  _id: string;
  folio: string;
  estado: string;
  fechaPedido: string;
  // …otros campos que devuelve el backend…
}

@Injectable({
  providedIn: 'root'
})

export class PedidosService {
  private apiUrl = `${environment.apiUrl}/pedidos/`;

  constructor(private http: HttpClient) { }

  obtenerPedidos(
    farmaciaId: string,
    fechaIni?: string,
    fechaFin?: string,
    folio?: string,
    estado?: string,
    descripcion?: string
  ) {
    let params = new HttpParams()
      .set('farmacia', farmaciaId);

    if (fechaIni) {
      const fechaInicioDate = new Date(fechaIni); // convierte el string a Date
      params = params.set('fechaInicio', fechaInicioDate.toISOString().slice(0, 10));
    }
    if (fechaFin) {
      const fechaFinDate = new Date(fechaFin); // convierte el string a Date
      params = params.set('fechaFin', fechaFinDate.toISOString().slice(0, 10));
    }

    if (folio && /^[A-Za-z0-9]{6}$/.test(folio)) {
      params = params.set('folio', folio);
    }

    if (estado) {
      params = params.set('estado', estado);
    }

    if (descripcion) {
      params = params.set('descripcion', descripcion);
    }

    return this.http.get<{ pedidos: Pedido[] }>(
      `${this.apiUrl}`, { params }
    );
  }


  agregarPedido(data: any) {
    return this.http.post<{ mensaje: string; pedido: any }>(
      `${this.apiUrl}`,
      data
    );
  }

  surtirPedido(data: any) {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'x-auth-token': token ? token : '',
      'Content-Type': 'application/json'
    });

    return this.http.put(`${this.apiUrl}surtir`, data, { headers });
  }

  cancelarPedido(data: any) {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'x-auth-token': token ? token : '',
      'Content-Type': 'application/json'
    });

    return this.http.put(`${this.apiUrl}cancelar`, data, { headers });
  }


}
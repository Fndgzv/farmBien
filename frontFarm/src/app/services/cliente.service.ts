// services/cliente.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Cliente {
  _id?: string;
  telefono: string;
  nombre: string;
  direccion?: string;
  totalMonedero?: number;
}

@Injectable({ providedIn: 'root' })
export class ClienteService {

  private apiUrl = `${environment.apiUrl}/clientes`;

  constructor(private http: HttpClient) { }

  getClientes() {
    const token = localStorage.getItem('auth_token'); // ✅ Obtener el token almacenado
    if (!token) {
      console.error('❌ No hay token disponible, cancelando petición.');
      return throwError(() => new Error('No hay token de autenticación.'));
    }

    const headers = new HttpHeaders({
      'x-auth-token': token // ✅ Enviar el token en los headers
    });

    return this.http.get<any[]>(this.apiUrl, { headers });
  }

  crearCliente(cliente: any): Observable<any> {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.error('❌ No hay token disponible.');
      return throwError(() => new Error('No hay token de autenticación.'));
    }

    const headers = new HttpHeaders({ 'x-auth-token': token, 'Content-Type': 'application/json' });

    return this.http.post<any>(this.apiUrl, cliente, { headers });
  }

  buscarClientePorTelefono(telefono: string) {
    return this.http.get<any>(`${this.apiUrl}/telefono/${telefono}`);
  }

  buscarClientesPorNombre(termino: string, limit = 20) {
    const params = new HttpParams().set('q', termino).set('limit', limit.toString());
    return this.http.get<{ ok: boolean; rows: any[] }>(`${this.apiUrl}/buscar`, { params });
  }

  getClienteById(id: string) {
    return this.http.get<any>(`${this.apiUrl}/id/${id}`);
  }

  obtenerClientes(): Observable<Cliente[]> {
    return this.http.get<Cliente[]>(`${this.apiUrl}`);
  }

  listar(params: any): Observable<any> {
    const token = localStorage.getItem('auth_token') || '';
    const headers = token ? new HttpHeaders({ 'x-auth-token': token }) : undefined;
    return this.http.get(this.apiUrl, { params, headers });
  }

  crear(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  actualizar(id: string, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}`, data);
  }

  // ===== Subtablas =====
  ventas(id: string, params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/ventas`, { params });
  }
  pedidos(id: string, params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/pedidos`, { params });
  }
  devoluciones(id: string, params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/devoluciones`, { params });
  }
  cancelaciones(id: string, params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/cancelaciones`, { params });
  }
  monedero(id: string, params: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/monedero`, { params });
  }
}


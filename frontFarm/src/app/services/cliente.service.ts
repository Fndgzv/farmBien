// services/cliente.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { catchError, map, Observable, of, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { ClienteLite } from '../reportes-devoluciones/types';

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

  private headers() {
    return new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });
  }

  private toClienteLite = (x: any): ClienteLite => ({
    _id: String(x?._id ?? x?.id ?? ''),
    nombre: String(x?.nombre ?? ''),
    telefono: x?.telefono ? String(x.telefono) : undefined,
  });

  private withTz(params: any = {}) {
    return new HttpParams({ fromObject: { ...params, tz: String(new Date().getTimezoneOffset()) } });
  }

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

  searchClientes(q: string, limit = 50): Observable<ClienteLite[]> {
    const url = `${environment.apiUrl}/clientes/buscar`;
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<any>(url, { params }).pipe(
      map(r => (r?.data ?? r?.rows ?? r ?? []).map((x: any) => ({
        _id: String(x._id),
        nombre: x.nombre || ''
      }))),
      // (opcional) filtro/limit local
      map(list => {
        const ql = q.toLowerCase();
        return list.filter((c: { nombre: string; }) => c.nombre.toLowerCase().includes(ql)).slice(0, 10);
      }),
      catchError(() => of<ClienteLite[]>([]))
    );
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


  listar(params: { q?: string; page?: number; limit?: number; sortBy?: string; sortDir?: string }) {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 20));

    if (params.q) httpParams = httpParams.set('q', params.q);
    if (params.sortBy) httpParams = httpParams.set('sortBy', params.sortBy);
    if (params.sortDir) httpParams = httpParams.set('sortDir', params.sortDir);

    return this.http.get(this.apiUrl, { params: httpParams });
  }


  crear(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  actualizar(id: string, data: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}`, data);
  }

  // ===== Subtablas =====
  ventas(id: string, p: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/ventas`, { params: this.withTz(p) });
  }
  pedidos(id: string, p: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/pedidos`, { params: this.withTz(p) });
  }
  devoluciones(id: string, p: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/devoluciones`, { params: this.withTz(p) });
  }
  cancelaciones(id: string, p: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/cancelaciones`, { params: this.withTz(p) });
  }
  monedero(id: string, p: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/monedero`, { params: this.withTz(p) });
  }
}


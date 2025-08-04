// services/cliente.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
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

  getClienteById(id: string) {
  return this.http.get<any>(`${this.apiUrl}/id/${id}`);
}

}

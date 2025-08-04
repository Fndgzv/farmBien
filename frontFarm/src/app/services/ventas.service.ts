// services/ventas.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VentasService {
  private apiUrl = `${environment.apiUrl}/ventas`;

  constructor(private http: HttpClient) { }

  crearVenta(venta: any): Observable<any> {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-auth-token': token || '' // ✅ Token requerido para autorización
    });
    return this.http.post(`${this.apiUrl}`, venta, { headers });
  }

  obtenerHistorialCompras(clienteId: string, productoId: string): Observable<any[]> {
    const token = localStorage.getItem('auth_token'); // ✅ Obtener token de autenticación
    if (!token) {
      console.error('❌ No hay token disponible.');
      return new Observable(observer => observer.next([])); // Devolver array vacío si no hay token
    }

    const headers = new HttpHeaders({
      'x-auth-token': token
    });

    return this.http.get<any[]>(`${this.apiUrl}/historial/${clienteId}/${productoId}`, { headers });
  }

}
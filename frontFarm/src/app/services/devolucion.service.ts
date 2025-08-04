import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DevolucionService {
  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  buscarVentaPorCodigo(codigo: string) {
    return this.http.get<any>(`${this.apiUrl}/devoluciones/buscarVenta/${codigo}`);
  }

  registrarDevolucion(data: any) {
    return this.http.post<any>(`${this.apiUrl}/devoluciones/registrar`, data);
  }

  obtenerVentasRecientes(farmaciaId: string, folio?: string) {
    let params = new HttpParams();
    if (folio && /^[A-Za-z0-9]{6}$/.test(folio)) {
      params = params.set('folio', folio);
    }
    return this.http.get<any[]>(
      `${this.apiUrl}/ventasRecientes/${farmaciaId}`,
      { params }
    );
  }
  
}

// src/app/services/compra.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CompraService {

  private base = `${environment.apiUrl}/compras`;

  constructor(private http: HttpClient) { }

  getCompras() {
    return this.http.get<any[]>(this.base);
  }

  crearCompra(payload: any) {
    return this.http.post<any>(this.base, payload);
  }

  listar(params: {
    page?: number; limit?: number;
    fechaIni?: string; fechaFin?: string;
    proveedor?: string;
    importeDesde?: number | string;
    importeHasta?: number | string;
  }): Observable<any> {
    let hp = new HttpParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v));
    });
    return this.http.get(`${this.base}/consulta`, { params: hp });
  }
}

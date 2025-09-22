// src/app/reportes-compras/reportes-compras.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map, catchError, of } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { ResumenResp, AgrupadoResp } from './types';

@Injectable({ providedIn: 'root' })
export class ReportesComprasService {
  private base = `${environment.apiUrl}/reportes`;

  constructor(private http: HttpClient) {}

  private headers() {
    return new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });
  }

  private params(obj: any): HttpParams {
    let p = new HttpParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') p = p.set(k, String(v));
    });
    return p;
  }

  getResumen(p: any): Observable<ResumenResp> {
    return this.http.get<ResumenResp>(`${this.base}/compras-resumen`, {
      params: this.params(p),
      headers: this.headers(),
    });
  }

  getAgrupado(tipo: 'proveedor'|'producto'|'categoria'|'usuario', p: any): Observable<AgrupadoResp> {
    return this.http.get<AgrupadoResp>(`${this.base}/compras-${tipo}`, {
      params: this.params(p),
      headers: this.headers(),
    });
  }

  // --- Búsquedas amigables ---
  searchProveedores(q: string) {
    const url = `${environment.apiUrl}/proveedores?buscar=${encodeURIComponent(q)}&limit=10`;
    return this.http.get<any>(url, { headers: this.headers() }).pipe(
      tap({ error: () => {} }),
      switchMap((resp: any) => of(resp?.data ?? resp?.rows ?? resp ?? []))
    );
  }


searchProductos(q: string) {
  const url = `${environment.apiUrl}/productos/search?q=${encodeURIComponent(q)}&limit=50`;
  return this.http.get<any>(url, { headers: this.headers() }).pipe(
    map(r => r?.data ?? r?.rows ?? r ?? []),
    catchError(() => of([]))
  );
}



}

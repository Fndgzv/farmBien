import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { catchError, map, Observable, of, switchMap, tap } from 'rxjs';
import { ResumenResp, AgrupadoResp } from './types';

@Injectable({ providedIn: 'root' })
export class ReportesCancelacionesService {
  private base = `${environment.apiUrl}/reportes`;
  constructor(private http: HttpClient) { }

  private headers() {
    return new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });
  }

  private params(obj: any): HttpParams {
    let p = new HttpParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        p = p.set(k, String(v));
      }
    });
    return p;
  }

  // === Endpoints ===
  getResumen(p: any): Observable<ResumenResp> {
    return this.http.get<ResumenResp>(`${this.base}/cancelaciones-resumen`, {
      params: this.params(p), headers: this.headers(),
    });
  }

  getAgrupado(tipo: 'usuario' | 'farmacia' | 'cliente', p: any): Observable<AgrupadoResp> {
    // /api/reportes/cancelaciones-{usuario|farmacia|cliente}
    return this.http.get<AgrupadoResp>(`${this.base}/cancelaciones-${tipo}`, {
      params: this.params(p), headers: this.headers(),
    });
  }

  // === Buscador de clientes (sugerencias) ===
  searchClientes(q: string) {
    const url = `${environment.apiUrl}/clientes/buscar?q=${encodeURIComponent(q)}&limit=50`;
    return this.http.get<any>(url, { headers: this.headers() }).pipe(
      map(resp => resp?.data ?? resp?.rows ?? resp ?? []),
      catchError(() => of([]))
    );
  }

}

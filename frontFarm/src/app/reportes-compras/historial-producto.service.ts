import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface HistProdRow {
  fecha: string;
  proveedorId: string;
  proveedor: string;
  productoId: string;
  producto: string;
  codigoBarras: string;
  lote: string;
  fechaCaducidad: string | null;
  costoUnitario: number;
  cantidad: number;
  costoTotal: number;
  precioUnitario: number;
}

export interface HistProdResp {
  ok: boolean;
  rango: { fechaIni: string; fechaFin: string };
  filtros: any;
  page: number;
  limit: number;
  total: number;
  pages: number;
  columns: string[];
  rows: HistProdRow[];
  footer: {
    compras: number;
    piezas: number;
    costoTotal: number;
    costoUnitProm: number;
    precioUnitProm: number;
  };
}

@Injectable({ providedIn: 'root' })
export class HistorialProductoService {
  private base = `${environment.apiUrl}/reportes`;
  constructor(private http: HttpClient) {}

  private headers() {
    return new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });
  }

  private buildParams(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const s = String(v).trim();
      if (s !== '') p = p.set(k, s);
    });
    return p;
  }

  getHistorial(params: any): Observable<HistProdResp> {
    return this.http.get<HistProdResp>(`${this.base}/compras-historial-producto`, {
      headers: this.headers(),
      params: this.buildParams(params),
    });
  }


searchProductos(q: string) {
  const url = `${environment.apiUrl}/productos/search?q=${encodeURIComponent(q)}&limit=50`;
  return this.http.get<any>(url, { headers: this.headers() }).pipe(
    map(r => r?.data ?? r?.rows ?? r ?? []),
    catchError(() => of([]))
  );
}

}

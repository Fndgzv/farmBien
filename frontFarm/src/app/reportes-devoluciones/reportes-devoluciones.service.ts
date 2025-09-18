// src/app/reportes-devoluciones/reportes-devoluciones.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { catchError, map, Observable, of } from 'rxjs';
import { ClienteLite, ListadoResp, ProductoLite } from './types';

type ProdLite = { _id: string; nombre?: string; codigoBarras?: string };

@Injectable({ providedIn: 'root' })
export class ReportesDevolucionesService {
  private base = `${environment.apiUrl}/reportes`;
  constructor(private http: HttpClient) { }

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

  getResumen(p: any): Observable<any> {
    return this.http.get(`${this.base}/devoluciones-resumen`, { params: this.params(p), headers: this.headers() });
  }

  getAgrupado(tipo: 'producto' | 'motivo' | 'cliente' | 'usuario' | 'farmacia', p: any): Observable<{ rows: any[] }> {
    return this.http.get<{ rows: any[] }>(`${this.base}/devoluciones-${tipo}`, { params: this.params(p), headers: this.headers() });
  }

  getListado(p: any): Observable<ListadoResp> {
    return this.http.get<ListadoResp>(`${this.base}/devoluciones-listado`, { params: this.params(p), headers: this.headers() });
  }

  // ---------- Helpers de filtrado local ----------
  private uniqById<T extends { _id?: any }>(arr: T[]): T[] {
    const seen = new Set(); const out: T[] = [];
    for (const x of arr || []) { const k = String(x?._id ?? ''); if (!seen.has(k)) { seen.add(k); out.push(x); } }
    return out;
  }

    // ---- Normalizadores
  private toProdLite = (x: any): ProductoLite => ({
    _id: String(x?._id ?? x?.id ?? ''),
    nombre: String(x?.nombre ?? ''),                  // ¡siempre string!
    codigoBarras: x?.codigoBarras ? String(x.codigoBarras) : undefined,
  });
  private toClienteLite = (x: any): ClienteLite => ({
    _id: String(x?._id ?? x?.id ?? ''),
    nombre: String(x?.nombre ?? ''),
    telefono: x?.telefono ? String(x.telefono) : undefined,
  });

  // ---- Filtro local para productos (por si el back no filtra)
  private filtrarProductos(list: ProductoLite[], q: string, byCB: boolean): ProductoLite[] {
    const term = q.trim();
    const termLower = term.toLowerCase();
    const filtered = (list || []).filter(p => {
      const nombre = (p.nombre || '').toLowerCase();
      const cb = String(p.codigoBarras || '');
      return byCB ? (cb.startsWith(term) || cb.includes(term))
                  : (nombre.includes(termLower) || cb.includes(term));
    });
    // orden útil
    filtered.sort((a, b) => {
      const aN = (a.nombre || '').toLowerCase(), bN = (b.nombre || '').toLowerCase();
      const aCb = String(a.codigoBarras || ''),   bCb = String(b.codigoBarras || '');
      const ax = byCB ? (aCb.startsWith(term) ? 0 : 1) : (aN.startsWith(termLower) ? 0 : 1);
      const bx = byCB ? (bCb.startsWith(term) ? 0 : 1) : (bN.startsWith(termLower) ? 0 : 1);
      if (ax !== bx) return ax - bx;
      return aN.localeCompare(bN, 'es');
    });
    // top 10
    const seen = new Set<string>();
    const out: ProductoLite[] = [];
    for (const p of filtered) {
      const k = p._id;
      if (!seen.has(k)) { seen.add(k); out.push(p); if (out.length >= 10) break; }
    }
    return out;
  }

  // ---- Autocomplete PRODUCTOS
  searchProductos(q: string, byCB = false): Observable<ProductoLite[]> {
    const base = `${environment.apiUrl}/productos`;
    const headers = this.headers();
    const paramsA = new HttpParams().set(byCB ? 'cb' : 'q', q).set('limit','50');

    return this.http.get<any>(`${base}/buscar`, { headers, params: paramsA }).pipe(
      map(r => (r?.data ?? r?.rows ?? r ?? []).map(this.toProdLite)),
      map(list => this.filtrarProductos(list, q, byCB)),
      catchError(_ => {
        if (byCB) {
          const p = new HttpParams().set('codigoBarras', q);
          return this.http.get<any>(`${base}/por-codigo`, { headers, params: p }).pipe(
            map(r => (r ? [this.toProdLite(r)] : [])),
            catchError(() => of<ProductoLite[]>([]))
          );
        } else {
          const p = new HttpParams().set('search', q).set('limit','50');
          return this.http.get<any>(base, { headers, params: p }).pipe(
            map(r => (r?.data ?? r?.rows ?? r ?? []).map(this.toProdLite)),
            map(list => this.filtrarProductos(list, q, byCB)),
            catchError(() => of<ProductoLite[]>([]))
          );
        }
      })
    );
  }

  // ---- Autocomplete CLIENTES (tipado)
  searchClientes(q: string): Observable<ClienteLite[]> {
    const url = `${environment.apiUrl}/clientes/buscar`;
    const params = new HttpParams().set('q', q).set('limit','50');
    return this.http.get<any>(url, { headers: this.headers(), params }).pipe(
      map(r => (r?.data ?? r?.rows ?? r ?? []).map(this.toClienteLite)),
      map(list => {
        const ql = q.toLowerCase();
        return list.filter((c: { nombre: string; telefono: any; }) =>
          c.nombre.toLowerCase().includes(ql) ||
          String(c.telefono || '').includes(q)
        ).slice(0, 10);
      }),
      catchError(() => of<ClienteLite[]>([]))
    );
  }
}



import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type VentasPorFarmacia = { farmaciaId?: string; farmacia: string; vendidos: number };
export interface ProductoLite { _id: string; nombre: string; codigoBarras?: string; }
export interface ProveedorLite { _id: string; nombre: string; }

export type ReporteRow = {
  fecCompra: string;
  proveedor: string;
  producto: string;
  cb: string;
  lote: string;
  existencia: number;
  caducidad: string | null;
  costo: number;
  cantidad: number;
  costoTotal: number;
  ventasPorFarmacia: VentasPorFarmacia[];
};

export type ReporteResponse = {
  nota?: string;
  filtros?: any;
  paginacion: { page: number; limit: number; total: number };
  resumen?: {
    sumCantidad?: number;
    sumExistencia?: number;
    avgVendidosFarmacia?: number;
  };
  rows: ReporteRow[];
};

@Injectable({ providedIn: 'root' })
export class ReportesComprasVentasService {
  private api = environment.apiUrl;

  constructor(private http: HttpClient) { }

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json' });
  }

  getReporte(params: {
    fechaIni?: string; fechaFin?: string;
    productoId?: string; proveedorId?: string;
    codigoBarras?: string; lote?: string;
    sortBy?: string; sortDir?: 'asc' | 'desc';
    page?: number; limit?: number;
  }): Observable<ReporteResponse> {
    let hp = new HttpParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v));
    });
    return this.http
      .get<ReporteResponse>(`${this.api}/reportes/compras-con-ventas`, { headers: this.headers(), params: hp })
      .pipe(
        map((r: any) => ({
          paginacion: r?.paginacion ?? { page: 1, limit: 20, total: 0 },
          rows: r?.rows ?? [],
          resumen: {
            sumCantidad: r?.resumen?.sumCantidad ?? 0,
            sumExistencia: r?.resumen?.sumExistencia ?? 0,
            avgVendidosFarmacia: r?.resumen?.avgVendidosFarmacia ?? 0,
          }
        })),
        catchError(() => of({
          paginacion: { page: 1, limit: 20, total: 0 },
          rows: [],
          resumen: { sumCantidad: 0, sumExistencia: 0, avgVendidosFarmacia: 0 }
        }))
      );
  }

  /** Autocomplete de productos (nombre o CB contiene 'q') */
  searchProductos(q: string): Observable<ProductoLite[]> {
    const url = `${environment.apiUrl}/productos/buscar`;
    const params = new HttpParams().set('q', q).set('limit', '50');

    return this.http.get<any>(url, { headers: this.headers(), params }).pipe(
      map((resp: any) => {
        if (Array.isArray(resp)) return resp as any[];

        // Intenta en varias claves comunes
        const candidates = ['rows', 'data', 'productos', 'products', 'items', 'docs', 'result', 'results', 'list'];
        for (const k of candidates) {
          if (Array.isArray(resp?.[k])) return resp[k] as any[];
        }
        return []; // por si acaso
      }),
      map((arr: any[]): ProductoLite[] =>
        arr.map((p: any): ProductoLite => ({
          _id: String(p?._id ?? ''),
          nombre: String(p?.nombre ?? ''),
          codigoBarras: p?.codigoBarras ? String(p.codigoBarras) : undefined,
        }))
      ),
      map((list: ProductoLite[]) =>
        [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
      ),
      catchError(() => of<ProductoLite[]>([]))
    );
  }

  /** Proveedores para el select (ordenados A-Z) */
  getProveedores(): Observable<ProveedorLite[]> {
    const url = `${environment.apiUrl}/proveedores`;
    return this.http.get<any>(url, { headers: this.headers() }).pipe(
      map((resp: any) => (Array.isArray(resp) ? resp : (resp?.rows ?? resp?.data ?? [])) as any[]),
      map((arr: any[]): ProveedorLite[] =>
        arr.map((p: any): ProveedorLite => ({
          _id: String(p?._id ?? ''),
          nombre: String(p?.nombre ?? ''),
        }))
      ),
      map((list: ProveedorLite[]) =>
        [...list].sort((a: ProveedorLite, b: ProveedorLite) =>
          a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        )
      ),
      catchError(() => of<ProveedorLite[]>([]))
    );
  }


}

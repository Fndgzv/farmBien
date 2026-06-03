// services/producto.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { Producto } from '../models/producto.model';
import { ProductoLite } from '../models/producto-lite.model';

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
  private apiUrl = `${environment.apiUrl}/productos`;
  private imgCache = new Map<string, string>(); // id -> objectURL

  constructor(private http: HttpClient) { }

  private extraerFarmaciaId(valor: any): string {
    if (!valor) return '';
    if (Array.isArray(valor)) return this.extraerFarmaciaId(valor[0]);

    if (typeof valor === 'object') {
      return this.extraerFarmaciaId(
        valor._id || valor.id || valor.farmaciaId || valor.farmacia || valor.sucursal || valor.$oid
      );
    }

    const limpio = String(valor).trim();
    if (!limpio) return '';

    try {
      const parsed = JSON.parse(limpio);
      const id = this.extraerFarmaciaId(parsed);
      if (id) return id;
      if (parsed && typeof parsed === 'object') return '';
    } catch { }

    return limpio;
  }

  private obtenerFarmaciaActivaId(): string {
    const candidatos = [
      localStorage.getItem('farmaciaActivaId'),
      localStorage.getItem('user_farmacia'),
      localStorage.getItem('farmaciaId'),
      localStorage.getItem('farmacia'),
      localStorage.getItem('sucursal')
    ];

    for (const candidato of candidatos) {
      const id = this.extraerFarmaciaId(candidato);
      if (id) return id;
    }

    return '';
  }

  private headers() {
    const token = localStorage.getItem('auth_token') || '';
    const farmaciaId = this.obtenerFarmaciaActivaId();

    const h: any = {
      'Content-Type': 'application/json',
      'x-auth-token': token,
    };

    if (farmaciaId) h['x-farmacia-id'] = farmaciaId;

    return new HttpHeaders(h);
  }


  // services/producto.service.ts
  crearProducto(payload: any) {
    const farmaciaActivaId = this.obtenerFarmaciaActivaId();
    const body = farmaciaActivaId ? { ...payload, farmaciaActivaId } : payload;

    return this.http.post<any>(this.apiUrl, body, { headers: this.headers() });
  }

  buscarPorCodigoBarras(codigo: string) {
    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    // Si usaste la opción con query:
    const params = new HttpParams().set('codigoBarras', codigo);
    return this.http.get<{ ok: boolean; producto: any }>(`${this.apiUrl}/buscar-por-cb`, { params, headers });

    // === O si prefieres por parámetro ===
    // return this.http.get<{ ok: boolean; producto: any }>(`${this.url}/productos/by-cb/${encodeURIComponent(codigo)}`, { headers });
  }

  obtenerProductos(): Observable<Producto[]> {
    return this.http.get<any[]>(`${this.apiUrl}`);
  }

  consultarPrecioPorCodigo(idFarmacia: string, codigoBarras: string) {
    return this.http.get<any>(`${this.apiUrl}/precio/${idFarmacia}/${codigoBarras}`);
  }

  existenciaPorId(idProducto: string): Observable<any> {
    // existencia del produto en almacen
    return this.http.get<any>(`${this.apiUrl}/ver-existencia/${idProducto}`);
  }

  existenciaPorFarmaciaYProducto(idFarmacia: string, idProducto: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/inventario/${idFarmacia}/${idProducto}`);
  }

  actualizarProductos(payload: { productos: Producto[] }) {
    return this.http.put(`${this.apiUrl}/actualizar-masivo`, payload);
  }

  quitarLotesMasivo(payload: { productoIds: string[] }) {
    return this.http.put<any>(`${this.apiUrl}/quitar-lotes-masivo`, payload);
  }


  actualizarProductoIndividual(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/actualizar-producto/${id}`, data);
  }

  obtenerProductoPorId(id: string) {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  buscar(q: string, limit = 12): Observable<ProductoLite[]> {
    const params = new HttpParams().set('q', q).set('limit', limit);
    return this.http.get<ProductoLite[]>(`${this.apiUrl}/search`, { params });
  }


  eliminarProducto(id: string) {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }

  actualizarImagenProducto(id: string, archivo: File) {
    const fd = new FormData();
    fd.append('imagen', archivo);
    return this.http.put<any>(`${this.apiUrl}/${id}/imagen`, fd);
  }

  obtenerImagenProductoUrl(id: string) {
    return `${this.apiUrl}/${id}/imagen`;
  }

  getPublicImageUrl(pathOrUrl?: string): string {
    const placeholder = 'assets/images/farmBienIcon.png';
    if (!pathOrUrl) return placeholder;

    // 1) Si ya es URL absoluta, regresa tal cual
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

    // 2) Limpia encabezados repetidos y slashes
    let clean = String(pathOrUrl).trim();
    clean = clean.replace(/^\/+/, '');          // quita "/" inicial
    clean = clean.replace(/^uploads\/+/i, '');  // quita "uploads/" si ya viene

    // 3) Queda "/uploads/<lo-que-sea>"
    return `/uploads/${clean}`;
  }


  getImagenObjectUrl(id: string): Observable<string> {
    return this.http
      .get(`${this.apiUrl}/${id}/imagen`, { responseType: 'blob' })
      .pipe(
        map((blob: Blob) => URL.createObjectURL(blob)),
        catchError(() => of('')) // ← si falla, devolvemos string vacío
      );
  }


  clearImagenFromCache(id: string) {
    const url = this.imgCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.imgCache.delete(id);
    }
  }

  ngOnDestroy(): void {
    // Limpieza por si el servicio se destruye
    for (const [, url] of this.imgCache) URL.revokeObjectURL(url);
    this.imgCache.clear();
  }

  buscarProductoNombre(term: string) {
    const params = new HttpParams().set('q', term);
    return this.http.get<any[]>(`${this.apiUrl}/buscar`, { params });
  }

  buscarMedicamentosReceta(q: string, limit = 100) {
    const lim = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 100);
    return this.http.get<any>(
      `${this.apiUrl}/buscar-medicamentos?q=${encodeURIComponent(q)}&limit=${lim}`,
      { headers: this.headers() }
    );
  }


}

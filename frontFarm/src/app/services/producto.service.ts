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

  // services/producto.service.ts
  crearProducto(payload: any) {
    return this.http.post<any>(`${environment.apiUrl}/productos`, payload);
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

  getPublicImageUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;      // ya es absoluta
    const api = environment.apiUrl;                              // p.ej. https://back.onrender.com/api
    const backendOrigin = new URL(api, window.location.origin).origin; // https://back.onrender.com
    const clean = String(pathOrUrl).replace(/^\/+/, '');         // "uploads/xxx.jpg"
    return `${backendOrigin}/${clean}`;
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

}


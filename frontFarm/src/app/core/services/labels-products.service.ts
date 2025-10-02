import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LabelsProductsService {
  private api = '/api/labels/products';
  constructor(private http: HttpClient) {}
  search(opts: { farmaciaId: string; nombre?: string; categoria?: string; page?: number; limit?: number; }) {
    let params = new HttpParams().set('farmaciaId', opts.farmaciaId);
    if (opts.nombre) params = params.set('nombre', opts.nombre);
    if (opts.categoria) params = params.set('categoria', opts.categoria);
    if (opts.page) params = params.set('page', String(opts.page));
    if (opts.limit) params = params.set('limit', String(opts.limit));
    return this.http.get<{rows:any[], paginacion:any}>(this.api, { params });
  }
}

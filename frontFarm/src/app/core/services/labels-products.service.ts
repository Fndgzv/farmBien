import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LabelsProductsService {
  private api = `${environment.apiUrl}/labels/products`;
  constructor(private http: HttpClient) { }

  // labels-products.service.ts
  search(opts: {
    farmaciaId: string;
    nombre?: string;
    categoria?: string;
    page?: number;
    limit?: number;
    sortBy?: 'nombre' | 'categoria';
    sortDir?: 'asc' | 'desc';
  }) {
    let params = new HttpParams().set('farmaciaId', opts.farmaciaId);
    if (opts.nombre) params = params.set('nombre', opts.nombre);
    if (opts.categoria) params = params.set('categoria', opts.categoria);
    if (opts.page) params = params.set('page', String(opts.page));
    if (opts.limit) params = params.set('limit', String(opts.limit));
    if (opts.sortBy) params = params.set('sortBy', opts.sortBy);
    if (opts.sortDir) params = params.set('sortDir', opts.sortDir);

    return this.http.get<{ rows: any[], paginacion: any }>(this.api, {
      params,
      headers: new HttpHeaders({ 'x-auth-token': localStorage.getItem('token') || '' })
    });
  }


}

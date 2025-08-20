// services/producto.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Producto } from '../models/producto.model';
import { ProductoLite } from '../models/producto-lite.model';

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
  private apiUrl = `${environment.apiUrl}/productos`;

  constructor(private http: HttpClient) { }


  obtenerProductos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(`${this.apiUrl}`);
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


  actualizarProductoIndividual(producto: Producto): Observable<any> {
    return this.http.put(`${this.apiUrl}/actualizar-producto/${producto._id}`, producto);
  }

  obtenerProductoPorId(id: string) {
  return this.http.get<any>(`${this.apiUrl}/${id}`);
}

  buscar(q: string, limit = 12): Observable<ProductoLite[]> {
    const params = new HttpParams().set('q', q).set('limit', limit);
    return this.http.get<ProductoLite[]>(`${this.apiUrl}/search`, { params });
  }
  
}
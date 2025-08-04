// services/producto.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Producto } from '../models/producto.model';

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

  actualizarProductos(productos: Producto[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/actualizar-masivo`, { productos });
  }

  actualizarProductoIndividual(producto: Producto): Observable<any> {
    return this.http.put(`${this.apiUrl}/actualizar-producto/${producto._id}`, producto);
  }

  obtenerProductoPorId(id: string) {
  return this.http.get<any>(`${this.apiUrl}/${id}`);
}

}
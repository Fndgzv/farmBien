import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InventarioPortatilService {

  private api = `${environment.apiUrl}/inventario-portatil`;

  constructor(private http: HttpClient) { }

  // =============================================
  //  FARMACIA → obtener existencia de producto
  // =============================================
  obtenerInventario(farmaciaId: string, productoId: string) {
    return this.http.get<any>(
      `${this.api}/farmacia/${farmaciaId}/producto/${productoId}`
    );
  }

  // =============================================
  //  Obtener info del producto
  // =============================================
  obtenerProducto(id: string) {
    return this.http.get<any>(`${this.api}/producto/${id}`);
  }

  // =============================================
  //  Buscar productos
  // =============================================
  buscar(q: string) {
    return this.http.get<any[]>(`${this.api}/buscar?q=${q}`);
  }

  // =============================================
  //  Actualizar existencia (solo farmacias)
  // =============================================
  ajustarExistencia(
    farmaciaId: string,
    productoId: string,
    nuevaExistencia: number
  ) {
    return this.http.put<any>(
      `${this.api}/farmacia/${farmaciaId}/producto/${productoId}`,
      { nuevaExistencia }
    );
  }

  // =============================================
  //  LOTES (solo almacén)
  // =============================================
  obtenerLotes(productoId: string) {
    return this.http.get<any[]>(`${this.api}/lotes/${productoId}`);
  }

  agregarLote(productoId: string, data: any) {
    return this.http.post<any>(`${this.api}/lotes/${productoId}`, data);
  }

  editarLote(productoId: string, loteId: string, data: any) {
    return this.http.put<any>(
      `${this.api}/lotes/${productoId}/${loteId}`,
      data
    );
  }

  eliminarLote(productoId: string, loteId: string) {
    return this.http.delete<any>(`${this.api}/lotes/${productoId}/${loteId}`);
  }
}

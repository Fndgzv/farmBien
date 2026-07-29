import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InventarioPortatilService {

  private api = `${environment.apiUrl}/inventario-portatil`;
  private ubicacionTemporal: string | null = null;
  private ubicacionesGuardadas = new Map<string, string>();

  constructor(private http: HttpClient) { }

  obtenerUbicacionTemporal(): string {
    return this.ubicacionTemporal ?? '';
  }

  establecerUbicacionTemporal(ubicacion: string): void {
    this.ubicacionTemporal = ubicacion;
  }

  inicializarUbicacionTemporal(ubicacion: string): boolean {
    if (this.ubicacionTemporal !== null) return false;

    this.ubicacionTemporal = ubicacion || '';
    return true;
  }

  limpiarUbicacionTemporal(): void {
    this.ubicacionTemporal = null;
    this.ubicacionesGuardadas.clear();
  }

  claveUbicacionAlmacen(productoId: string): string {
    return `almacen:${productoId}`;
  }

  claveUbicacionFarmacia(farmaciaId: string, productoId: string): string {
    return `farmacia:${farmaciaId}:${productoId}`;
  }

  ubicacionRequiereGuardado(clave: string): boolean {
    const ubicacion = this.obtenerUbicacionTemporal().trim();
    return !!ubicacion && this.ubicacionesGuardadas.get(clave) !== ubicacion;
  }

  marcarUbicacionGuardada(clave: string, ubicacion: string): void {
    const ubicacionLimpia = ubicacion.trim();
    if (ubicacionLimpia) {
      this.ubicacionesGuardadas.set(clave, ubicacionLimpia);
    }
  }

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
    nuevaExistencia?: number,
    ubicacion?: string
  ) {
    const body: { nuevaExistencia?: number; ubicacion?: string } = {};

    if (nuevaExistencia !== undefined) {
      body.nuevaExistencia = nuevaExistencia;
    }

    const ubicacionLimpia = ubicacion?.trim();
    if (ubicacionLimpia) {
      body.ubicacion = ubicacionLimpia;
    }

    return this.http.put<any>(
      `${this.api}/farmacia/${farmaciaId}/producto/${productoId}`,
      body
    );
  }

  actualizarUbicacionAlmacen(productoId: string, ubicacion: string) {
    return this.http.put<any>(
      `${this.api}/producto/${productoId}/ubicacion`,
      { ubicacion: ubicacion.trim() }
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

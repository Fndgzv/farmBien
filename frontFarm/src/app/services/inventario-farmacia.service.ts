import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InventarioFarmaciaService {

  private baseUrl = `${environment.apiUrl}/inventario-farmacia`;

  constructor(private http: HttpClient) {}

  buscarInventarioFarmacia(filtros: any): Observable<any[]> {
    let params = new HttpParams();

    if (filtros.farmacia)        params = params.set('farmacia', filtros.farmacia);
    if (filtros.nombre)          params = params.set('nombre', filtros.nombre);
    if (filtros.codigoBarras)    params = params.set('codigoBarras', filtros.codigoBarras);
    if (filtros.categoria)       params = params.set('categoria', filtros.categoria);
    if (filtros.inapam !== '')   params = params.set('inapam', filtros.inapam);
    if (filtros.generico !== '')   params = params.set('generico', filtros.generico);

    return this.http.get<any[]>(`${this.baseUrl}/`, { params });
  }

  actualizarUno(id: string, cambios: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}`, cambios);
  }

  actualizarMasivo(farmaciaId: string, cambios: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/masivo/${farmaciaId}`, cambios);
  }
}

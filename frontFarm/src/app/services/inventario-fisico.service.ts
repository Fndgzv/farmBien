import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InventarioFisicoService {

  private base = '/api/inventario-fisico';

  constructor(private http: HttpClient) {}

  obtenerRegistros(filtros: any): Observable<any> {
    return this.http.get(this.base, { params: filtros });
  }
}

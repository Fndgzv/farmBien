import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Laboratorio {
  _id?: string;
  laboratorio: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LaboratoriosFiltros {
  laboratorio?: string;
  tipoBusqueda?: 'comienza' | 'incluye';
}

@Injectable({ providedIn: 'root' })
export class LaboratoriosService {
  private apiUrl = `${environment.apiUrl}/laboratorios`;

  constructor(private http: HttpClient) { }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'x-auth-token': localStorage.getItem('auth_token') || '',
    });
  }

  obtenerLaboratorios(filtros: LaboratoriosFiltros = {}): Observable<Laboratorio[]> {
    let params = new HttpParams();

    if (filtros.laboratorio?.trim()) {
      params = params.set('laboratorio', filtros.laboratorio.trim());
    }

    if (filtros.tipoBusqueda) {
      params = params.set('tipoBusqueda', filtros.tipoBusqueda);
    }

    return this.http.get<Laboratorio[]>(this.apiUrl, {
      headers: this.headers(),
      params,
    });
  }

  crearLaboratorio(data: Laboratorio): Observable<any> {
    return this.http.post(this.apiUrl, data, { headers: this.headers() });
  }

  actualizarLaboratorio(id: string, data: Laboratorio): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data, { headers: this.headers() });
  }
}

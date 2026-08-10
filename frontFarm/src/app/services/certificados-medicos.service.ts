import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { CertificadoMedico } from '../models/certificado-medico.model';

export interface CertificadosMedicosFiltros {
  farmacia?: string;
  nombre?: string;
  responsable?: string;
  medico?: string;
  fechaRevision?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CertificadosMedicosListadoRespuesta {
  ok: boolean;
  certificados: any[];
  paginacion: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class CertificadosMedicosService {
  private readonly baseUrl = `${environment.apiUrl}/certificados-medicos`;

  constructor(private http: HttpClient) {}

  crear(payload: Partial<CertificadoMedico>): Observable<any> {
    return this.http.post(this.baseUrl, payload, { headers: this.headers() });
  }

  actualizar(id: string, payload: Partial<CertificadoMedico>): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}`, payload, { headers: this.headers() });
  }

  eliminar(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`, { headers: this.headers() });
  }

  obtenerListado(filtros: CertificadosMedicosFiltros): Observable<CertificadosMedicosListadoRespuesta> {
    let params = new HttpParams();
    Object.entries(filtros || {}).forEach(([key, value]) => {
      const texto = String(value ?? '').trim();
      if (texto) params = params.set(key, texto);
    });

    return this.http.get<CertificadosMedicosListadoRespuesta>(this.baseUrl, {
      headers: this.headers(),
      params,
    });
  }

  obtenerPorId(id: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}`, { headers: this.headers() });
  }

  obtenerPorFicha(fichaId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/ficha/${fichaId}`, { headers: this.headers() });
  }

  private headers(): HttpHeaders {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    const farmacia = this.farmaciaActivaId();
    const values: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-auth-token': token,
    };
    if (farmacia) values['x-farmacia-id'] = farmacia;
    return new HttpHeaders(values);
  }

  private farmaciaActivaId(): string {
    const directa = localStorage.getItem('farmaciaActivaId');
    if (directa) return directa;

    try {
      const farmacia = JSON.parse(localStorage.getItem('user_farmacia') || 'null');
      return String(farmacia?._id || '').trim();
    } catch {
      return '';
    }
  }
}

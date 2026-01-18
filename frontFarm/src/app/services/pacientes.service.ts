import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PacienteResp {
  ok: boolean;
  paciente?: any;
  pacientes?: any[];
  yaExistia?: boolean;
  msg?: string;
}

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  buscar(q: string): Observable<PacienteResp> {
    const params = new HttpParams().set('q', q);
    return this.http.get<PacienteResp>(`${this.baseUrl}/pacientes/buscar`, { params });
  }

  crearBasico(payload: { nombre: string; apellidos?: string; telefono?: string; curp?: string }): Observable<PacienteResp> {
    return this.http.post<PacienteResp>(`${this.baseUrl}/pacientes`, payload);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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
  private baseUrl = `${environment.apiUrl}/pacientes`;

  constructor(private http: HttpClient) { }

  private headers() {
    const token = localStorage.getItem('auth_token') || '';

    // 1) Admin
    let farmaciaId = localStorage.getItem('farmaciaActivaId') || '';

    // 2) Fallback user_farmacia
    if (!farmaciaId) {
      const uf = localStorage.getItem('user_farmacia');
      try {
        const parsed = uf ? JSON.parse(uf) : null;
        farmaciaId = parsed?._id || '';
      } catch { }
    }

    const h: any = {
      'Content-Type': 'application/json',
      'x-auth-token': token,
    };

    if (farmaciaId) h['x-farmacia-id'] = farmaciaId;

    return new HttpHeaders(h);
  }

  getExpediente(pacienteId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${pacienteId}/expediente`, { headers: this.headers() });
  }

  guardarSignosVitales(pacienteId: string, payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${pacienteId}/signos-vitales`, payload, { headers: this.headers() });
  }

  guardarNotaClinica(pacienteId: string, payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${pacienteId}/nota-clinica`, payload, { headers: this.headers() });
  }

  buscar(q: string) {
    return this.http.get<any>(`${this.baseUrl}/buscar?q=${encodeURIComponent(q)}`, { headers: this.headers() });
  }

  crearBasico(payload: { nombre: string; apellidos?: string; telefono?: string; curp?: string }) {
    return this.http.post<any>(`${this.baseUrl}`, payload, { headers: this.headers() });
  }

}



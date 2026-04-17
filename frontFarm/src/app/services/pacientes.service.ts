// frontFarm/src/app/services/pacientes.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PacienteResp {
  ok: boolean;
  paciente?: any;
  pacientes?: any[];
  yaExistia?: boolean;
  msg?: string;
}

export interface CrearPacienteConsultorioPayload {
  nombre: string;
  apPaterno: string;
  apMaterno?: string;
  telefono?: string;
  fechaNacimiento?: string;
  sexo?: string;
  entidadNacimiento?: string;
  curp?: string;
  generarCurp?: boolean;
}

export interface ActualizarPacientePayload {
  nombre?: string;
  apPaterno?: string;
  apMaterno?: string;
  contacto?: any;
  datosGenerales?: any;
  antecedentes?: any;
}

@Injectable({ providedIn: 'root' })
export class PacientesService {
  private baseUrl = `${environment.apiUrl}/pacientes`;

  constructor(private http: HttpClient) { }

  private headers() {
    const token = localStorage.getItem('auth_token') || '';

    let farmaciaId = localStorage.getItem('farmaciaActivaId') || '';

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
    return this.http.get<any>(`${this.baseUrl}/${pacienteId}/expediente`, {
      headers: this.headers()
    });
  }

  guardarSignosVitales(pacienteId: string, payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${pacienteId}/signos-vitales`, payload, {
      headers: this.headers()
    });
  }

  guardarNotaClinica(pacienteId: string, payload: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${pacienteId}/nota-clinica`, payload, {
      headers: this.headers()
    });
  }

  buscar(q: string): Observable<PacienteResp> {
    return this.http.get<PacienteResp>(`${this.baseUrl}/buscar?q=${encodeURIComponent(q)}`, {
      headers: this.headers()
    });
  }

  crearConsultorio(payload: CrearPacienteConsultorioPayload): Observable<PacienteResp> {
    return this.http.post<PacienteResp>(`${this.baseUrl}`, payload, {
      headers: this.headers()
    });
  }

  actualizarPaciente(pacienteId: string, payload: ActualizarPacientePayload | any): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${pacienteId}`, payload, {
      headers: this.headers()
    });
  }
}
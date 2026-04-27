import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TurnoPantallaItem {
  _id: string;
  folio?: string;
  turnoFecha?: string;
  turnoConsecutivo?: number;
  estado?: string;
  llegadaAt?: string;
  llamadoAt?: string;
  inicioAtencionAt?: string;
}

export interface PantallaTurnosResumenResponse {
  ok: boolean;
  farmacia?: { _id: string; nombre: string };
  turnoEnAtencion: TurnoPantallaItem | null;
  siguientesTurnos: TurnoPantallaItem[];
  pendientesTotales: number;
  videoPromocionalUrl?: string;
  usaVideoDefault?: boolean;
  actualizadoEn?: string;
}

@Injectable({ providedIn: 'root' })
export class PantallaTurnosService {
  private baseUrl = `${environment.apiUrl}/pantalla-turnos`;

  constructor(private http: HttpClient) {}

  private getFarmaciaDeTrabajo(): string {
    let farmaciaId = localStorage.getItem('farmaciaActivaId') || '';
    if (farmaciaId) return farmaciaId;

    const raw = localStorage.getItem('user_farmacia');
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      farmaciaId = parsed?._id || '';
    } catch {
      farmaciaId = '';
    }

    return farmaciaId;
  }

  private headers(farmaciaId?: string): HttpHeaders {
    const token = localStorage.getItem('auth_token') || '';
    const farmacia = farmaciaId || this.getFarmaciaDeTrabajo();

    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-auth-token': token,
    };

    if (farmacia) {
      h['x-farmacia-id'] = farmacia;
    }

    return new HttpHeaders(h);
  }

  obtenerResumen(farmaciaId?: string): Observable<PantallaTurnosResumenResponse> {
    const farmacia = farmaciaId || this.getFarmaciaDeTrabajo();
    let params = new HttpParams();
    if (farmacia) {
      params = params.set('farmaciaId', farmacia);
    }

    return this.http.get<PantallaTurnosResumenResponse>(this.baseUrl, {
      headers: this.headers(farmacia),
      params,
    });
  }

  actualizarVideoPromocional(farmaciaId: string, videoUrl: string): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/video`,
      { farmaciaId, videoUrl },
      { headers: this.headers(farmaciaId) }
    );
  }
}

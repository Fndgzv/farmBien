// frontFarm/src/app/services/fichas-consultorio.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FichasConsultorioService {
  // ✅ Opción 1: deja apiUrl ya apuntando al recurso
  private apiUrl = `${environment.apiUrl}/fichas-consultorio`;

  constructor(private http: HttpClient) { }

  private headers() {
    const token = localStorage.getItem('auth_token') || '';

    // 1) Admin (si existe)
    let farmaciaId = localStorage.getItem('farmaciaActivaId') || '';

    // 2) Fallback: lo que ya usas en Ventas (user_farmacia)
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


  listasParaCobro(): Observable<any> {
    return this.http.get(`${this.apiUrl}/listas-para-cobro`, { headers: this.headers() });
  }

  tomarParaCobro(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/tomar-para-cobro`, {}, { headers: this.headers() });
  }

  crearFicha(payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}`, payload, { headers: this.headers() });
  }

  // (Opcional) Si lo vas a usar en caja para cancelar el cobro
  liberarCobro(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/liberar-cobro`, {}, { headers: this.headers() });
  }

  obtenerCola(incluirMiAtencion: boolean = true): Observable<any> {
    return this.http.get(`${this.apiUrl}/cola`, {
      headers: this.headers(),
      params: { incluirMiAtencion: incluirMiAtencion ? '1' : '0' }
    });
  }

  llamarFicha(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/llamar`, {}, { headers: this.headers() });
  }

  reanudarFicha(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/reanudar`, {}, { headers: this.headers() });
  }

  regresarAListaDeEspera(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/regresar-a-espera`, {}, { headers: this.headers() });
  }

  // (Opcional) Buscar ficha por folio/tel/nombre en cobro
  buscar(q: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/buscar`, { headers: this.headers(), params: { q } });
  }

  actualizarServicios(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/servicios`, payload, { headers: this.headers() });
  }

  buscarServiciosMedicos(q: string) {
    return this.http.get<any>(`${environment.apiUrl}/productos/servicios-medicos?q=${encodeURIComponent(q || '')}`, {
      headers: this.headers()
    });
  }

  vincularPaciente(fichaId: string, pacienteId: string): Observable<any> {
    return this.http.patch(
      `${this.apiUrl}/${fichaId}/vincular-paciente`,
      { pacienteId },
      { headers: this.headers() }
    );
  }

  finalizarConsulta(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/finalizar`, payload, { headers: this.headers() });
  }

}

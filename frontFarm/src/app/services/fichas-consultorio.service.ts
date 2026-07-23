// frontFarm/src/app/services/fichas-consultorio.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FichasConsultorioService {

  private baseUrl = `${environment.apiUrl}/fichas-consultorio`;

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
    return this.http.get(`${this.baseUrl}/listas-para-cobro`, { headers: this.headers() });
  }

  tomarParaCobro(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/tomar-para-cobro`, {}, { headers: this.headers() });
  }

  // (Opcional) Si lo vas a usar en caja para cancelar el cobro
  liberarCobro(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/liberar-cobro`, {}, { headers: this.headers() });
  }

  obtenerColaEnEspera(): Observable<{ ok: boolean; fichas: any[] }> {
    return this.http.get<{ ok: boolean; fichas: any[] }>(
      `${this.baseUrl}/cola?estado=EN_ESPERA`,
      { headers: this.headers() }
    );
  }

  obtenerColaMedico(): Observable<{ ok: boolean; fichas: any[] }> {
    return this.http.get<{ ok: boolean; fichas: any[] }>(
      `${this.baseUrl}/cola?estados=EN_ESPERA,LISTA_PARA_COBRO&incluirMiAtencion=1`,
      { headers: this.headers() }
    );
  }

  crearFicha(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}`, payload, { headers: this.headers() });
  }

  llamarFicha(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/llamar`, {}, { headers: this.headers() });
  }

  reanudarFicha(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/reanudar`, {}, { headers: this.headers() });
  }

  regresarAListaDeEspera(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/regresar-a-espera`, {}, { headers: this.headers() });
  }

  cancelarFicha(id: string, motivoCancelacion: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/${id}/cancelar`,
      { motivoCancelacion },
      { headers: this.headers() }
    );
  }

  // (Opcional) Buscar ficha por folio/tel/nombre en cobro
  buscar(q: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/buscar`, { headers: this.headers(), params: { q } });
  }

  actualizarServicios(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/servicios`, payload, { headers: this.headers() });
  }

  obtenerMiTrabajoTurnoActual(): Observable<{
    ok: boolean;
    turnoFecha?: string;
    filas?: Array<{
      fichaId?: string;
      turnoFecha?: string;
      turnoConsecutivo?: number;
      ficha?: string;
      pacienteNombre?: string;
      nombre?: string;
      cantidad?: number;
    }>;
  }> {
    return this.http.get<{
      ok: boolean;
      turnoFecha?: string;
      filas?: Array<{
        fichaId?: string;
        turnoFecha?: string;
        turnoConsecutivo?: number;
        ficha?: string;
        pacienteNombre?: string;
        nombre?: string;
        cantidad?: number;
      }>;
    }>(`${this.baseUrl}/mi-trabajo/turno-actual`, { headers: this.headers() });
  }

  actualizarConceptos(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/conceptos`, payload, {
      headers: this.headers()
    });
  }

  buscarServiciosMedicos(q: string) {
    return this.http.get<any>(`${environment.apiUrl}/productos/servicios-medicos?q=${encodeURIComponent(q || '')}`, {
      headers: this.headers()
    });
  }

  buscarProductosConsulta(q: string) {
    return this.http.get<any>(
      `${environment.apiUrl}/productos/buscar?q=${encodeURIComponent(q || '')}`,
      { headers: this.headers() }
    );
  }

  vincularPaciente(fichaId: string, pacienteId: string): Observable<any> {
    return this.http.patch(
      `${this.baseUrl}/${fichaId}/vincular-paciente`,
      { pacienteId },
      { headers: this.headers() }
    );
  }

  finalizarConsulta(id: string, payload: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/finalizar`, payload, { headers: this.headers() });
  }

  obtenerFichasEnAtencion(): Observable<{ ok: boolean; fichas: any[] }> {
    return this.http.get<{ ok: boolean; fichas: any[] }>(
      `${this.baseUrl}/cola?estado=EN_ATENCION`,
      { headers: this.headers() }
    );
  }

}

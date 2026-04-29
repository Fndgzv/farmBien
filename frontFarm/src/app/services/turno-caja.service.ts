import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TurnoCajaService {
  private readonly rolesConTurnoObligatorio = new Set(['admin', 'empleado']);
  private readonly turnoActivoSubject = new BehaviorSubject<boolean>(this.tieneTurnoLocal());

  readonly turnoActivo$ = this.turnoActivoSubject.asObservable();

  constructor(private http: HttpClient) { }

  requiereTurno(rol: string | null | undefined): boolean {
    return !!rol && this.rolesConTurnoObligatorio.has(rol);
  }

  tieneTurnoLocal(): boolean {
    return !!localStorage.getItem('corte_activo');
  }

  marcarTurnoActivo(corteId: string): void {
    localStorage.setItem('corte_activo', corteId);
    this.turnoActivoSubject.next(true);
  }

  limpiarTurnoActivo(): void {
    localStorage.removeItem('corte_activo');
    this.turnoActivoSubject.next(false);
  }

  sincronizarTurnoDesdeStorage(): void {
    this.turnoActivoSubject.next(this.tieneTurnoLocal());
  }

  consultarCorteActivo(): Observable<any | null> {
    const sesion = this.obtenerDatosSesion();

    if (!sesion.token || !sesion.usuarioId || !sesion.farmaciaId) {
      this.limpiarTurnoActivo();
      return of(null);
    }

    const headers = new HttpHeaders({ 'x-auth-token': sesion.token });
    const url = `${environment.apiUrl}/cortes/activo/${sesion.usuarioId}/${sesion.farmaciaId}`;

    return this.http.get<any>(url, { headers }).pipe(
      map(res => res?.corte ?? null),
      tap(corte => {
        if (corte?._id) {
          this.marcarTurnoActivo(corte._id);
          return;
        }
        this.limpiarTurnoActivo();
      }),
      catchError(() => {
        this.limpiarTurnoActivo();
        return of(null);
      })
    );
  }

  verificarTurnoActivo(): Observable<boolean> {
    return this.consultarCorteActivo().pipe(map(corte => !!corte));
  }

  private obtenerDatosSesion(): { token: string; usuarioId: string; farmaciaId: string } {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    const usuario = this.parseJson(localStorage.getItem('usuario'));
    const farmacia = this.parseJson(localStorage.getItem('user_farmacia'));

    const usuarioId = usuario?.id || usuario?._id || '';
    const farmaciaId = farmacia?._id || usuario?.farmacia?._id || '';

    return { token, usuarioId, farmaciaId };
  }

  private parseJson(raw: string | null): any {
    if (!raw || raw === 'undefined') {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

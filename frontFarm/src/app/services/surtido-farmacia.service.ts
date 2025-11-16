// frontFarm/src/app/services/surtido-farmacia.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SurtidoFarmaciaService {
  private apiUrl = `${environment.apiUrl}/surtirFarmacias`;
  constructor(private http: HttpClient) {}

  obtenerPendientes(farmaciaId: string, filtros?: { categoria?: string; ubicacion?: string }) {
    const body: any = { farmaciaId, confirm: false };
    if (filtros?.categoria) body.categoria = filtros.categoria;
    if (filtros?.ubicacion) body.ubicacion = filtros.ubicacion;
    return this.http.put<{ pendientes: any[] }>(this.apiUrl, body);
  }

  surtirFarmacia(
    farmaciaId: string,
    detalles: { producto: string, omitir: boolean }[],
    filtros?: { categoria?: string; ubicacion?: string }
  ) {
    const body: any = { farmaciaId, confirm: true, detalles };
    if (filtros?.categoria) body.categoria = filtros.categoria;
    if (filtros?.ubicacion) body.ubicacion = filtros.ubicacion;
    return this.http.put<{ mensaje: string; pendientes?: any[]; surtido?: any }>(this.apiUrl, body);
  }
}

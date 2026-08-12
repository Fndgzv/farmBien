// frontFarm/src/app/services/surtido-farmacia.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface SurtidoFarmaciaItemRespuesta {
  producto: {
    _id: string;
    nombre: string;
    codigoBarras: string;
    categoria: string;
    ubicacion: string;
  };
  lote: string;
  cantidad: number;
  precioUnitario?: number;
  costo?: number | null;
  ubicacionFarmacia?: string;
}

export interface SurtidoFarmaciaRespuesta {
  _id: string;
  farmacia: string;
  usuarioSurtio: string;
  fechaSurtido: string;
  tipoMovimiento: string;
  items: SurtidoFarmaciaItemRespuesta[];
}

@Injectable({ providedIn: 'root' })
export class SurtidoFarmaciaService {
  private apiUrl = `${environment.apiUrl}/surtirFarmacias`;
  constructor(private http: HttpClient) {}

obtenerPendientes(
  farmaciaId: string,
  filtros?: { categoria?: string; ubicacion?: string; ubicacionFarmacia?: string }
) {
  const body: any = { farmaciaId, confirm: false };
  if (filtros?.categoria) body.categoria = filtros.categoria;
  if (filtros?.ubicacion) body.ubicacion = filtros.ubicacion;
  if (filtros?.ubicacionFarmacia) body.ubicacionFarmacia = filtros.ubicacionFarmacia; // ✅
  return this.http.put<{ pendientes: any[] }>(this.apiUrl, body);
}

surtirFarmacia(
  farmaciaId: string,
  detalles: { producto: string, omitir: boolean }[],
  filtros?: { categoria?: string; ubicacion?: string; ubicacionFarmacia?: string }
) {
  const body: any = { farmaciaId, confirm: true, detalles };
  if (filtros?.categoria) body.categoria = filtros.categoria;
  if (filtros?.ubicacion) body.ubicacion = filtros.ubicacion;
  if (filtros?.ubicacionFarmacia) body.ubicacionFarmacia = filtros.ubicacionFarmacia; // ✅
  return this.http.put<{
    mensaje: string;
    pendientes?: any[];
    surtido?: SurtidoFarmaciaRespuesta;
  }>(this.apiUrl, body);
}

}

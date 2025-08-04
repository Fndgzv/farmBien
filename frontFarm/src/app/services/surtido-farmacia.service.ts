// surtido-farmacia.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SurtidoFarmaciaService {

  private apiUrl = `${environment.apiUrl}/surtirFarmacias`;

  constructor(private http: HttpClient) {}

  obtenerPendientes(farmaciaId: string) {
    // confirm=false por defecto
    return this.http.put<{ pendientes: any[] }>(this.apiUrl, { farmaciaId, confirm: false });
  }

  surtirFarmacia(farmaciaId: string) {
    return this.http.put(this.apiUrl, { farmaciaId, confirm: true });
  }
}

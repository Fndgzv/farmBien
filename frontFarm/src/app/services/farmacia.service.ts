// farmacia.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Farmacia {
  _id?: string;
  nombre: string;
  titulo1: string;
  titulo2: string;
  imagen: string;
  direccion?: string;
  telefono?: string;
  firmaUpdatedAt?: string | Date;
  firmaVersion?: number;
}

export interface FarmaciaUI extends Farmacia {
  _abiertos: number;
  _bloquearEliminar: boolean;
}

@Injectable({ providedIn: 'root' })

export class FarmaciaService {
  private apiUrl = `${environment.apiUrl}/farmacias`;
  private apiUrl2 = `${environment.apiUrl}`;

  constructor(private http: HttpClient) { }

  obtenerFarmacias(): Observable<Farmacia[]> {
    return this.http.get<Farmacia[]>(this.apiUrl);
  }

  eliminarFarmacia(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  crearFarmacia(f: Farmacia): Observable<any> {
    return this.http.post(this.apiUrl, f);
  }

  actualizarFarmacia(id: string, f: Farmacia): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, f);
  }

  getFarmaciaById(id: string) {
  return this.http.get<any>(`${this.apiUrl}/id/${id}`);
}

cambiarFirma(id: string, payload: { adminPassword: string; nuevaFirma: string }) {
  return this.http.patch(`${this.apiUrl}/${id}/cambiar-firma`, payload);
}

abiertosPorFarmacia() {
  return this.http.get<{ mapa: Record<string, number> }>(`${this.apiUrl2}/cortes/abiertos-por-farmacia`);
}

verificarFirma(farmaciaId: string, firma: string) {
  return this.http.post<{ autenticado: boolean }>(
    `${this.apiUrl}/verificar-firma/${farmaciaId}`,
    { firma }
  );
}


}
// farmacia.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Farmacia {
  _id?: string;
  nombre: string;
  direccion: string;
  telefono: string;
  contacto?: string;
  firma: string;
}

@Injectable({ providedIn: 'root' })

export class FarmaciaService {
  private apiUrl = `${environment.apiUrl}/farmacias`;

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


}
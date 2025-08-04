// proveedor.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface Proveedor {
  _id?: string;
  nombre: string;
  contacto?: string;
  telefono?: string;
  domicilio?: string;
}

@Injectable({ providedIn: 'root' })

export class ProveedorService {

  private apiUrl = `${environment.apiUrl}/proveedores`;

  constructor(private http: HttpClient) {}

  obtenerProveedores(): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>(this.apiUrl);
  }

  crearProveedor(data: Proveedor): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  actualizarProveedor(id: string, data: Proveedor): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

}

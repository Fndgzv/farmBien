import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Usuario {
  _id?: string;
  usuario: string;
  nombre: string;
  telefono: string;
  email?: string;
  password?: string;
  domicilio?: string;
  rol: 'admin' | 'empleado' | 'medico';
  farmacia?: string | { _id: string; nombre: string };
  cedulaProfesional?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UsuarioService {

   private apiUrl = `${environment.apiUrl}/usuarios`;

  constructor(private http: HttpClient) {}

  obtenerUsuarios(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(this.apiUrl);
  }

  crearUsuario(data: Usuario): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  actualizarUsuario(id: string, data: Usuario): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RecetasService {
  private apiUrl = `${environment.apiUrl}/recetas`;

  constructor(private http: HttpClient) { }

  private headers() {
    const token = localStorage.getItem('auth_token') || '';

    let farmaciaId = localStorage.getItem('farmaciaActivaId') || '';
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

  crear(payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}`, payload, { headers: this.headers() });
  }

  // ✅ GET /api/recetas/:id
  obtenerPorId(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`, { headers: this.headers() });
  }

}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LabelDesign } from '../models/label-design.model';

@Injectable({ providedIn: 'root' })
export class LabelDesignsService {
  private base = `${environment.apiUrl}/label-designs`;

  constructor(private http: HttpClient) {}

  private headers() {
    const t = localStorage.getItem('token') || '';
    return new HttpHeaders({ 'x-auth-token': t });
  }

  list(): Observable<LabelDesign[]> {
    return this.http.get<LabelDesign[]>(this.base, { headers: this.headers() });
  }

  get(id: string): Observable<LabelDesign> {
    return this.http.get<LabelDesign>(`${this.base}/${id}`, { headers: this.headers() });
  }

  create(d: LabelDesign): Observable<LabelDesign> {
    return this.http.post<LabelDesign>(this.base, d, { headers: this.headers() });
  }

  update(id: string, d: LabelDesign): Observable<LabelDesign> {
    return this.http.put<LabelDesign>(`${this.base}/${id}`, d, { headers: this.headers() });
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`, { headers: this.headers() });
  }
}

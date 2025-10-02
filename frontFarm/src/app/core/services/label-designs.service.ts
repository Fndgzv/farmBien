import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { LabelDesign } from '../models/label-design.model';

@Injectable({ providedIn: 'root' })
export class LabelDesignsService {
  private api = '/api/label-designs';

  constructor(private http: HttpClient) {}

  list() { return this.http.get<LabelDesign[]>(this.api); }
  get(id: string) { return this.http.get<LabelDesign>(`${this.api}/${id}`); }
  create(d: LabelDesign) { return this.http.post<LabelDesign>(this.api, d); }
  update(id: string, d: LabelDesign) { return this.http.put<LabelDesign>(`${this.api}/${id}`, d); }
  remove(id: string) { return this.http.delete<{ok: boolean}>(`${this.api}/${id}`); }
}

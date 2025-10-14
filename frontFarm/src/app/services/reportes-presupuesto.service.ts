// frontFarm/src/app/services/reportes-presupuesto.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PresupuestoRow {
  _id: string;
  grabar: boolean;          // UI
  producto: string;
  codigoBarras: string;
  categoria: string;
  existencia: number;
  stockMax: number;
  stockMin: number;
  vendidosSMaxE: number;
  sMinE: number;
  comprar: number;
  costoEst: number;
}

export interface PagInfo {
  page: number;
  limit: number;
  total: number;
}

export interface PresupuestoResponse {
  paginacion: PagInfo;
  resumen: { totalCostoEst: number };
  rows: PresupuestoRow[];
}

@Injectable({ providedIn: 'root' })
export class ReportesPresupuestoService {
  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getPresupuesto(params: {
    fechaIni: string;
    fechaFin: string;
    categoria?: string;
    nombre?: string;
    soloExistMenorQueVentas?: boolean;
    sortBy?: 'nombre' | 'categoria' | 'existencia' | 'vendidos';
    sortDir?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Observable<PresupuestoResponse> {
    let hp = new HttpParams()
      .set('fechaIni', params.fechaIni)
      .set('fechaFin', params.fechaFin);

    if (params.categoria) hp = hp.set('categoria', params.categoria);
    if (params.nombre)    hp = hp.set('nombre', params.nombre);
    if (params.soloExistMenorQueVentas !== undefined) {
      hp = hp.set('soloExistMenorQueVentas', String(params.soloExistMenorQueVentas));
    }
    if (params.sortBy)  hp = hp.set('sortBy', params.sortBy);
    if (params.sortDir) hp = hp.set('sortDir', params.sortDir);
    if (params.page)    hp = hp.set('page', String(params.page));
    if (params.limit)   hp = hp.set('limit', String(params.limit));

    // Si ya tienes un interceptor que agrega x-auth-token, no necesitas headers aquí.
    const headers = new HttpHeaders({ /* 'x-auth-token': token */ });

    return this.http.get<PresupuestoResponse>(
      `${this.api}/reportes/presupuesto`,
      { params: hp, headers }
    );
  }

  grabar(items: Array<{ productoId: string; vendidosSMaxE: number }>): Observable<{ ok: boolean; modified: number; matched: number }> {
    const headers = new HttpHeaders({ /* 'x-auth-token': token */ });
    return this.http.post<{ ok: boolean; modified: number; matched: number }>(
      `${this.api}/reportes/presupuesto/grabar`,
      { items },
      { headers }
    );
  }
}

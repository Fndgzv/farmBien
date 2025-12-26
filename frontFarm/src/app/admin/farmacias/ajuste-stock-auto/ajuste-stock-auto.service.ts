import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AjusteStockAutoService {

  private baseUrl = `${environment.apiUrl}/inventario-farmacia/stock-auto`;

  constructor(private http: HttpClient) { }


  calcularTabla(params: {
    farmaciaId: string;
    desde: string;
    hasta: string;
    diasSurtir: number;
    categoria?: string;
    nombre?: string;
  }) {
    let httpParams = new HttpParams()
      .set('farmaciaId', params.farmaciaId)
      .set('desde', params.desde)
      .set('hasta', params.hasta)
      .set('diasSurtir', params.diasSurtir);

    if (params.categoria) {
      httpParams = httpParams.set('categoria', params.categoria);
    }

    if (params.nombre) {
      httpParams = httpParams.set('productoNombre', params.nombre);
    }

    const token = localStorage.getItem('auth_token');

    const headers = new HttpHeaders({
      'x-auth-token': token || ''
    });

    return this.http.get<any[]>(
      `${this.baseUrl}/preview`,
      { params: httpParams, headers }
    );
  }

  aplicarCambios(farmaciaId: string, productos: any[]) {
    return this.http.put(`${this.baseUrl}/aplicar`, {
      farmaciaId,
      productos
    });
  }
}

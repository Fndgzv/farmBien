// src/app/reportes-devoluciones/devoluciones-catalogos.resolver.ts
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';
import { environment } from '../../environments/environment';

export const devolucionesCatalogosResolver: ResolveFn<any> = () => {
    const http = inject(HttpClient);
    const headers = new HttpHeaders({ 'x-auth-token': localStorage.getItem('auth_token') || '' });
    const api = environment.apiUrl;
    const MOTIVOS = [
        'Cliente cambió de opinión', 'Error en la receta médica', 'Presentación incorrecta',
        'Cantidad errónea entregada', 'Producto duplicado en la venta', 'Precio incorrecto en ticket',
        'Producto caducado', 'Producto en mal estado', 'Producto no surtible', 'Error en producto entregado'
    ];
    return forkJoin({
        farmacias: http.get<any>(`${api}/farmacias`, { headers }).pipe(map((x: any) => x?.data || x || [])),
        usuarios: http.get<any>(`${api}/usuarios`, { headers }).pipe(map((x: any) => x?.data || x || [])),
        motivos: of(MOTIVOS),
    });
};

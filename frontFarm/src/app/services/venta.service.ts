// src/app/services/venta.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class VentaService {

  private clavePausadas = 'ventas_pausadas';

  setVentasPausadas(pausadas: any[]) {
    localStorage.setItem(this.clavePausadas, JSON.stringify(pausadas));
  }

  getVentasPausadas() {
    const data = localStorage.getItem(this.clavePausadas);
    return data ? JSON.parse(data) : [];
  }

  limpiarVentasPausadas() {
    localStorage.removeItem(this.clavePausadas);
  }

  existenVentasPausadas(): boolean {
    const lista = this.getVentasPausadas();
    return lista.length > 0;
  }
}

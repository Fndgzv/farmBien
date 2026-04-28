import { Injectable } from '@angular/core';
import {
  logoToDataUrlSafe,
  printNodeInIframe,
  resolveLogoForPrint
} from '../shared/utils/print-utils';

type FormaPagoTicket = {
  efectivo?: number;
  tarjeta?: number;
  transferencia?: number;
  vale?: number;
};

@Injectable({
  providedIn: 'root'
})
export class VentaTicketPrintService {
  private toNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async construirFarmaciaTicket(farmacia: any): Promise<any> {
    const absLogo = resolveLogoForPrint(farmacia?.imagen);
    let logoData = absLogo;
    try {
      logoData = await logoToDataUrlSafe(absLogo);
    } catch {
      logoData = absLogo;
    }

    return {
      nombre: farmacia?.nombre || '',
      direccion: farmacia?.direccion || '',
      telefono: farmacia?.telefono || '',
      titulo1: farmacia?.titulo1 || '',
      titulo2: farmacia?.titulo2 || '',
      imagen: logoData,
    };
  }

  async construirVentaTicketDesdeDetalle(venta: any): Promise<any> {
    const farmacia = await this.construirFarmaciaTicket(venta?.farmacia || {});

    const productos = (Array.isArray(venta?.productos) ? venta.productos : []).map((p: any) => {
      const nombreProducto = p?.producto?.nombre || p?.nombre || '';
      const codigo = String(p?.producto?.codigoBarras || p?.codigoBarras || '');
      const barrasYNombre = `${codigo ? `${codigo.slice(-3)} ` : ''}${nombreProducto}`.trim();

      return {
        ...p,
        barrasYNombre,
      };
    });

    const formaPago: FormaPagoTicket = venta?.formaPago || {};

    return {
      folio: venta?.folio || '',
      cliente: venta?.cliente?.nombre || venta?.cliente || '',
      farmacia,
      productos,
      cantidadProductos: this.toNum(venta?.cantidadProductos),
      total: this.toNum(venta?.total),
      totalDescuento: this.toNum(venta?.totalDescuento),
      totalMonederoCliente: this.toNum(venta?.totalMonederoCliente),
      formaPago: {
        efectivo: this.toNum(formaPago?.efectivo),
        tarjeta: this.toNum(formaPago?.tarjeta),
        transferencia: this.toNum(formaPago?.transferencia),
        vale: this.toNum(formaPago?.vale),
      },
      AsiQuedaMonedero: this.toNum(venta?.AsiQuedaMonedero),
      elcambio: this.toNum(venta?.elcambio),
      fecha: venta?.fecha || venta?.createdAt || new Date().toISOString(),
      usuario: venta?.usuario?.nombre || venta?.usuario || '',
    };
  }

  async imprimirNodoTicket(node: HTMLElement, formaPago?: FormaPagoTicket | null): Promise<void> {
    const requiereDuplicado = this.toNum(formaPago?.tarjeta) > 0 || this.toNum(formaPago?.transferencia) > 0;
    const veces = requiereDuplicado ? 2 : 1;

    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    for (let n = 0; n < veces; n++) {
      await printNodeInIframe(node);
      if (n < veces - 1) await sleep(600);
    }
  }
}

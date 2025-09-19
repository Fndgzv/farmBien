// src/app/reportes-compras/types.ts
export type Dir = 'asc' | 'desc';
export type Orden = 'importe' | 'piezas' | 'compras' | 'margen' | 'venta';
export type Vista = 'resumen' | 'agrupado';
export type Agrupacion = 'proveedor' | 'producto' | 'categoria' | 'usuario';

export interface KpisCompras {
  numCompras: number;
  importe: number;                 // costo total (items)
  piezas: number;
  ticketPromedio: number;
  costoPromPonderado: number;
  ventaPotencial: number;
  margenTeorico: number;
  margenTeoricoPct: number | null;
  proveedoresDistintos: number;
  productosDistintos: number;
}

export interface Caducidades {
  piezas30: number;
  piezas60: number;
  piezas90: number;
  avgDias: number | null;
}

export interface ResumenResp {
  ok: boolean;
  kpis: KpisCompras;
  caducidades: Caducidades;
  topProveedores: any[];
  topProductos: any[];
  topCategorias: any[];
  topUsuarios: any[];
}

export interface AgrupadoResp {
  rows: any[];
}

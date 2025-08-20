// src/app/models/reportes.models.ts
export interface RangoFechas {
  fechaIni: string; // ISO local (YYYY-MM-DD)
  fechaFin: string;
}

export interface VentaProductoResumen {
  productoId: string;
  codigoBarras?: string;
  nombre: string;
  unidad?: string;
  categoria?: string;
  cantidadVendida: number;
  importeVendido: number;
}

export interface ResumenVentasResponse {
  ok: boolean;
  rango: { fechaIni: string; fechaFin: string } | any;
  data: VentaProductoResumen[];
}

export interface MovimientoProducto {
  fecha: string;     // ISO
  fechaStr?: string; // YYYY-MM-DD (desde backend)
  tipo: 'Compra' | 'Venta';
  cantidad: number;
  lote?: string | null;
  fechaCaducidad?: string | null;
  costoUnitario?: number | null;
  precioUnitario?: number | null;
  farmacia?: string | null; // ObjectId (opcional)
  folio?: string | null;
}

// Sencilla interfaz de Farmacia para el select
export interface Farmacia {
  _id: string;
  nombre: string;
}


export interface VentasProductoDetalleItem {
  fecha: string;
  folio: string;
  farmaciaNombre: string;
  usuarioNombre: string;
  codigoBarras?: string;
  productoNombre: string;
  cantidadVendida: number;
  importeTotal: number;
}

export interface VentasProductoDetalleResponse {
  ok: boolean;
  reporte: string;
  productoId: string;
  rango: { fechaIni: string; fechaFin: string } | any;
  items: VentasProductoDetalleItem[];
  resumen: { totalCantidad: number; totalImporte: number };
}

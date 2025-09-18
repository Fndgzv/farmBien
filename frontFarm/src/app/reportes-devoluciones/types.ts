// src/app/reportes-devoluciones/types.ts
export interface ProductoLite { _id: string; nombre: string; codigoBarras?: string; }
export interface ClienteLite  { _id: string; nombre: string; telefono?: string; }

export type Dir = 'asc'|'desc';
export type Vista = 'resumen'|'agrupado'|'listado';
export type Agrupacion = 'producto'|'motivo'|'cliente'|'usuario'|'farmacia';
export type OrdenTop = 'importe'|'piezas'|'devoluciones'|'avgDias';

export interface Kpis { totalImporte:number; totalPiezas:number; numDevoluciones:number; avgDias:number|null; }
export interface ListadoRow { devolucionId:string; fecha:string|Date; farmacia?:string; cliente?:string; usuario?:string; producto?:string; codigoBarras?:string; unidad?:string; cantidad:number; precioUnit:number|null; importe:number; motivo:string; }
export interface ListadoResp { page:number; limit:number; total:number; pages:number; rows:ListadoRow[]; footer:{ totalImporte:number; totalPiezas:number; numDevoluciones:number }|null; }

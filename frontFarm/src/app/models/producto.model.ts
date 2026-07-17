export interface Lote {
  _id?: string;
  lote: string;
  fechaCaducidad: Date;
  cantidad: number;
}

export interface PromoDia {
  porcentaje: number;
  inicio: Date;
  fin: Date;
  monedero: boolean;
}

export interface Producto {
  _id: string;
  nombre: string;
  ingreActivo: string;
  descripcionUso?: string;
  sintomas?: string[];
  sintomasNorm?: string[];
  renglon1: string;
  renglon2: string;
  codigoBarras: string;
  unidad: string;
  precio: number;
  costo: number;
  costoHonorariosMedicos?: number;
  costoInsumosMedicos?: number;
  iva: boolean;
  stockMinimo: number;
  stockMaximo: number;
  existencia: number;
  ultimoProveedorId?: string | { _id?: string; nombre?: string } | null;
  ultimoProveedorNombre: string;
  proveedor?: string | null;
  proximaCaducidad: Date;
  cantidadProximaCaducidad: number,
  fechaCaducos: Date;
  cantidadCaducada: number,

  ubicacion: string;
  categoria: string;
  laboratorio?: string | { _id?: string; laboratorio?: string } | null;
  laboratorioNombre?: string | null;
  generico: boolean;
  descuentoINAPAM: boolean;

  promoLunes: PromoDia;
  promoMartes: PromoDia;
  promoMiercoles: PromoDia;
  promoJueves: PromoDia;
  promoViernes: PromoDia;
  promoSabado: PromoDia;
  promoDomingo: PromoDia;
  promoDeTemporada: PromoDia;

  promoCantidadRequerida: number;
  inicioPromoCantidad: Date;
  finPromoCantidad: Date;

  lotes: Lote[];
  imagen: string;

  seleccionado?: boolean; // para manejo de selección frontend
  modificado?: boolean; 
}

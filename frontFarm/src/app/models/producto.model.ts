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
  codigoBarras: string;
  unidad: string;
  precio: number;
  costo: number;
  iva: boolean;
  stockMinimo: number;
  stockMaximo: number;
  ubicacion: string;
  categoria: string;
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

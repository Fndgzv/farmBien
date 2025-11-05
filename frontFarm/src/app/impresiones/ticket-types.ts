// src/app/impresiones/ticket-types.ts
export type MovimientoPedido = 'agregar' | 'surtir' | 'cancelar';

export interface FarmaciaHeader {
  nombre: string;
  direccion: string;
  telefono?: string;
  titulo1?: string;
  titulo2?: string;
  imagen?: string;
}

export interface PedidoTicketData {
  movimiento: MovimientoPedido;
  pedido: any;          // lo que ya mandas (para el detalle)
  cliente: string;      // antes "client"
  usuario: string;      // antes "userName"
  farmacia: FarmaciaHeader; // reemplaza todos los farma*
}

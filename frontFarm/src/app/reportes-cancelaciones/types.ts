export type Vista = 'resumen' | 'agrupado';
export type Agrupacion = 'usuario' | 'farmacia' | 'cliente';
export type Dir = 'asc' | 'desc';

export interface KpisCancelaciones {
  numCancelaciones: number;
  dineroDevuelto: number;
  valeDevuelto: number;
  totalDevuelto: number;
  ticketPromedioDevuelto: number | null;
  avgDiasACancelar: number | null;
  porcCancelacionesSobrePedidos: number | null;
}

export interface TopRowBase {
  importe: number;
  dinero: number;
  vale: number;
  cancelaciones: number;
  avgDias: number | null;
}

export interface TopFarmacia extends TopRowBase {
  farmaciaId: string;
  nombre?: string;
}
export interface TopUsuario extends TopRowBase {
  usuarioId: string;
  nombre?: string;
}
export interface TopCliente extends TopRowBase {
  clienteId: string;
  nombre?: string;
  telefono?: string;
}

export interface ResumenResp {
  ok: boolean;
  rango: { fechaIni: string; fechaFin: string } | { fechaIni: Date; fechaFin: Date };
  kpis: KpisCancelaciones;
  topFarmacias: TopFarmacia[];
  topUsuarios: TopUsuario[];
  topClientes: TopCliente[];
}

export interface AgrupadoResp {
  ok: boolean;
  rows: any[];
}

export type ClienteLite = { _id: string; nombre?: string; telefono?: string };

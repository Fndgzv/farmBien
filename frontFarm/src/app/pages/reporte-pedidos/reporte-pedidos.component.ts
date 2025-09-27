import { Component, ElementRef, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { Pedido, PedidosService } from '../../services/pedidos.service';
import { AuthService } from '../../services/auth.service';
import { ClienteService } from '../../services/cliente.service';
import { FarmaciaService } from '../../services/farmacia.service';

import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faMinus, faPlus, faEyeSlash, faTimes, faSpinner, faCheck, faSave, faPen } from '@fortawesome/free-solid-svg-icons';
import { MatTooltipModule } from '@angular/material/tooltip';
import { faSort, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons';


import Swal from 'sweetalert2';

import { trigger, state, style, transition, animate } from '@angular/animations';

// ==== Interfaces (pueden ir arriba del componente si prefieres) ====
interface Paginacion {
  page: number; limit: number; total: number; pages: number;
  hasPrev: boolean; hasNext: boolean;
}
interface ResumenGenerales {
  conteo: number;
  total: number;
  aCuenta: number;
  resta: number;
  saldo: number;
  // anticipo
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  vale: number;
  // resta
  efectivoResta: number;
  tarjetaResta: number;
  transferenciaResta: number;
  valeResta: number;
  // otros
  costo: number;
}
interface Resumen {
  generales: ResumenGenerales;
  porEstado: Array<{ estado: string; conteo: number; total: number; aCuenta: number; saldo: number }>;
}

type SortField =
  | 'cliente.nombre'
  | 'descripcion'
  | 'estado'
  | 'fechaPedido'
  | 'costo'
  | 'total'
  | 'aCuenta'
  | 'resta';

function defaultResumenGenerales(): ResumenGenerales {
  return {
    conteo: 0,
    total: 0,
    aCuenta: 0,
    resta: 0,
    saldo: 0,
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    vale: 0,
    efectivoResta: 0,
    tarjetaResta: 0,
    transferenciaResta: 0,
    valeResta: 0,
    costo: 0,
  };
}

function defaultResumen(): Resumen {
  return {
    generales: defaultResumenGenerales(),
    porEstado: [],
  };
}

@Component({
  selector: 'app-reporte-pedidos',
  templateUrl: './reporte-pedidos.component.html',
  styleUrl: './reporte-pedidos.component.css',
  imports: [FontAwesomeModule, FormsModule, CommonModule, MatTooltipModule],
  animations: [
    trigger('expandCollapse', [
      state('true', style({ height: '*', opacity: 1, padding: '*', overflow: 'hidden' })),
      state('false', style({ height: '0px', opacity: 0, padding: '0px', overflow: 'hidden' })),
      transition('true <=> false', animate('300ms ease-in-out'))
    ])
  ]

})


export class ReportePedidosComponent {
  @ViewChild('contenedorTicket', { static: false }) contenedorTicket!: ElementRef;
  filtroFarmaciaId: string | undefined;
  filtroFolio: string = '';
  filtroDescripcion: string = '';
  filtroFechaPedido: string = ''; // fecha inicial
  filtroFechaFin: string = ''; // fecha final
  filtroEstado: string | undefined;
  estadosPedido: string[] = ['inicial', 'entregado', 'cancelado'];

  esAdmin: boolean = false;
  pedidoDetalleAbiertoId: string | null = null;
  nombreCliente: string = '';
  idCliente: string = '';
  totalMonedero = 0;

  farmacias: any[] = [];
  farmaciaNombre: string = '';
  farmaciaTelefono: string = '';
  farmaciaDireccion: string = '';

  usuarioId: string = '';
  usuarioRol: string = '';
  usuarioNombre: string = '';

  pedidoEditandoId: string | null = null;
  costoTemporal: number = 0;
  modoEdicionId: string | null = null;
  costoEditado: number | null = null;

  faSpinner = faSpinner;
  faCheck = faCheck;
  faSave = faSave;
  faEdit = faPen;
  faTimes = faTimes;

  public filtroClienteNombre: string = '';
  public incluirClienteNull: boolean = false;

  // ==== Paginación y ordenamiento ==== 
  public faSort = faSort;
  public faSortUp = faSortUp;
  public faSortDown = faSortDown;
  public page: number = 1;
  public limit: number = 20;
  public sortBy: SortField = 'fechaPedido';
  public sortDir: 'asc' | 'desc' = 'desc';

  ariaSortFor(field: SortField): 'ascending' | 'descending' | 'none' {
    return this.sortBy === field ? (this.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  public paginacion: Paginacion = { page: 0, limit: 0, total: 0, pages: 0, hasPrev: false, hasNext: false };
  public resumen: Resumen = defaultResumen();          // 👈 usa helper
  public pedidos: any[] = [];

  // ==== Totales que se usan en la vista ====
  public totalIngreso: number = 0;
  public utilidadTotal: number = 0;
  public porcentajeUtilidad: number = 0;
  public totalCosto: number = 0;
  public totalPrecio: number = 0;
  public totalAcuenta: number = 0;
  public totalResta: number = 0;

  // ==== Helper opcional para navegación ====
  public cambiarPagina(nueva: number) {
    if (!this.paginacion.pages) return;
    if (nueva < 1 || nueva > this.paginacion.pages) return;
    this.page = nueva;
    this.buscarSinFolio();
  }

  constructor(private library: FaIconLibrary,
    private pedidosService: PedidosService,
    private authService: AuthService,
    private clienteService: ClienteService,
    private farmaciaService: FarmaciaService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone) {
    // Registra íconos
    this.library.addIcons(
      faPlus, faMinus, faEyeSlash, faTimes
    );
  }

  ngOnInit(): void {
    // 1) Fechas por defecto = hoy
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()); // 00:00:00
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59); // 23:59:59

    // si tus inputs son <input type="date"> usa YYYY-MM-DD
    this.filtroFechaPedido = this.toYmd(inicio);
    this.filtroFechaFin = this.toYmd(fin);

    // 2) Cargar farmacias y seleccionar la primera; 3) Buscar automáticamente
    this.farmaciaService.obtenerFarmacias().subscribe(data => {
      this.farmacias = data || [];
      if (this.farmacias.length) {
        // value del <select>: usa el id real de tu API (_id o id)
        this.filtroFarmaciaId = this.farmacias[0]._id ?? this.farmacias[0].id ?? '';
      }
      // Lanza la búsqueda una vez que ya tienes fechas y farmacia
      this.buscarSinFolio();
    });

    const usuario = this.authService.getUserData();
    this.usuarioId = usuario?.id;
    this.usuarioRol = usuario?.rol;
    this.usuarioNombre = usuario?.nombre;
  }

  /** YYYY-MM-DD para <input type="date"> */
  private toYmd(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }


  formatearFecha(fechaStr: string): string {
    const fecha = new Date(fechaStr);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
  }

  get mostrarBotonBuscar(): boolean {
    if (this.filtroFarmaciaId) return true; else return false;
  }

  ordenarPor(campo: SortField) {
    if (this.sortBy === campo) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = campo;
      this.sortDir = 'asc';
    }
    this.page = 1;
    this.buscarSinFolio();
  }

  async buscarSinFolio() {
    if (!this.filtroFarmaciaId) {
      Swal.fire({
        icon: 'warning',
        title: 'Aviso',
        text: 'Debes de seleccionar una farmacia.',
        timer: 1600,
        timerProgressBar: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
      });
      return;
    }

    const toDateOnly = (v: any) => {
      if (!v) return undefined;
      const d = new Date(v);
      return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    };

    const farmaciaId = this.filtroFarmaciaId;
    const fechaInicio = toDateOnly(this.filtroFechaPedido);
    const fechaFin = toDateOnly(this.filtroFechaFin);
    const descripcion = (this.filtroDescripcion || '').trim() || undefined;
    const estado = this.filtroEstado || undefined;

    // NUEVOS filtros
    const clienteNombre = (this.filtroClienteNombre || '').trim() || undefined;
    const clienteNull = !!this.incluirClienteNull;

    // Paginación + sort (propiedades del componente con defaults)
    const page = this.page || 1;
    const limit = this.limit || 20;
    const sortBy = this.sortBy || 'fechaPedido';      // 'cliente.nombre'| 'descripcion' | 'estado' | 'fechaPedido' | 'costo' | 'total' | 'aCuenta' | 'resta'
    const sortDir = this.sortDir || 'desc';            // 'asc' | 'desc'

    this.pedidosService.obtenerPedidos({
      farmaciaId,
      fechaIni: fechaInicio,
      fechaFin,
      folio: undefined,
      estado,
      descripcion,
      descripcionMinima: false,
      page,
      limit,
      sortBy,
      sortDir,
      clienteNombre,
      clienteNull,
    })
      .subscribe({
        next: (resp: any) => {
          // resp = { paginacion, pedidos, resumen }

          console.log('Pedidos', resp);

          if (!resp?.pedidos || resp.pedidos.length === 0) {
            Swal.fire({
              icon: 'info',
              title: 'Sin resultados',
              text: 'No existen pedidos con esas características.',
              timer: 1500,
              timerProgressBar: true,
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
            this.pedidos = [];
            this.paginacion = { page: 0, limit: 0, total: 0, pages: 0, hasPrev: false, hasNext: false } as Paginacion;
            this.totalIngreso = 0;
            this.utilidadTotal = 0;
            this.porcentajeUtilidad = 0;
            this.totalCosto = 0;
            this.totalPrecio = 0;
            this.totalAcuenta = 0;
            this.totalResta = 0;
            return;
          }

          this.pedidos = resp.pedidos;
          this.paginacion = resp.paginacion as Paginacion;
          this.resumen = resp.resumen as Resumen;

          // Usa el resumen del backend para totales globales
          const g = (resp?.resumen?.generales as ResumenGenerales) ?? defaultResumenGenerales();
          const toNum = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;

          console.log('globales', g);

          this.totalCosto = g ? toNum(g.costo) : 0;
          this.totalPrecio = g ? toNum(g.total) : 0;
          this.totalAcuenta = g ? toNum(g.aCuenta) : 0;
          this.totalResta = g ? toNum(g.resta) : 0;

          this.totalIngreso = (Number(g.total) || 0) - (Number(g.resta) || 0);
          this.utilidadTotal = (Number(g.total) || 0) - (Number(g.resta) || 0) - (Number(g.costo) || 0);
          this.porcentajeUtilidad = this.totalCosto > 0 ? (this.utilidadTotal / this.totalCosto) * 100 : 0;
        },
        error: err => {
          console.error('Error al buscar sin folio:', err);
          Swal.fire('Error', 'Ocurrió un error al buscar pedidos.', 'error');
          this.pedidos = [];
          this.paginacion = { page: 0, limit: 0, total: 0, pages: 0, hasPrev: false, hasNext: false } as Paginacion;
          this.filtroFechaPedido = '';
          this.filtroFechaFin = '';
          this.filtroDescripcion = '';
          this.filtroEstado = '';
          this.filtroFolio = '';
          this.totalIngreso = 0;
          this.utilidadTotal = 0;
          this.porcentajeUtilidad = 0;
        }
      });
  }

  async limpiarDescripcion() {
    this.filtroDescripcion = '';
    this.buscarSinFolio();
  }

  async limpiarFechaPedido() {
    this.filtroFechaPedido = '';
    this.buscarSinFolio();
  }

  async limpiarFechaFin() {
    this.filtroFechaFin = '';
    this.buscarSinFolio();
  }

  async limpiarFiltroCompleto() {
    this.filtroFolio = '';
    this.filtroFechaPedido = '';
    this.filtroFechaFin = '';
    this.filtroDescripcion = '';
    this.filtroEstado = '';
    this.pedidos = [];
    this.resumen = defaultResumen();
  }


  abrirDetallePedido(pedido: any) {
    this.pedidoDetalleAbiertoId = pedido._id;
  }

  cerrarDetallePedido(pedido: any) {
    this.pedidoDetalleAbiertoId = null;
  }

  habilitarEdicion(pedido: Pedido) {
    this.modoEdicionId = pedido._id;
    this.costoEditado = pedido.costo;
  }

  cancelarEdicion() {
    this.modoEdicionId = null;
    this.costoEditado = null;
  }

  guardarFila(pedido: Pedido) {
    if (this.costoEditado === null) return; // previene llamada con null

    this.pedidosService.actualizarCostoPedido(pedido._id, this.costoEditado)
      .subscribe({
        next: resp => {
          pedido.costo = resp.pedido.costo;
          this.buscarSinFolio();
          Swal.fire({
            icon: 'success',
            title: 'Actualizado',
            text: 'El costo fue actualizado correctamente.',
            timer: 1600,
            timerProgressBar: true,
            allowOutsideClick: false,
            allowEscapeKey: false,
          });
        },
        error: err => {
          console.error('Error al actualizar costo:', err);
          Swal.fire('Error', 'No se pudo actualizar el costo.', 'error');
        },
        complete: () => {
          this.modoEdicionId = null;
          this.costoEditado = null;
        }
      });
  }

}




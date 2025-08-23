import { Component, ElementRef, OnInit, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';

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

import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';

import { trigger, state, style, transition, animate } from '@angular/animations';

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

  pedidos: any[] = [];
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

  totalIngreso: number = 0;
  utilidadTotal: number = 0;
  porcentajeUtilidad: number = 0;
  pedidoEditandoId: string | null = null;
  costoTemporal: number = 0;
  modoEdicionId: string | null = null;
  costoEditado: number | null = null;

  faSpinner = faSpinner;
  faCheck = faCheck;
  faSave = faSave;
  faEdit = faPen;
  faTimes = faTimes;

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

    this.farmaciaService.obtenerFarmacias().subscribe(data => {
      this.farmacias = data;
    });

    const usuario = this.authService.getUserData();
    const rol = usuario?.rol;
    const userName = usuario?.nombre;

    const usuarioId = usuario?.id;
    this.usuarioId = usuarioId;
    this.usuarioRol = rol;
    this.usuarioNombre = userName;
  }

  formatearFecha(fechaStr: string): string {
    const fecha = new Date(fechaStr);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    return `${dia}/${mes}/${año}`;
  }


  get mostrarBotonBuscar(): boolean {
    if (this.filtroFechaFin && !this.filtroFechaPedido) return false;
    if (this.filtroFechaPedido && !this.filtroFechaFin) return false;
    if (this.filtroDescripcion && !this.filtroFarmaciaId) return false;
    if (this.filtroEstado && !this.filtroFarmaciaId) return false;
    if (this.filtroFarmaciaId) return true; else return false;
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
    const farmaciaId = this.filtroFarmaciaId;
    const fecha = this.filtroFechaPedido;
    const fechaFin = this.filtroFechaFin;
    const descripcion = this.filtroDescripcion?.trim();
    const estado = this.filtroEstado;
    this.pedidosService
      .obtenerPedidos(farmaciaId, fecha, fechaFin, undefined, estado, descripcion, false)
      .subscribe({
        next: resp => {
          if (!resp.pedidos || resp.pedidos.length === 0) {
            Swal.fire({
              icon: 'info',
              title: 'No encontrado',
              text: 'No existen pedidos con esas caracteristicas.',
              timer: 1600,
              timerProgressBar: true,
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
            this.pedidos = [];
          } else {
            this.pedidos = resp.pedidos;
            this.totalIngreso = this.pedidos.reduce((acc, p) => acc + (p.total - p.resta), 0);
            this.utilidadTotal = this.pedidos.reduce((acc, p) => acc + (p.total - p.resta - p.costo), 0);
            this.porcentajeUtilidad = this.totalIngreso > 0 ? (this.utilidadTotal / this.totalIngreso) * 100 : 0;
          }
        },
        error: err => {
          console.error('Error al buscar sin folio:', err);
          Swal.fire('Error', 'Ocurrió un error al buscar pedidos.', 'error');
          this.pedidos = [];
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




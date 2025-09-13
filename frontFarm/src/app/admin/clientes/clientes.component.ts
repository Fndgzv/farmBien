// src/app/pages/clientes/clientes.component.ts
import { Component, OnInit, ViewChild, ChangeDetectorRef, ElementRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent, MatPaginator, MatPaginatorIntl } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faEdit, faSave, faTimes, faEye, faPlus, faWallet } from '@fortawesome/free-solid-svg-icons';
import { Observable } from 'rxjs';

import { ClienteService } from '../../services/cliente.service';

type SubKind = 'ventas' | 'pedidos' | 'devoluciones' | 'cancelaciones' | 'monedero';

export function paginatorEs(): MatPaginatorIntl {
  const p = new MatPaginatorIntl();
  p.itemsPerPageLabel = 'Clientes por página:';
  p.nextPageLabel = 'Siguiente';
  p.previousPageLabel = 'Anterior';
  p.firstPageLabel = 'Primera página';
  p.lastPageLabel = 'Última página';
  p.getRangeLabel = (page, pageSize, length) => {
    if (length === 0 || pageSize === 0) return `0 de ${length}`;
    const start = page * pageSize + 1;
    const end = Math.min(start + pageSize - 1, length);
    return `${start} – ${end} de ${length}`;
  };
  return p;
}

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatPaginatorModule,
    MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule,
    FontAwesomeModule, MatTooltipModule
  ],
  templateUrl: './clientes.component.html',
  styleUrls: ['./clientes.component.css'],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginatorEs }],
  encapsulation: ViewEncapsulation.None
})


export class ClientesComponent implements OnInit {
  faEdit = faEdit;
  faSave = faSave;
  faTimes = faTimes;
  faEye = faEye;
  faPlus = faPlus;
  faWallet = faWallet;

  clientes: any[] = [];
  filtro = '';
  page = 1;
  limit = 20;
  totalDocs = 0;

  editandoId: string | null = null;
  nuevoCliente = { nombre: '', telefono: '', email: '', domicilio: '' };

  expandedRow: string | null = null;
  subRows: Record<string, any[]> = {};
  subFooter: Record<string, any> = {};

  cargando = false;
  agregando = false;

  paginacion = { total: 0, page: 1, limit: 20 };

  // rango de fechas para subtablas
  fechaIni = '';
  fechaFin = '';

  // guarda la última subtabla abierta para poder recargarla al cambiar fechas
  lastExpandedKey: string | null = null;

  displayedColumns = ['nombre', 'telefono', 'email', 'domicilio', 'monedero', 'acciones'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild('filtroInput') filtroInput!: ElementRef<HTMLInputElement>;
  @ViewChild('nombreNuevoRef') nombreNuevoRef?: ElementRef<HTMLInputElement>;
  @ViewChild(MatTable) table!: MatTable<any>;

  flashId: string | null = null;

  errorMsg = '';

  subVentaOpen: Record<string, string | null> = {};
  subPedidoOpen: Record<string, string | null> = {};
  subDevolucionOpen: Record<string, string | null> = {};
  subCancelacionOpen: Record<string, string | null> = {};
  subMonederoOpen: Record<string, string | null> = {};
  trackVentaBy(_i: number, v: any) { return v._id; }
  trackPedidoBy(_i: number, v: any) { return v._id; }
  trackDevolucionBy(_i: number, v: any) { return v._id; }
  trackCancelacionBy(_i: number, v: any) { return v._id; }
  trackMonederoBy(_i: number, v: any) { return v._id; }

  isDetailRow = (_: number, row: any) => {
    if (!this.expandedRow) return false;
    // expandedRow = `${rowId}_${tipo}`
    const rowId = this.expandedRow.split('_')[0];
    return row && row._id === rowId;
  };

  trackById = (_: number, row: any) => row?._id ?? _;

  private subFetchers: Record<SubKind, (id: string, params: any) => Observable<any>>;

  constructor(private clienteSrv: ClienteService, private cdr: ChangeDetectorRef) {
    this.subFetchers = {
      ventas: (id, p) => this.clienteSrv.ventas(id, p),
      pedidos: (id, p) => this.clienteSrv.pedidos(id, p),
      devoluciones: (id, p) => this.clienteSrv.devoluciones(id, p),
      cancelaciones: (id, p) => this.clienteSrv.cancelaciones(id, p),
      monedero: (id, p) => this.clienteSrv.monedero(id, p),
    };
  }

  // helpers
  private toLocalISODate(d: Date): string {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  private setFechasPorDefecto(): void {
    const hoy = new Date();
    const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.fechaIni = this.toLocalISODate(primeroMes);
    this.fechaFin = this.toLocalISODate(hoy);
  }

  isSubEmpty(key: string | null): boolean {
    if (!key) return false;
    const rows = this.subRows[key];
    return Array.isArray(rows) && rows.length === 1 && (rows[0] as any)?.__empty__ === true;
  }


  /** fechaFin inclusiva -> enviamos fin+1 para usar $lt en el backend */
  private getFechaFinExclusiveISO(): string {
    return this.fechaFin;
  }

  ngOnInit(): void {
    this.setFechasPorDefecto(); // <— MUY importante que ocurra antes del primer fetch
    this.buscar();
  }

  /** Si hay subtabla abierta, la recargamos con el nuevo rango */
  onChangeFechas() {
    // Si hay una subtabla abierta, recárgala con las nuevas fechas
    const key = this.expandedRow;
    if (!key) return;

    const [clienteId] = key.split('_'); // "id_tipo"
    const tipo = key.endsWith('_ventas') ? 'ventas'
      : key.endsWith('_pedidos') ? 'pedidos'
        : key.endsWith('_devoluciones') ? 'devoluciones'
          : key.endsWith('_cancelaciones') ? 'cancelaciones'
            : key.endsWith('_monedero') ? 'monedero'
              : null;

    if (!tipo) return;

    // limpiar y recargar
    this.subRows[key] = [];
    delete this.subFooter[key];
    this.subVentaOpen[key] = null;
    this.subPedidoOpen[key] = null;
    this.subDevolucionOpen[key] = null;

    this.fetchSubtabla(clienteId, tipo as any, key);
  }
buscar(): void {
  this.cargando = true;
  this.clienteSrv.listar({ q: this.filtro, page: this.page, limit: this.limit })
    .subscribe({
      next: (resp: any) => {
        const rows  = resp?.rows ?? [];
        const total = resp?.paginacion?.total ?? 0;
        const page  = resp?.paginacion?.page  ?? this.page;
        const limit = resp?.paginacion?.limit ?? this.limit;

        this.clientes = rows;                            // <— solo array
        this.paginacion = { total, page, limit };
        this.totalDocs = total;

        this.cargando = false;
        this.table?.renderRows?.();
      },
      error: _ => {
        this.clientes = [];
        this.paginacion = { total: 0, page: 1, limit: this.limit };
        this.totalDocs = 0;
        this.cargando = false;
      }
    });
}

  cambioPagina(e: PageEvent): void {
    const sizeChanged = e.pageSize !== this.limit;

    this.limit = e.pageSize;
    this.page = sizeChanged ? 1 : (e.pageIndex + 1);

    // cerrar subtabs y limpiar caches de la página previa
    if (this.expandedRow) {
      delete this.subRows[this.expandedRow];
      delete this.subFooter[this.expandedRow];
      delete this.subVentaOpen[this.expandedRow];
      delete this.subPedidoOpen[this.expandedRow];
      delete this.subDevolucionOpen[this.expandedRow];
      this.expandedRow = null;
    }

    this.buscar();
  }


  iniciarEdicion(c: any): void {
    this.editandoId = c._id;
    c._backup = { ...c };
  }

  // Campos que el usuario puede editar en línea
  private readonly EDITABLE_KEYS = ['nombre', 'telefono', 'email', 'domicilio'] as const;

cancelarEdicion(c: any): void {
  // Restaura solo los campos editables desde el backup
  this.EDITABLE_KEYS.forEach((k) => {
    if (c._backup && Object.prototype.hasOwnProperty.call(c._backup, k)) {
      c[k] = c._backup[k];
    } else {
      delete c[k];
    }
  });

  delete c._backup;
  this.editandoId = null;

  // 🔄 Fuerza cambio de referencia para que Angular repinte la fila/tabla
  this.clientes = [...this.clientes];
  this.table?.renderRows?.();

  // Flash opcional
  this.flashId = c._id;
  setTimeout(() => (this.flashId = null), 1200);
}

  guardarEdicion(c: any): void {
    this.clienteSrv.actualizar(c._id, {
      nombre: c.nombre, telefono: c.telefono, email: c.email, domicilio: c.domicilio
    }).subscribe(() => {
      this.editandoId = null;
      delete c._backup;
    });
  }

  // Activa modo "agregar"
  empezarAgregar(): void {
    this.agregando = true;
    this.nuevoCliente = { nombre: '', telefono: '', email: '', domicilio: '' };
    // foco opcional al campo nombre
    setTimeout(() => this.nombreNuevoRef?.nativeElement?.focus(), 0);
  }

  // Cancela y limpia
  cancelarAgregar(): void {
    this.agregando = false;
    this.nuevoCliente = { nombre: '', telefono: '', email: '', domicilio: '' };
  }

  // Forzar solo dígitos y tope 10
  solo10Digitos(): void {
    this.nuevoCliente.telefono = (this.nuevoCliente.telefono || '')
      .replace(/\D/g, '')
      .slice(0, 10);
  }

  // Validación para habilitar Guardar
  validoNuevo(): boolean {
    const nombre = (this.nuevoCliente.nombre || '').trim();
    const tel = this.nuevoCliente.telefono || '';
    return !!nombre && /^\d{10}$/.test(tel);
  }

  // Ya existía: ahora valida y llama al servicio
  agregarCliente(): void {
    if (!this.validoNuevo()) return;

    this.cargando = true;
    this.clienteSrv.crear({
      nombre: this.nuevoCliente.nombre.trim(),
      telefono: this.nuevoCliente.telefono,
      // email y domicilio NO son requeridos para alta rápida
    }).subscribe({
      next: () => {
        this.cargando = false;
        this.cancelarAgregar(); // sale de modo agregar
        this.page = 1;          // vuelve a primera página
        this.buscar();          // refresca tabla
      },
      error: () => {
        this.cargando = false;
      }
    });
  }

  toggleSubtabla(
    c: any,
    tipo: 'ventas' | 'pedidos' | 'devoluciones' | 'cancelaciones' | 'monedero'
  ) {
    const key = `${c._id}_${tipo}`;

    // Si ya estaba abierta, ciérrala y limpia todo lo asociado a esa key
    if (this.expandedRow === key) {
      this.expandedRow = null;
      delete this.subRows[key];
      delete this.subFooter[key];
      delete this.subVentaOpen[key];
      delete this.subPedidoOpen[key];
      delete this.subDevolucionOpen[key];
      delete this.subCancelacionOpen[key];
      delete this.subMonederoOpen[key];
      this.table?.renderRows();
      this.cdr.detectChanges();
      return;
    }

    // Cerrar la que estuviera abierta antes (si la había)
    if (this.expandedRow) {
      delete this.subRows[this.expandedRow];
      delete this.subFooter[this.expandedRow];
      delete this.subVentaOpen[this.expandedRow];
      delete this.subPedidoOpen[this.expandedRow];
      delete this.subDevolucionOpen[this.expandedRow];
      delete this.subCancelacionOpen[this.expandedRow];
      delete this.subMonederoOpen[this.expandedRow];
    }

    // Abrir la nueva
    this.expandedRow = key;
    this.subVentaOpen[key] = null;
    this.subPedidoOpen[key] = null;
    this.subDevolucionOpen[key] = null;
    this.subCancelacionOpen[key] = null;
    this.subMonederoOpen[key] = null;
    this.table?.renderRows();
    this.cdr.detectChanges();

    // Cargar datos de la subtabla (con fechas)
    this.fetchSubtabla(c._id, tipo, key);
  }

  /** Hace la llamada a la API incluyendo el rango de fechas (fin exclusivo) */
  private fetchSubtabla(
    clienteId: string,
    tipo: 'ventas' | 'pedidos' | 'devoluciones' | 'cancelaciones' | 'monedero',
    key: string
  ) {
    const fetch = this.subFetchers[tipo];

    const params: any = { page: 1, limit: 20 };
    if (this.fechaIni) params.fechaIni = this.fechaIni;
    if (this.fechaFin) params.fechaFin = this.fechaFin;

    fetch(clienteId, params).subscribe({
      next: (resp: any) => {
        const rows = resp?.rows ?? [];

        if (rows.length === 0) {
          // ← IMPORTANTE: si no hay datos, deja la lista VACÍA y elimina footer
          this.subRows[key] = [];
          delete this.subFooter[key];
          this.subVentaOpen[key] = null;
          this.subPedidoOpen[key] = null;
          this.subDevolucionOpen[key] = null;
          this.subCancelacionOpen[key] = null;
          this.subMonederoOpen[key] = null;
        } else {
          this.subRows[key] = rows;
          this.subFooter[key] = resp?.footer ?? null;

          console.log('sub tabla', rows);
          console.log('footer',); resp.footer

        }

        this.table?.renderRows();
        this.cdr.detectChanges();
      },
      error: _ => {
        // En error también muéstralo como vacío (para que salga #sinCompras, #sinPedidos ....)
        this.subRows[key] = [];
        delete this.subFooter[key];
        this.subVentaOpen[key] = null;
        this.subPedidoOpen[key] = null;
        this.subDevolucionOpen[key] = null;
        this.subCancelacionOpen[key] = null;
        this.subMonederoOpen[key] = null;
        this.table?.renderRows();
        this.cdr.detectChanges();
      }
    });
  }


  toggleDetalleVenta(v: any, key: string) {
    // si ya está abierto ese v, ciérralo
    if (this.subVentaOpen[key] === v._id) {
      this.subVentaOpen[key] = null;
    } else {
      // abrir ese y cerrar cualquier otro dentro de la misma subtabla
      this.subVentaOpen[key] = v._id;
    }
    this.cdr.detectChanges();
  }

  toggleDetallePedido(v: any, key: string) {
    // si ya está abierto ese v, ciérralo
    if (this.subPedidoOpen[key] === v._id) {
      this.subPedidoOpen[key] = null;
    } else {
      // abrir ese y cerrar cualquier otro dentro de la misma subtabla
      this.subPedidoOpen[key] = v._id;
    }
    this.cdr.detectChanges();
  }

  toggleDetalleDevolucion(v: any, key: string) {
    // si ya está abierto ese v, ciérralo
    if (this.subDevolucionOpen[key] === v._id) {
      this.subDevolucionOpen[key] = null;
    } else {
      // abrir ese y cerrar cualquier otro dentro de la misma subtabla
      this.subDevolucionOpen[key] = v._id;
    }
    this.cdr.detectChanges();
  }

  toggleDetalleCancelacion(v: any, key: string) {
    // si ya está abierto ese v, ciérralo
    if (this.subCancelacionOpen[key] === v._id) {
      this.subCancelacionOpen[key] = null;
    } else {
      // abrir ese y cerrar cualquier otro dentro de la misma subtabla
      this.subCancelacionOpen[key] = v._id;
    }
    this.cdr.detectChanges();
  }

  toggleDetalleMonedero(v: any, key: string) {
    // si ya está abierto ese v, ciérralo
    if (this.subMonederoOpen[key] === v._id) {
      this.subMonederoOpen[key] = null;
    } else {
      // abrir ese y cerrar cualquier otro dentro de la misma subtabla
      this.subMonederoOpen[key] = v._id;
    }
    this.cdr.detectChanges();
  }

  limpiarFiltro(): void {
    this.filtro = '';
    this.page = 1;               // volver a la primera página
    this.buscar();               // recargar resultados
    setTimeout(() => this.filtroInput?.nativeElement.focus(), 0);
  }

}

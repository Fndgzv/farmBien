// src/app/reportes-devoluciones/devoluciones-listado.component.ts
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ListadoResp } from './types';

@Component({
  standalone: true,
  selector: 'app-devoluciones-listado',
  styleUrls: ['./devoluciones-listado.component.css'],
  imports: [CommonModule, DatePipe, CurrencyPipe],
  template: `
  <div class="table-responsive">
    <table class="tabla">
      <thead>
        <tr>
          <th>Fecha</th><th>Farmacia</th><th>Cliente</th><th>Usuario</th>
          <th>Producto</th><th>Cód. Barras</th>
          <th class="text-end">Cantidad</th><th class="text-end">Precio</th><th class="text-end">Importe</th><th>Motivo</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let r of rows">
          <td>{{ r.fecha | date:'dd/MM/yyyy HH:mm':'America/Mexico_City' }}</td>
          <td>{{ r.farmacia }}</td>
          <td>{{ r.cliente }}</td>
          <td>{{ r.usuario }}</td>
          <td>{{ r.producto }}</td>
          <td>{{ r.codigoBarras }}</td>
          <td class="text-end">{{ r.cantidad }}</td>
          <td class="text-end">{{ r.precioUnit | currency }}</td>
          <td class="text-end">{{ r.importe | currency }}</td>
          <td>{{ r.motivo }}</td>
        </tr>
      </tbody>

      <tfoot *ngIf="footer as f">
        <tr>
          <th colspan="6" class="text-end">Totales</th>
          <th class="text-end">{{ f.totalPiezas }}</th>
          <th></th>
          <th class="text-end">{{ f.totalImporte | currency }}</th>
          <th></th>
        </tr>
      </tfoot>
    </table>
  </div>

<nav class="mt-3" *ngIf="pages > 1" aria-label="Navegación de páginas">
  <ul class="pagination pagination-sm justify-content-center paginacion mb-0">
    <!-- Inicio -->
    <li [class.disabled]="page <= 1">
      <button class="page-link" type="button"
              aria-label="Inicio"
              [disabled]="page <= 1"
              (click)="change(1)">
              <i class="fa fa-angle-double-left"></i>
      </button>
    </li>

    <!-- Anterior -->
    <li [class.disabled]="page <= 1">
      <button class="page-link" type="button"
              aria-label="Anterior"
              [disabled]="page <= 1"
              (click)="change(page - 1)">
              <i class="fa fa-angle-left"></i>      
      </button>
    </li>

    <!-- Indicador -->
    <li>
      <span>Página {{ page }} de {{ pages }}</span>
    </li>

    <!-- Siguiente -->
    <li [class.disabled]="page >= pages">
      <button class="page-link" type="button"
              aria-label="Siguiente"
              [disabled]="page >= pages"
              (click)="change(page + 1)">
              <i class="fa fa-angle-right"></i>
      </button>
    </li>

    <!-- Fin -->
    <li [class.disabled]="page >= pages">
      <button class="page-link" type="button"
              aria-label="Fin"
              [disabled]="page >= pages"
              (click)="change(pages)">
              <i class="fa fa-angle-double-right"></i>
      </button>
    </li>
  </ul>
</nav>
`
})

export class DevolucionesListadoComponent {
  @Input() data: ListadoResp | null = null;
  @Output() pageChange = new EventEmitter<number>();

  // Getters null-safe para strict templates
  get rows()   { return this.data?.rows ?? []; }
  get footer() { return this.data?.footer ?? null; }
  get page()   { return this.data?.page  ?? 1; }
  get pages()  { return this.data?.pages ?? 1; }

  change(p:number){
    if (!this.data) return;
    if (p < 1 || p > this.pages) return;
    this.pageChange.emit(p);
  }
}

// src/app/reportes-devoluciones/devoluciones-top-tabla.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-devoluciones-top-tabla',
  imports: [CommonModule],
  template: `
  <h6 class="titulo-tabla" style="text-align: center;">{{title}}</h6>
  <div class="table-responsive">
    <table class="tabla" style="margin-bottom: 1.5rem; margin-top: 0">
      <thead><tr><th *ngFor="let c of cols">{{c}}</th></tr></thead>
      <tbody>
        <tr *ngFor="let r of rows"><td *ngFor="let c of cols">{{ r[c] }}</td></tr>
      </tbody>
    </table>
  </div>`
})
export class DevolucionesTopTablaComponent {
  @Input() title = ''; @Input() rows: any[] = [];
  get cols(): string[] {
    if (!this.rows?.length) return [];
    const a = this.rows[0];
    if ('productoId' in a) return ['nombre','codigoBarras','piezas','importe','devoluciones'];
    if ('motivo' in a)     return ['motivo','piezas','importe','devoluciones'];
    if ('clienteId' in a)  return ['nombre','telefono','piezas','importe','devoluciones'];
    if ('usuarioId' in a)  return ['nombre','piezas','importe','devoluciones'];
    if ('farmaciaId' in a) return ['nombre','piezas','importe','devoluciones'];
    return Object.keys(a);
  }
}

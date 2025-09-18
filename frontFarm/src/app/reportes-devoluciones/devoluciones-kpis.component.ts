// src/app/reportes-devoluciones/devoluciones-kpis.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Kpis } from './types';

@Component({
  standalone: true,
  selector: 'app-devoluciones-kpis',
  imports: [CommonModule],
  template: `
  <div class="row g-2 mb-2" style="text-align: center; color: darkred">
    <div class="col-md-3 col-6"><div class="kpi">Importe devuelto: <strong>{{kpis?.totalImporte | currency}}</strong></div></div>
    <div class="col-md-3 col-6"><div class="kpi">Piezas devueltas: <strong>{{kpis?.totalPiezas}}</strong></div></div>
    <div class="col-md-3 col-6"><div class="kpi"># Devoluciones: <strong>{{kpis?.numDevoluciones}}</strong></div></div>
    <div class="col-md-3 col-6"><div class="kpi">Días promedio: <strong>{{kpis?.avgDias | number:'1.0-2'}}</strong></div></div>
  </div>`
})
export class DevolucionesKpisComponent { @Input() kpis!: Kpis | null; }

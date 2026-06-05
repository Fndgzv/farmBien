import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize } from 'rxjs';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

import { Farmacia, FarmaciaService } from '../../services/farmacia.service';
import { ReportesService } from '../../services/reportes.service';
import { Usuario, UsuarioService } from '../../services/usuario.service';
import { formatearTurnoConsultorioVisual } from '../../shared/utils/turno-visual';

interface ServicioMedicoRealizadoRow {
  fichaId: string;
  ficha: string;
  folio: string;
  turnoFecha: string;
  turnoConsecutivo: number | null;
  paciente: string;
  servicioRealizado: string;
  cantidad: number;
  costoInsumos: number;
  costoHonorarios: number;
  costoTotal: number;
  precio: number;
}

interface ServicioMedicoRealizadoTotales {
  costoInsumos: number;
  costoHonorarios: number;
  costoTotal: number;
  precio: number;
}

@Component({
  selector: 'app-servicios-medicos-realizados',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './servicios-medicos-realizados.component.html',
  styleUrl: './servicios-medicos-realizados.component.css'
})
export class ServiciosMedicosRealizadosComponent implements OnInit {
  farmacias: Farmacia[] = [];
  medicos: Usuario[] = [];

  farmaciaId = '';
  fecha = this.hoyCdmx();
  medicoId = '';

  cargando = false;
  buscado = false;
  rows: ServicioMedicoRealizadoRow[] = [];
  totales: ServicioMedicoRealizadoTotales = this.totalesVacios();

  constructor(
    private farmaciaService: FarmaciaService,
    private usuarioService: UsuarioService,
    private reportesService: ReportesService
  ) { }

  ngOnInit(): void {
    this.farmaciaId = this.obtenerFarmaciaActivaId();
    this.cargarFarmacias();
    this.cargarMedicos();
  }

  puedeBuscar(): boolean {
    return !!this.farmaciaId && !!this.fecha && !!this.medicoId && !this.cargando;
  }

  buscar(): void {
    if (!this.puedeBuscar()) {
      Swal.fire('Aviso', 'Selecciona farmacia, fecha y médico.', 'info');
      return;
    }

    this.cargando = true;
    this.buscado = true;

    this.reportesService.getServiciosMedicosRealizados({
      farmaciaId: this.farmaciaId,
      fecha: this.fecha,
      medicoId: this.medicoId,
    })
      .pipe(finalize(() => this.cargando = false))
      .subscribe({
        next: (resp: any) => {
          this.rows = (resp?.rows || []).map((r: any) => this.mapRow(r));
          this.totales = this.normalizarTotales(resp?.totales);
        },
        error: (err) => {
          console.error('[servicios-medicos-realizados][ERROR]', err);
          this.rows = [];
          this.totales = this.totalesVacios();
          Swal.fire('Error', err?.error?.mensaje || 'No se pudo consultar el reporte.', 'error');
        }
      });
  }

  limpiarResultados(): void {
    this.rows = [];
    this.totales = this.totalesVacios();
    this.buscado = false;
  }

  trackByRow(index: number, row: ServicioMedicoRealizadoRow): string {
    return `${row.fichaId || row.ficha || 'ficha'}-${row.servicioRealizado || 'servicio'}-${index}`;
  }

  exportarExcel(): void {
    if (!this.rows.length) {
      Swal.fire('Aviso', 'No hay resultados para exportar.', 'info');
      return;
    }

    const data: Array<Record<string, string | number>> = this.rows.map((r) => ({
      Ficha: r.ficha || '',
      Paciente: r.paciente || '',
      'Servicio realizado': r.servicioRealizado || '',
      Cantidad: this.numero(r.cantidad),
      'Costo insumos': this.numero(r.costoInsumos),
      'Costo honorarios': this.numero(r.costoHonorarios),
      'Costo Total': this.numero(r.costoTotal),
      Precio: this.numero(r.precio),
    }));

    data.push({
      Ficha: 'Total',
      Paciente: '',
      'Servicio realizado': '',
      Cantidad: '',
      'Costo insumos': this.numero(this.totales.costoInsumos),
      'Costo honorarios': this.numero(this.totales.costoHonorarios),
      'Costo Total': this.numero(this.totales.costoTotal),
      Precio: this.numero(this.totales.precio),
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 32 },
      { wch: 42 },
      { wch: 10 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Servicios medicos');
    XLSX.writeFile(wb, 'servicios-medicos-realizados.xlsx');
  }

  imprimir(): void {
    if (!this.rows.length) {
      Swal.fire('Aviso', 'No hay resultados para imprimir.', 'info');
      return;
    }

    const win = window.open('', '_blank', 'width=850,height=1200');
    if (!win) {
      Swal.fire('Error', 'No se pudo abrir la ventana de impresión.', 'error');
      return;
    }

    win.document.open();
    win.document.write(this.buildPrintHtml());
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 200);
  }

  private cargarFarmacias(): void {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (data) => {
        const ordenadas = [...(data || [])].sort((a, b) =>
          String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es', { sensitivity: 'base' })
        );

        this.farmacias = ordenadas;
        if (this.farmaciaId && ordenadas.some(f => f._id === this.farmaciaId)) return;
        this.farmaciaId = ordenadas[0]?._id || '';
      },
      error: () => {
        this.farmacias = [];
        this.farmaciaId = '';
      }
    });
  }

  private cargarMedicos(): void {
    this.usuarioService.obtenerUsuarios().subscribe({
      next: (data) => {
        this.medicos = (data || [])
          .filter(u => u?.rol === 'medico')
          .sort((a, b) =>
            String(a?.usuario || '').localeCompare(String(b?.usuario || ''), 'es', { sensitivity: 'base' })
          );

        if (this.medicoId && !this.medicos.some(m => m._id === this.medicoId)) {
          this.medicoId = '';
        }
      },
      error: () => {
        this.medicos = [];
        this.medicoId = '';
      }
    });
  }

  private mapRow(r: any): ServicioMedicoRealizadoRow {
    const ficha = String(r?.ficha || '').trim()
      || formatearTurnoConsultorioVisual(r?.turnoFecha, r?.turnoConsecutivo)
      || String(r?.folio || '').trim()
      || '-';

    return {
      fichaId: String(r?.fichaId || ''),
      ficha,
      folio: String(r?.folio || ''),
      turnoFecha: String(r?.turnoFecha || ''),
      turnoConsecutivo: this.numeroONull(r?.turnoConsecutivo),
      paciente: String(r?.paciente || '').trim(),
      servicioRealizado: String(r?.servicioRealizado || '').trim(),
      cantidad: this.numero(r?.cantidad),
      costoInsumos: this.numero(r?.costoInsumos),
      costoHonorarios: this.numero(r?.costoHonorarios),
      costoTotal: this.numero(r?.costoTotal),
      precio: this.numero(r?.precio),
    };
  }

  private normalizarTotales(totales: any): ServicioMedicoRealizadoTotales {
    if (totales) {
      return {
        costoInsumos: this.numero(totales.costoInsumos),
        costoHonorarios: this.numero(totales.costoHonorarios),
        costoTotal: this.numero(totales.costoTotal),
        precio: this.numero(totales.precio),
      };
    }

    return this.rows.reduce((acc, r) => {
      acc.costoInsumos += this.numero(r.costoInsumos);
      acc.costoHonorarios += this.numero(r.costoHonorarios);
      acc.costoTotal += this.numero(r.costoTotal);
      acc.precio += this.numero(r.precio);
      return acc;
    }, this.totalesVacios());
  }

  private totalesVacios(): ServicioMedicoRealizadoTotales {
    return {
      costoInsumos: 0,
      costoHonorarios: 0,
      costoTotal: 0,
      precio: 0,
    };
  }

  private numero(v: any): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private numeroONull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private medicoSeleccionadoNombre(): string {
    const medico = this.medicos.find(m => m._id === this.medicoId);
    return String(medico?.nombre || medico?.usuario || '').trim() || '-';
  }

  private fechaDdMmYyyy(fecha: any): string {
    const raw = String(fecha || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;

    const d = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(d.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')}`;
  }

  private formatoCantidad(v: any): string {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(this.numero(v));
  }

  private formatoMoneda(v: any): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.numero(v));
  }

  private buildPrintHtml(): string {
    const filas = this.rows.map((r) => `
      <tr>
        <td>${this.esc(r.ficha)}</td>
        <td class="texto-cell">${this.esc(r.paciente || '-')}</td>
        <td class="servicio-cell">${this.esc(r.servicioRealizado || '-')}</td>
        <td class="num">${this.esc(this.formatoCantidad(r.cantidad))}</td>
        <td class="num">${this.esc(this.formatoMoneda(r.costoInsumos))}</td>
        <td class="num">${this.esc(this.formatoMoneda(r.costoHonorarios))}</td>
        <td class="num">${this.esc(this.formatoMoneda(r.costoTotal))}</td>
        <td class="num">${this.esc(this.formatoMoneda(r.precio))}</td>
      </tr>
    `).join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Servicios médicos realizados</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; font-size: 7.4px; }
    .page { padding: 6mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #cfcfcf; padding: 2px 3px; vertical-align: top; overflow-wrap: anywhere; line-height: 1.12; }
    th { background: #f3f3f3; text-align: left; }
    .title-row th, .doctor-row th, .meta-row th { border: 0; background: #fff; }
    .title-row th { text-align: center; font-size: 13px; font-weight: 700; padding-bottom: 3px; }
    .doctor-row th { text-align: center; font-size: 9px; font-weight: 700; padding-bottom: 4px; }
    .meta-row th { font-size: 8px; font-weight: 400; padding-bottom: 5px; }
    .meta-left { text-align: left; }
    .meta-right { text-align: right; }
    .columns th { font-size: 7px; line-height: 1.05; }
    .texto-cell, .servicio-cell { word-break: normal; }
    .num { text-align: right; white-space: nowrap; font-size: 6.8px; }
    tfoot td { font-weight: 700; background: #f3f3f3; }
    .col-ficha { width: 7%; }
    .col-paciente { width: 16%; }
    .col-servicio { width: 25%; }
    .col-cantidad { width: 7%; }
    .col-insumos { width: 11%; }
    .col-honorarios { width: 12%; }
    .col-total { width: 10%; }
    .col-precio { width: 9%; }
    @media print {
      @page { size: letter portrait; margin: 6mm; }
      .page { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <table>
      <thead>
        <tr class="title-row">
          <th colspan="8">Servicios Médicos realizados</th>
        </tr>
        <tr class="doctor-row">
          <th colspan="8">Nombre del médico: ${this.esc(this.medicoSeleccionadoNombre())}</th>
        </tr>
        <tr class="meta-row">
          <th colspan="4" class="meta-left">Fecha de impresión: ${this.esc(this.fechaDdMmYyyy(this.hoyCdmx()))}</th>
          <th colspan="4" class="meta-right">Fecha de los servicios: ${this.esc(this.fechaDdMmYyyy(this.fecha))}</th>
        </tr>
        <tr class="columns">
          <th class="col-ficha">Ficha</th>
          <th class="col-paciente">Paciente</th>
          <th class="col-servicio">Servicio realizado</th>
          <th class="col-cantidad num">Cantidad</th>
          <th class="col-insumos num">Costo insumos</th>
          <th class="col-honorarios num">Costo honorarios</th>
          <th class="col-total num">Costo Total</th>
          <th class="col-precio num">Precio</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" class="num">Total</td>
          <td class="num">${this.esc(this.formatoMoneda(this.totales.costoInsumos))}</td>
          <td class="num">${this.esc(this.formatoMoneda(this.totales.costoHonorarios))}</td>
          <td class="num">${this.esc(this.formatoMoneda(this.totales.costoTotal))}</td>
          <td class="num">${this.esc(this.formatoMoneda(this.totales.precio))}</td>
        </tr>
      </tfoot>
    </table>
    <div class="no-print" style="margin-top:8px;">
      <button onclick="window.print()">Imprimir</button>
      <button onclick="window.close()">Cerrar</button>
    </div>
  </div>
</body>
</html>`;
  }

  private esc(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private hoyCdmx(): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private obtenerFarmaciaActivaId(): string {
    const candidatos = [
      localStorage.getItem('farmaciaActivaId'),
      localStorage.getItem('user_farmacia'),
      localStorage.getItem('farmaciaId'),
      localStorage.getItem('farmacia'),
      localStorage.getItem('sucursal'),
      localStorage.getItem('usuario'),
    ];

    for (const candidato of candidatos) {
      const id = this.extraerFarmaciaId(candidato);
      if (id) return id;
    }

    return '';
  }

  private extraerFarmaciaId(valor: any): string {
    if (!valor) return '';

    if (typeof valor === 'string') {
      const limpio = valor.trim();
      if (!limpio) return '';

      if (!limpio.startsWith('{') && !limpio.startsWith('[')) return limpio;

      try {
        return this.extraerFarmaciaId(JSON.parse(limpio));
      } catch {
        return '';
      }
    }

    if (Array.isArray(valor)) {
      for (const item of valor) {
        const id = this.extraerFarmaciaId(item);
        if (id) return id;
      }
      return '';
    }

    if (typeof valor === 'object') {
      return this.extraerFarmaciaId(
        valor._id || valor.id || valor.farmaciaId || valor.farmacia || valor.sucursal || valor.$oid
      );
    }

    return '';
  }
}

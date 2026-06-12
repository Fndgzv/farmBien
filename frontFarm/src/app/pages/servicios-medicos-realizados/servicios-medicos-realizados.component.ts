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

type SortCol = 'llegada' | 'paciente' | 'servicio';
type SortKey = 'llegadaAt' | 'paciente' | 'servicioRealizado';

interface ServicioMedicoRealizadoRow {
  fichaId: string;
  ficha: string;
  llegadaAt: string;
  fechaHoraLlegada: string;
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
  fechaInicial = this.lunesSemanaActualCdmx();
  fechaFinal = this.hoyCdmx();
  medicoId = '';

  cargando = false;
  buscado = false;
  rows: ServicioMedicoRealizadoRow[] = [];
  totales: ServicioMedicoRealizadoTotales = this.totalesVacios();
  sort: { key: SortKey; dir: 'asc' | 'desc' } = { key: 'llegadaAt', dir: 'asc' };
  page = 1;
  limit = 20;
  readonly opcionesRegistrosPorPagina = [10, 20, 50, 100];
  private farmaciasCargadas = false;
  private medicosCargados = false;
  private busquedaInicialEjecutada = false;
  private readonly collator = new Intl.Collator('es', {
    sensitivity: 'base',
    numeric: true,
  });

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
    return !!this.farmaciaId && !!this.fechaInicial && !!this.fechaFinal && !!this.medicoId && !this.cargando;
  }

  buscar(): void {
    if (!this.puedeBuscar()) {
      Swal.fire('Aviso', 'Selecciona farmacia, fecha inicial, fecha final y médico.', 'info');
      return;
    }

    if (!this.rangoFechasValido()) {
      Swal.fire('Aviso', 'La fecha inicial no puede ser mayor que la fecha final.', 'warning');
      return;
    }

    this.cargando = true;
    this.buscado = true;

    this.reportesService.getServiciosMedicosRealizados({
      farmaciaId: this.farmaciaId,
      fechaInicial: this.fechaInicial,
      fechaFinal: this.fechaFinal,
      medicoId: this.medicoId,
    })
      .pipe(finalize(() => this.cargando = false))
      .subscribe({
        next: (resp: any) => {
          this.rows = (resp?.rows || []).map((r: any) => this.mapRow(r));
          this.setSortDefault();
          this.resetPaginacion();
          this.totales = this.normalizarTotales(resp?.totales);
        },
        error: (err) => {
          console.error('[servicios-medicos-realizados][ERROR]', err);
          this.rows = [];
          this.totales = this.totalesVacios();
          this.resetPaginacion();
          Swal.fire('Error', err?.error?.mensaje || 'No se pudo consultar el reporte.', 'error');
        }
      });
  }

  limpiarResultados(): void {
    this.rows = [];
    this.totales = this.totalesVacios();
    this.buscado = false;
    this.resetPaginacion();
  }

  trackByRow(index: number, row: ServicioMedicoRealizadoRow): string {
    return `${row.fichaId || row.ficha || 'ficha'}-${row.servicioRealizado || 'servicio'}-${index}`;
  }

  exportarExcel(): void {
    if (!this.rows.length) {
      Swal.fire('Aviso', 'No hay resultados para exportar.', 'info');
      return;
    }

    const data: Array<Record<string, string | number>> = this.sortedRows.map((r) => ({
      Ficha: r.ficha || '',
      'Fecha y hora de llegada': r.fechaHoraLlegada || '',
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
      'Fecha y hora de llegada': '',
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
      { wch: 22 },
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

  setSort(col: SortCol): void {
    const map: Record<SortCol, SortKey> = {
      llegada: 'llegadaAt',
      paciente: 'paciente',
      servicio: 'servicioRealizado',
    };

    const key = map[col];
    if (!this.sort || this.sort.key !== key) {
      this.sort = { key, dir: 'asc' };
      this.resetPaginacion();
      return;
    }

    this.sort = { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
    this.resetPaginacion();
  }

  sortIcon(col: SortCol): string {
    const map: Record<SortCol, SortKey> = {
      llegada: 'llegadaAt',
      paciente: 'paciente',
      servicio: 'servicioRealizado',
    };

    const key = map[col];
    if (!this.sort || this.sort.key !== key) return 'fa-sort';
    return this.sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  get sortedRows(): ServicioMedicoRealizadoRow[] {
    if (!this.sort) return this.rows;

    const { key, dir } = this.sort;
    const factor = dir === 'asc' ? 1 : -1;

    return [...this.rows].sort((a, b) => {
      if (key === 'llegadaAt') {
        const av = this.fechaEpoch(a.llegadaAt);
        const bv = this.fechaEpoch(b.llegadaAt);

        if (av == null && bv == null) return this.compararTexto(a.paciente, b.paciente);
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return -1 * factor;
        if (av > bv) return 1 * factor;
        return this.compararTexto(a.paciente, b.paciente);
      }

      const cmp = this.compararTexto(a[key], b[key]);
      if (cmp !== 0) return cmp * factor;
      return this.compararFecha(a.llegadaAt, b.llegadaAt);
    });
  }

  get totalRegistros(): number {
    return this.sortedRows.length;
  }

  get totalPaginas(): number {
    return this.totalRegistros > 0 ? Math.ceil(this.totalRegistros / this.limit) : 0;
  }

  get registrosPaginados(): ServicioMedicoRealizadoRow[] {
    const rows = this.sortedRows;
    const total = rows.length > 0 ? Math.ceil(rows.length / this.limit) : 0;
    const pagina = total > 0 ? Math.min(this.page, total) : 1;
    const inicio = (pagina - 1) * this.limit;
    return rows.slice(inicio, inicio + this.limit);
  }

  cambiarRegistrosPorPagina(): void {
    const value = Number(this.limit);
    this.limit = this.opcionesRegistrosPorPagina.includes(value) ? value : 20;
    this.resetPaginacion();
  }

  primera(): void {
    if (this.page !== 1) this.page = 1;
  }

  anterior(): void {
    if (this.page > 1) this.page--;
  }

  siguiente(): void {
    if (this.page < this.totalPaginas) this.page++;
  }

  ultima(): void {
    if (this.totalPaginas > 0 && this.page !== this.totalPaginas) this.page = this.totalPaginas;
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
        if (!this.farmaciaId || !ordenadas.some(f => f._id === this.farmaciaId)) {
          this.farmaciaId = ordenadas[0]?._id || '';
        }
        this.farmaciasCargadas = true;
        this.buscarInicialSiListo();
      },
      error: () => {
        this.farmacias = [];
        this.farmaciaId = '';
        this.farmaciasCargadas = true;
        this.buscarInicialSiListo();
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
        if (!this.medicoId) {
          this.medicoId = this.medicos[0]?._id || '';
        }
        this.medicosCargados = true;
        this.buscarInicialSiListo();
      },
      error: () => {
        this.medicos = [];
        this.medicoId = '';
        this.medicosCargados = true;
        this.buscarInicialSiListo();
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
      llegadaAt: String(r?.llegadaAt || ''),
      fechaHoraLlegada: this.fechaHoraCdmx(r?.llegadaAt),
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

  private setSortDefault(): void {
    this.sort = { key: 'llegadaAt', dir: 'asc' };
  }

  private resetPaginacion(): void {
    this.page = 1;
  }

  private fechaEpoch(v: any): number | null {
    if (!v) return null;
    const d = new Date(v);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  }

  private compararTexto(a: any, b: any): number {
    return this.collator.compare(this.texto(a), this.texto(b));
  }

  private compararFecha(a: any, b: any): number {
    const av = this.fechaEpoch(a);
    const bv = this.fechaEpoch(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  }

  private texto(v: any): string {
    return String(v ?? '').trim();
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

  private fechaHoraCdmx(fecha: any): string {
    if (!fecha) return '';

    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  }

  private rangoServiciosTexto(): string {
    const ini = this.fechaDdMmYyyy(this.fechaInicial);
    const fin = this.fechaDdMmYyyy(this.fechaFinal);
    if (!ini && !fin) return '';
    if (this.fechaInicial === this.fechaFinal) return ini || fin;
    return `${ini} - ${fin}`;
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
    const filas = this.sortedRows.map((r) => `
      <tr>
        <td>${this.esc(r.ficha)}</td>
        <td>${this.esc(r.fechaHoraLlegada || '-')}</td>
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
    .col-llegada { width: 13%; }
    .col-paciente { width: 15%; }
    .col-servicio { width: 23%; }
    .col-cantidad { width: 7%; }
    .col-insumos { width: 10%; }
    .col-honorarios { width: 11%; }
    .col-total { width: 7%; }
    .col-precio { width: 7%; }
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
          <th colspan="9">Servicios Médicos realizados</th>
        </tr>
        <tr class="doctor-row">
          <th colspan="9">Nombre del médico: ${this.esc(this.medicoSeleccionadoNombre())}</th>
        </tr>
        <tr class="meta-row">
          <th colspan="4" class="meta-left">Fecha de impresión: ${this.esc(this.fechaDdMmYyyy(this.hoyCdmx()))}</th>
          <th colspan="5" class="meta-right">Fecha de los servicios: ${this.esc(this.rangoServiciosTexto())}</th>
        </tr>
        <tr class="columns">
          <th class="col-ficha">Ficha</th>
          <th class="col-llegada">Fecha y hora de llegada</th>
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
          <td colspan="5" class="num">Total</td>
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
    const parts = this.fechaCdmxParts();
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private lunesSemanaActualCdmx(): string {
    const parts = this.fechaCdmxParts();
    const fechaActual = new Date(Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day)
    ));

    const diaSemana = fechaActual.getUTCDay();
    const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    fechaActual.setUTCDate(fechaActual.getUTCDate() - diasDesdeLunes);

    return this.ymdUtc(fechaActual);
  }

  private fechaCdmxParts(date: Date = new Date()): { year: string; month: string; day: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  private ymdUtc(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private rangoFechasValido(): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(this.fechaInicial)
      && /^\d{4}-\d{2}-\d{2}$/.test(this.fechaFinal)
      && this.fechaInicial <= this.fechaFinal;
  }

  private buscarInicialSiListo(): void {
    if (this.busquedaInicialEjecutada || !this.farmaciasCargadas || !this.medicosCargados) return;
    this.busquedaInicialEjecutada = true;
    if (this.puedeBuscar()) this.buscar();
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

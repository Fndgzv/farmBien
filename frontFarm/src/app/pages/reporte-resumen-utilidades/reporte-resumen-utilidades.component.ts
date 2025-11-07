import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import { ReportesService, ResumenUtilidadesRow, ResumenUtilidadesResponse } from '../../services/reportes.service';
import { FarmaciaService, Farmacia } from '../../services/farmacia.service';

@Component({
  selector: 'app-reporte-resumen-utilidades',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reporte-resumen-utilidades.component.html',
  styleUrl: './reporte-resumen-utilidades.component.css'
})
export class ReporteResumenUtilidadesComponent implements OnInit {

  farmaciaId: string | null = null;
  farmaciaNombre: string = '';

  filtroForm!: FormGroup;

  cargando = false;
  rows: ResumenUtilidadesRow[] = [
    { concepto: 'Ventas', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
    { concepto: 'Pedidos', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
    { concepto: 'Devoluciones', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
    { concepto: 'Cancelaciones', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
  ];

  // catálogos
  farmacias: Farmacia[] = [];
  farmaciasCargadas = false;

  // totales
  totalCantidad = 0;
  totalImporte = 0;
  totalCosto = 0;
  totalUtilidad = 0;

  constructor(
    private fb: FormBuilder,
    private reportes: ReportesService,
    private farmaciaSrv: FarmaciaService
  ) { }

  ngOnInit(): void {

    const stored = localStorage.getItem('user_farmacia');
    const farmacia = stored ? JSON.parse(stored) : null;

    if (!farmacia) {
      Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
      return;
    }

    this.farmaciaId = farmacia._id;
    this.farmaciaNombre = farmacia.nombre || '';

    const ini = this.monthStartYMD(); // 1º del mes (string)
    const fin = this.todayYMD();      // hoy (string)

    this.filtroForm = this.fb.group({
      farmaciaId: [''],
      fechaIni: [ini],
      fechaFin: [fin],
    });

    this.cargarFarmacias();
    this.limpiar();
  }

  private cargarFarmacias() {
    this.farmaciaSrv.obtenerFarmacias().subscribe({
      next: (list) => {
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any, ...(list || [])];

        const ctrl = this.filtroForm.get('farmaciaId');
        if (ctrl) ctrl.setValue(this.farmaciaId);
        
        this.farmaciasCargadas = true;
        this.buscar(); // primer load con defaults
      },
      error: () => {
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any];
        this.farmaciasCargadas = true;
        this.buscar();
      }
    });
  }

  /** 'YYYY-MM-DD' hoy (local) */
  private todayYMD(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  /** 'YYYY-MM-01' local (inicio del mes actual) */
  private monthStartYMD(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  limpiar() {
    const ini = this.monthStartYMD(); // 1º del mes
    const fin = this.todayYMD();      // hoy

    // Asigna a los form controls (inputs se actualizan inmediatamente)
    this.filtroForm.patchValue({
      farmaciaId: '',
      fechaIni: ini,
      fechaFin: fin,
    });

    // (Opcional) marcar como pristine/touched si quieres resetear estado visual
    this.filtroForm.markAsPristine();
    this.filtroForm.markAsUntouched();

    // Vuelve a consultar
    this.buscar();
  }

  buscar() {
    if (!this.farmaciasCargadas) return;

    const val = this.filtroForm.value;
    const params = {
      farmaciaId: val.farmaciaId || undefined,
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin
    };

    this.cargando = true;
    this.reportes.getResumenUtilidades(params).subscribe({
      next: (resp: ResumenUtilidadesResponse) => {
        // Asegura el orden y que vengan las 4 filas
        const byConcept: Record<string, ResumenUtilidadesRow> = {};
        (resp.rows || []).forEach(r => { byConcept[r.concepto] = r; });

        const safe = (c: any) => Number.isFinite(+c) ? +c : 0;
        const ensure = (concepto: ResumenUtilidadesRow['concepto']): ResumenUtilidadesRow => {
          const r = byConcept[concepto] || { concepto, cantidad: 0, importe: 0, costo: 0, utilidad: 0 };
          return {
            concepto,
            cantidad: safe(r.cantidad),
            importe: safe(r.importe),
            costo: safe(r.costo),
            utilidad: safe(r.utilidad),
          };
        };

        this.rows = [
          ensure('Ventas'),
          ensure('Pedidos'),
          ensure('Devoluciones'),
          ensure('Cancelaciones'),
        ];

        // Totales
        this.totalCantidad = this.rows.reduce((a, r) => a + r.cantidad, 0);
        this.totalImporte = this.rows.reduce((a, r) => a + r.importe, 0);
        this.totalCosto = this.rows.reduce((a, r) => a + r.costo, 0);
        this.totalUtilidad = this.rows.reduce((a, r) => a + r.utilidad, 0);

        this.cargando = false;
      },
      error: (err) => {
        this.cargando = false;
        this.rows = [
          { concepto: 'Ventas', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
          { concepto: 'Pedidos', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
          { concepto: 'Devoluciones', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
          { concepto: 'Cancelaciones', cantidad: 0, importe: 0, costo: 0, utilidad: 0 },
        ];
        this.totalCantidad = this.totalImporte = this.totalCosto = this.totalUtilidad = 0;

        const msg = err?.error?.mensaje || err?.message || 'No se pudo consultar el resumen de utilidades.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }
}
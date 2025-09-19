// src/app/reportes-devoluciones/devoluciones-page.component.ts
import { Component, ElementRef, OnInit, ViewChild, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ReportesDevolucionesService } from './reportes-devoluciones.service';
import { Agrupacion, Dir, Kpis, ListadoResp, OrdenTop, Vista } from './types';

import { DevolucionesKpisComponent } from './devoluciones-kpis.component';
import { DevolucionesTopTablaComponent } from './devoluciones-top-tabla.component';
import { DevolucionesListadoComponent } from './devoluciones-listado.component';

type ClienteLite = { _id: string; nombre: string; telefono?: string };
type ProductoLite = { _id: string; nombre: string; codigoBarras?: string };

@Component({
  standalone: true,
  selector: 'app-devoluciones-page',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatTooltipModule,
    DevolucionesKpisComponent, DevolucionesTopTablaComponent, DevolucionesListadoComponent],
  templateUrl: './devoluciones-page.component.html',
  styleUrls: ['./devoluciones-page.component.css']
})
export class DevolucionesPageComponent implements OnInit {
  cargando = false;

  farmacias: any[] = [];
  usuarios: any[] = [];
  motivos: string[] = [];

  kpis: Kpis | null = null;
  tops: any = {};
  rowsAgrupado: any[] = [];
  listado: ListadoResp | null = null;

  agrupaciones: Agrupacion[] = ['producto', 'motivo', 'cliente', 'usuario', 'farmacia'];
  ordenesTop: OrdenTop[] = ['importe', 'piezas', 'devoluciones'];
  dirs: Dir[] = ['desc', 'asc'];

  filtroForm!: FormGroup;

  // Sugerencias
  clienteOpts: ClienteLite[] = [];
  productoOpts: ProductoLite[] = [];

  // Selecciones
  clienteSel: ClienteLite | null = null;
  productoSel: ProductoLite | null = null;

  @ViewChild('cliInput') cliInput?: ElementRef<HTMLInputElement>;
  @ViewChild('proInput') proInput?: ElementRef<HTMLInputElement>;

  constructor(private fb: FormBuilder, private route: ActivatedRoute, private svc: ReportesDevolucionesService) { }

  ngOnInit() {
    const { farmacias, usuarios, motivos } = this.route.snapshot.data['cat'] || {};
    this.farmacias = farmacias || []; this.usuarios = usuarios || []; this.motivos = motivos || [];

    const hoy = new Date();
    const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const toYmd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    this.filtroForm = this.fb.group({
      fechaIni: [toYmd(first), Validators.required],
      fechaFin: [toYmd(hoy), Validators.required],

      farmaciaId: [''],
      clienteId: [''],
      usuarioId: [''],
      productoId: [''],
      motivo: [''],

      vista: ['resumen' as Vista, Validators.required],

      // Resumen
      topN: [10],
      ordenResumen: ['importe' as OrdenTop],
      dirResumen: ['desc' as Dir],

      // Agrupado
      agrupacion: ['producto' as Agrupacion],
      ordenAgr: ['importe' as OrdenTop],
      dirAgr: ['desc' as Dir],
      topNAgr: [10],

      // Listado
      ordenList: ['fecha'],
      dirList: ['desc' as Dir],
      page: [1],
      limit: [20],
    });

    this.buscar();
  }

  limpiar() {
    const vistaActual = this.filtroForm.value.vista as Vista;

    const hoy = new Date();
    const first = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const toYmd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    this.filtroForm.reset({
      fechaIni: toYmd(first),
      fechaFin: toYmd(hoy),

      farmaciaId: '',
      clienteId: '',
      usuarioId: '',
      productoId: '',
      motivo: '',

      vista: vistaActual,

      topN: 10,
      ordenResumen: 'importe',
      dirResumen: 'desc',

      agrupacion: 'producto',
      ordenAgr: 'importe',
      dirAgr: 'desc',
      topNAgr: 10,

      ordenList: 'fecha',
      dirList: 'desc',
      page: 1,
      limit: 20,
    });

    this.clearCliente(this.cliInput?.nativeElement);
    this.clearProducto(this.proInput?.nativeElement);

    this.buscar();
  }

  // === CLIENTE ===
  onClienteInput(q: string) {
    const query = (q || '').trim();
    if (query.length < 2) { this.clienteOpts = []; return; }

    this.svc.searchClientes(query).subscribe(list => this.clienteOpts = list);
  }

  selectCliente(c: ClienteLite) {
    this.clienteSel = c;
    this.clienteOpts = [];
    this.filtroForm.patchValue({ clienteId: c._id });
  }

  clearCliente(input?: HTMLInputElement) {
    this.clienteSel = null;
    this.filtroForm.patchValue({ clienteId: null });
    this.clienteOpts = [];                // limpiar sugerencias

    if (input) {
      input.value = '';                   // borrar lo escrito
      // opcional: forzar ciclo de input para ocultar panel si dependes de (input)
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => input.focus(), 0); // volver a enfocar
    }
  }


  // === PRODUCTO ===
  onProductoInput(q: string) {
    const query = (q || '').trim();
    if (!query) { this.productoOpts = []; return; }
    const isCB = /^\d{6,}$/.test(query);
    this.svc.searchProductos(query, isCB).subscribe(list => {
      this.productoOpts = Array.isArray(list) ? list : [];
    });
  }

  onProductoEnter(q: string) {
    // Si presionan enter con un solo resultado, selección rápida
    if (this.productoOpts.length === 1) {
      this.selectProducto(this.productoOpts[0]);
    }
  }

  selectProducto(p: ProductoLite) {
    this.productoSel = p;
    this.productoOpts = [];
    this.filtroForm.patchValue({ productoId: p._id });
  }

  clearProducto(input?: HTMLInputElement) {
    this.productoSel = null;
    this.filtroForm.patchValue({ productoId: null });
    this.productoOpts = [];
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => input.focus(), 0); // volver a enfocar
    }
  }

  // === Consultas ===
  buscar() {
    if (this.cargando) return;
    this.cargando = true;

    const v = this.filtroForm.getRawValue();
    const comunes = {
      fechaIni: v.fechaIni, fechaFin: v.fechaFin,
      farmaciaId: v.farmaciaId || undefined, clienteId: v.clienteId || undefined,
      usuarioId: v.usuarioId || undefined, productoId: v.productoId || undefined, motivo: v.motivo || undefined,
    };

    if (v.vista === 'resumen') {
      this.svc.getResumen({ ...comunes, topN: v.topN, orden: v.ordenResumen, dir: v.dirResumen }).subscribe({
        next: (data: any) => {
          this.kpis = (data?.kpis && data.kpis[0]) || null;
          this.tops = {
            productos: data?.topProductos || [],
            motivos: data?.topMotivos || [],
            clientes: data?.topClientes || [],
            usuarios: data?.topUsuarios || [],
            farmacias: data?.topFarmacias || []
          };
          this.rowsAgrupado = []; this.listado = null; this.cargando = false;
        },
        error: (err) => this.handleError(err, 'No se pudo cargar el resumen')
      });
    } else if (v.vista === 'agrupado') {
      this.svc.getAgrupado(v.agrupacion, { ...comunes, topN: v.topNAgr, orden: v.ordenAgr, dir: v.dirAgr }).subscribe({
        next: (resp) => { this.rowsAgrupado = resp?.rows || []; this.kpis = null; this.tops = {}; this.listado = null; this.cargando = false; },
        error: (err) => this.handleError(err, `No se pudo cargar el agrupado por ${v.agrupacion}`)
      });
    } else {
      this.svc.getListado({ ...comunes, orden: v.ordenList, dir: v.dirList, page: v.page, limit: v.limit }).subscribe({
        next: (resp) => { this.listado = resp; this.kpis = null; this.tops = {}; this.rowsAgrupado = []; this.cargando = false; },
        error: (err) => this.handleError(err, 'No se pudo cargar el listado')
      });
    }
  }

  /*   exportarCsv() {
      if (!this.listado?.rows?.length) return;
      const headers = ['Fecha', 'Farmacia', 'Cliente', 'Usuario', 'Producto', 'Código', 'Unidad', 'Cantidad', 'Precio', 'Importe', 'Motivo'];
      const lines = this.listado.rows.map(r => [
        new Date(r.fecha).toISOString(), r.farmacia || '', r.cliente || '', r.usuario || '',
        r.producto || '', r.codigoBarras || '', r.unidad || '', r.cantidad, r.precioUnit ?? '', r.importe, r.motivo || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...lines].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a'); a.href = url; a.download = 'devoluciones.csv'; a.click(); URL.revokeObjectURL(url);
    }
   */

  pageChange(p: number) { this.filtroForm.patchValue({ page: p }); this.buscar(); }

  private handleError(err: any, fallback: string) {
    console.error('[Devoluciones][ERROR]', err); this.cargando = false;
    const msg = err?.error?.mensaje || err?.message || fallback; Swal.fire('Error', msg, 'error');
  }

}


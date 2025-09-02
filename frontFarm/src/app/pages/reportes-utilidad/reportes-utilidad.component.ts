import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { MatTooltipModule } from '@angular/material/tooltip';

// Ajusta imports según tu proyecto:
import { ReportesService } from '../../services/reportes.service';
import { FarmaciaService, Farmacia } from '../../services/farmacia.service';
import { UsuarioService, Usuario } from '../../services/usuario.service';
import { ClienteService } from '../../services/cliente.service';
import { ProductoService } from '../../services/producto.service';

type ReportType = 'usuarios' | 'clientes' | 'productos';
type FooterProductos = {
  numVentas: number;
  importe: number;
  costo: number;
  utilidad: number;
  gananciaPct: number | null;
};

type FooterUsuarios = {
  gananciaPct: number | null;
  totalCostoPedidos: number;
  totalCostoVentas: number;
  totalEgresos: number;
  totalImpPedidos: number;
  totalImpVentas: number;
  totalIngresos: number;
  totalPedidos: number;
  totalUtilidad: number;
  totalVentas: number;
};

type FooterClientes = {
  gananciaPct: number | null;
  totalCostoPedidos: number;
  totalCostoVentas: number;
  totalEgresos: number;
  totalImpPedidos: number;
  totalImpVentas: number;
  totalIngresos: number;
  totalMonedero: number;
  totalPedidos: number;
  totalUtilidad: number;
  totalVentas: number;
};

@Component({
  selector: 'app-reportes-utilidad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatTooltipModule],
  templateUrl: './reportes-utilidad.component.html',
  styleUrl: './reportes-utilidad.component.css'
})
export class ReportesUtilidadComponent implements OnInit {
  filtroForm!: FormGroup;

  cargando = false;
  // selector de reporte
  reportType: ReportType = 'clientes'; // default si quieres

  // catálogos (para selects)
  farmacias: Farmacia[] = [];
  usuarios: Usuario[] = [];
  clientes: Array<{ _id: string; nombre: string }> = [];
  catCargados = { farmacias: false, usuarios: false, clientes: false };

  // resultados
  rowsClientes: any[] = [];
  rowsProductos: any[] = [];
  rowsUsuarios: any[] = [];

  productoResueltoNombre = '';
  errorProductoCB = '';

  footerProductos: FooterProductos | null = null;
  footerUsuarios: FooterUsuarios | null = null;
  footerClientes: FooterClientes | null = null;

  constructor(
    private fb: FormBuilder,
    private reportes: ReportesService,
    private farmaciaSrv: FarmaciaService,
    private usuarioSrv: UsuarioService,
    private clienteSrv: ClienteService,
    private productoSrv: ProductoService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    /* const ini = this.monthStartYMD(); */
    const fin = this.todayYMD();
    const ini = this.todayYMD();

    this.filtroForm = this.fb.group({
      // base
      fechaIni: [ini, Validators.required],
      fechaFin: [fin, Validators.required],
      // selector reporte
      tipo: [this.reportType, Validators.required],

      // comunes / opcionales
      farmaciaId: [''],   // se usa en “productos” (y podrás usarlo en otros si lo decides)

      // -------- CLIENTES --------
      clienteId: [''],
      cantClientes: [''],         // requerido si NO hay clienteId
      ordenClientes: ['ventas'],

      // -------- PRODUCTOS --------
      codigoBarras: [''],
      productoId: [''],
      cantProductos: [''],         // requerido si NO hay productoId
      ordenProductos: ['ventas'],

      // -------- USUARIOS --------
      usuarioId: [''],
      ordenUsuarios: ['ventas'],
    });

    this.cargarCatalogos();

    // reaccionar al cambio de tipo
    this.filtroForm.get('tipo')!.valueChanges.subscribe((t: ReportType) => {
      this.reportType = t;
    });

    this.filtroForm.get('productoId')?.valueChanges.subscribe(() => this.syncCantProductosState());
    this.syncCantProductosState();

  }

  // Helpers fechas
  private todayYMD(): string {
    const d = new Date();
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  private monthStartYMD(): string {
    const d = new Date();
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }


  private readonly collator = new Intl.Collator('es', {
    sensitivity: 'base',
    ignorePunctuation: true,
    numeric: true,
  });

  private sortByNombre<T extends { nombre?: string }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => this.collator.compare(a.nombre || '', b.nombre || ''));
  }

  private cargarCatalogos() {
    this.farmaciaSrv.obtenerFarmacias().subscribe({
      next: (list) => {
        this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any, ...(list || [])];
        this.catCargados.farmacias = true;
      },
      error: () => { this.farmacias = [{ _id: '' as any, nombre: 'TODAS' } as any]; this.catCargados.farmacias = true; }
    });

    this.usuarioSrv.obtenerUsuarios().subscribe({
      next: (list) => { this.usuarios = list || []; this.catCargados.usuarios = true; },
      error: () => { this.usuarios = []; this.catCargados.usuarios = true; }
    });

    this.clienteSrv.getClientes().subscribe({
      next: (list) => {
        const base = (list || []).map((c: any) => ({ _id: c._id, nombre: c.nombre }));
        const ordenadas = this.sortByNombre(base);
        this.clientes = [{ _id: '', nombre: '(Todos)' }, ...ordenadas];;
        this.catCargados.clientes = true;
      },
      error: () => { this.clientes = []; this.catCargados.clientes = true; }
    });
  }

  limpiar() {
    // Resetea filtros comunes
    this.filtroForm.patchValue({
      fechaIni: this.monthStartYMD(),
      /* fechaFin: this.todayYMD(), */
      fechaFin: this.monthStartYMD(),
      farmaciaId: '',
      // Productos
      codigoBarras: '',
      productoId: '',
      cantProductos: null,
      ordenProductos: 'utilidad',
      // Clientes
      clienteId: '',
      cantClientes: null,
      ordenClientes: 'utilidad',
      // Usuarios
      usuarioId: '',
      cantUsuarios: null,
      ordenUsuarios: 'utilidad',
    }, { emitEvent: false });

    // Limpia tablas y estados
    this.productoResueltoNombre = '';
    this.errorProductoCB = '';
    this.rowsProductos = [];
    this.rowsClientes = [];
    this.rowsUsuarios = [];
    this.footerProductos = null;
    this.footerUsuarios = null;
    this.footerClientes = null;
    (this as any).footerProductos = null;
    (this as any).footerClientes = null;
    (this as any).footerUsuarios = null;

    //this.buscar();
  }

  async buscar() {
    if (this.cargando) return;

    // 1) Prelimpieza por tipo de reporte
    if (this.reportType === 'productos') {
      this.rowsProductos = [];
      (this as any).footerProductos = null;

      // Si hay CB escrito pero no hay productoId (o no coincide),
      // primero resuelve el producto y espera
      const cb = String(this.filtroForm.get('codigoBarras')?.value || '').trim();
      const pid = String(this.filtroForm.get('productoId')?.value || '').trim();
      if (cb && !pid) {
        await this.resolverProductoPorCB();
      }

      // Si tras resolver existe productoId -> anula cantProductos
      const pid2 = String(this.filtroForm.get('productoId')?.value || '').trim();
      if (pid2) {
        this.filtroForm.patchValue({ cantProductos: null }, { emitEvent: false });
      }
    } else if (this.reportType === 'clientes') {
      this.rowsClientes = [];
      (this as any).footerClientes = null;
    } else if (this.reportType === 'usuarios') {
      this.rowsUsuarios = [];
      (this as any).footerUsuarios = null;
    }

    // 2) Ahora sí lee el form (ya sin carreras)
    const val = this.filtroForm.getRawValue();
    const { fechaIni, fechaFin } = val;
    if (!fechaIni || !fechaFin) {
      Swal.fire('Faltan datos', 'Selecciona fecha inicial y final.', 'warning');
      return;
    }

    this.cargando = true;

    switch (this.reportType) {
      case 'clientes': this.buscarClientes(val); break;
      case 'productos': this.buscarProductos(val); break;
      case 'usuarios': this.buscarUsuarios(val); break;
    }
  }

  // ====== CLIENTES ======
  private buscarClientes(val: any) {
    const clienteId = val.clienteId || undefined;
    const orden = (val.ordenClientes || 'utilidad').toLowerCase(); // utilidad | ventas

    if (!clienteId) {
      const n = parseInt(String(val.cantClientes || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        this.cargando = false;
        Swal.fire({
          icon: 'warning',
          title: 'Faltan datos',
          text: 'Ingresa ¿Cuántos clientes? ó selecciona un cliente.',
          timer: 3000,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        return;
      }
    }

    const params = this.cleanParams({
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin,
      clienteId,
      CantClientes: clienteId ? undefined : val.cantClientes,
      orden
    });

    this.reportes.getUtilidadPorClientes(params).subscribe({
      next: (resp: any) => {
        this.rowsClientes = resp?.rows || [];
        this.footerClientes =
          (resp?.footer as FooterClientes) ??
          null;
        this.cargando = false;
        console.log('fotter clientes ', this.footerClientes);

      },
      error: (err) => {
        console.error('[Utilidad x clientes][ERROR]', err);
        this.rowsClientes = [];
        this.cargando = false;
        const msg = err?.error?.mensaje || err?.message || 'No se pudo consultar Utilidad por clientes.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  // ====== PRODUCTOS ======
  private buscarProductos(_val: any) {
    const val = _val ?? this.filtroForm.getRawValue();

    const productoId = (val.productoId ?? '').toString().trim() || undefined;
    const orden = (val.ordenProductos || 'utilidad').toLowerCase();
    const farmaciaId = (val.farmaciaId ?? '').toString().trim() || undefined;

    if (!productoId) {
      const n = parseInt(String(val.cantProductos || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        this.cargando = false;
        Swal.fire({
          icon: 'warning',
          title: 'Faltan datos',
          text: 'Ingresa ¿Cuántos productos? ó selecciona un producto.',
          timer: 3000,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        return;
      }
    }

    const params = this.cleanParams({
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin,
      productoId,
      cantProductos: productoId ? undefined : val.cantProductos,
      orden,
      farmaciaId
    });

    this.reportes.getUtilidadPorProductos(params).subscribe({
      next: (resp: any) => {
        this.rowsProductos = resp?.rows || [];
        this.footerProductos =
          (resp?.footer as FooterProductos) ??
          null;
        this.cargando = false;
      },
      error: (err) => {
        this.rowsProductos = [];
        this.footerProductos = null;   // <— importante limpiar en error
        this.cargando = false;
        const msg = err?.error?.mensaje || err?.message || 'No se pudo consultar Utilidad por productos.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  // ====== USUARIOS ======
  private buscarUsuarios(val: any) {
    const usuarioId = val.usuarioId || undefined;
    const orden = (val.ordenUsuarios || 'utilidad').toLowerCase(); // utilidad | ventas

    const params = this.cleanParams({
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin,
      usuarioId,
      orden
    });

    this.reportes.getUtilidadPorUsuarios(params).subscribe({
      next: (resp: any) => {
        this.rowsUsuarios = resp?.rows || [];
        this.footerUsuarios =
          (resp?.footer as FooterUsuarios) ??
          null;
        this.cargando = false;
      },
      error: (err) => {
        console.error('[Utilidad x usuarios][ERROR]', err);
        this.rowsUsuarios = [];
        this.cargando = false;
        const msg = err?.error?.mensaje || err?.message || 'No se pudo consultar Utilidad por usuarios.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  private toYmd(d: any): string | undefined {
    if (!d) return undefined;
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return undefined;
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  private cleanParams<T extends Record<string, any>>(obj: T): Partial<T> {
    const out: any = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = v;
    });
    return out;
  }


  // helper: habilita/deshabilita cantProductos según haya productoId
  private syncCantProductosState() {
    const pid = (this.filtroForm.get('productoId')?.value || '').toString().trim();
    const ctrl = this.filtroForm.get('cantProductos');
    if (!ctrl) return;
    if (pid) {
      ctrl.disable({ emitEvent: false });
      ctrl.setValue('', { emitEvent: false });
    } else {
      ctrl.enable({ emitEvent: false });
    }
  }

  async resolverProductoPorCB(): Promise<void> {
    this.errorProductoCB = '';
    const cb = String(this.filtroForm.value.codigoBarras || '').trim();

    if (!cb) {
      this.filtroForm.patchValue({ productoId: '', cantProductos: null }, { emitEvent: false });
      this.productoResueltoNombre = '';
      this.rowsProductos = [];
      (this as any).footerProductos = null;
      return;
    }

    try {
      // NO toques this.cargando aquí para no bloquear el click
      const resp = await firstValueFrom(this.productoSrv.buscarPorCodigoBarras(cb));
      const prod = resp?.producto;
      if (prod && prod._id) {
        this.filtroForm.patchValue(
          { productoId: prod._id, cantProductos: null },
          { emitEvent: false }
        );
        this.productoResueltoNombre = prod.nombre || '';
        // limpia resultados previos
        this.rowsProductos = [];
        (this as any).footerProductos = null;
      } else {
        this.filtroForm.patchValue({ productoId: '', cantProductos: null }, { emitEvent: false });
        this.productoResueltoNombre = '';
        this.errorProductoCB = 'No se encontró un producto con ese código.';
      }
    } catch {
      this.filtroForm.patchValue({ productoId: '', cantProductos: null }, { emitEvent: false });
      this.productoResueltoNombre = '';
      this.errorProductoCB = 'Error consultando el producto.';
    }
  }

}

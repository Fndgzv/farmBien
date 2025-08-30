import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';

// Ajusta imports según tu proyecto:
import { ReportesService } from '../../services/reportes.service';
import { FarmaciaService, Farmacia } from '../../services/farmacia.service';
import { UsuarioService, Usuario } from '../../services/usuario.service';
import { ClienteService } from '../../services/cliente.service';

type ReportType = 'usuarios' | 'clientes' | 'productos';

@Component({
  selector: 'app-reportes-utilidad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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

  constructor(
    private fb: FormBuilder,
    private reportes: ReportesService,
    private farmaciaSrv: FarmaciaService,
    private usuarioSrv: UsuarioService,
    private clienteSrv: ClienteService
  ) {}

  ngOnInit(): void {
    const ini = this.monthStartYMD();
    const fin = this.todayYMD();

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
      ordenClientes: ['utilidad'], // utilidad | ventas

      // -------- PRODUCTOS --------
      productoId: [''],
      cantProductos: [''],         // requerido si NO hay productoId
      ordenProductos: ['utilidad'], // utilidad | ventas

      // -------- USUARIOS --------
      usuarioId: [''],
      ordenUsuarios: ['utilidad'], // utilidad | ventas
    });

    this.cargarCatalogos();
    // reaccionar al cambio de tipo
    this.filtroForm.get('tipo')!.valueChanges.subscribe((t: ReportType) => {
      this.reportType = t;
      // opcional: limpiar resultados al cambiar de tipo
      // this.rowsClientes = this.rowsProductos = this.rowsUsuarios = [];
    });
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
        this.clientes = base;
        this.catCargados.clientes = true;
      },
      error: () => { this.clientes = []; this.catCargados.clientes = true; }
    });
  }

  limpiar() {
    const ini = this.monthStartYMD();
    const fin = this.todayYMD();
    const tipoActual = this.filtroForm.get('tipo')!.value as ReportType;

    this.filtroForm.reset({
      fechaIni: ini,
      fechaFin: fin,
      tipo: tipoActual,

      farmaciaId: '',

      clienteId: '',
      cantClientes: '',
      ordenClientes: 'utilidad',

      productoId: '',
      cantProductos: '',
      ordenProductos: 'utilidad',

      usuarioId: '',
      ordenUsuarios: 'utilidad',
    });
    this.filtroForm.markAsPristine();
    this.filtroForm.markAsUntouched();
  }

  buscar() {
    if (this.cargando) return;
    const val = this.filtroForm.value;
    const fechaIni = val.fechaIni;
    const fechaFin = val.fechaFin;

    if (!fechaIni || !fechaFin) {
      Swal.fire('Faltan datos', 'Selecciona fecha inicial y final.', 'warning');
      return;
    }

    this.cargando = true;

    switch (this.reportType) {
      case 'clientes':
        this.buscarClientes(val);
        break;
      case 'productos':
        this.buscarProductos(val);
        break;
      case 'usuarios':
        this.buscarUsuarios(val);
        break;
    }
  }

  // ====== CLIENTES ======
  private buscarClientes(val: any) {
    const clienteId = val.clienteId || undefined;
    const orden = (val.ordenClientes || 'utilidad').toLowerCase(); // utilidad | ventas

    // Si no hay clienteId → cantClientes obligatorio
    if (!clienteId) {
      const n = parseInt(String(val.cantClientes || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        this.cargando = false;
        Swal.fire('Faltan datos', 'Ingresa CantClientes (> 0) o selecciona un cliente.', 'warning');
        return;
      }
    }

    this.reportes.getUtilidadPorClientes({
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin,
      clienteId,
      CantClientes: clienteId ? undefined : val.cantClientes,
      orden
    }).subscribe({
      next: (resp: any) => {
        this.rowsClientes = resp?.rows || [];
        this.cargando = false;
      },
      error: (err) => {
        this.rowsClientes = [];
        this.cargando = false;
        const msg = err?.error?.mensaje || 'No se pudo consultar Utilidad por clientes.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  // ====== PRODUCTOS ======
  private buscarProductos(val: any) {
    const productoId = val.productoId || undefined;
    const orden = (val.ordenProductos || 'utilidad').toLowerCase(); // utilidad | ventas
    const farmaciaId = val.farmaciaId || undefined;

    if (!productoId) {
      const n = parseInt(String(val.cantProductos || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        this.cargando = false;
        Swal.fire('Faltan datos', 'Ingresa cantProductos (> 0) o selecciona un producto.', 'warning');
        return;
      }
    }

    this.reportes.getUtilidadPorProductos({
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin,
      productoId,
      cantProductos: productoId ? undefined : val.cantProductos,
      orden,
      farmaciaId
    }).subscribe({
      next: (resp: any) => {
        this.rowsProductos = resp?.rows || [];
        this.cargando = false;
      },
      error: (err) => {
        this.rowsProductos = [];
        this.cargando = false;
        const msg = err?.error?.mensaje || 'No se pudo consultar Utilidad por productos.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  // ====== USUARIOS ======
  private buscarUsuarios(val: any) {
    const usuarioId = val.usuarioId || undefined;
    const orden = (val.ordenUsuarios || 'utilidad').toLowerCase(); // utilidad | ventas

    // Ajusta este método a tu endpoint real:
    this.reportes.getUtilidadPorUsuarios({
      fechaIni: val.fechaIni,
      fechaFin: val.fechaFin,
      usuarioId,
      cantUsuarios: usuarioId ? undefined : val.cantUsuarios,
      orden
    }).subscribe({
      next: (resp: any) => {
        this.rowsUsuarios = resp?.rows || [];
        this.cargando = false;
      },
      error: (err) => {
        this.rowsUsuarios = [];
        this.cargando = false;
        const msg = err?.error?.mensaje || 'No se pudo consultar Utilidad por usuarios.';
        Swal.fire('Error', msg, 'error');
      }
    });
  }
}

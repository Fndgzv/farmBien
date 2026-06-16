import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faFileExcel, faPen, faPlus, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { Laboratorio, LaboratoriosService } from '../../services/laboratorios.service';

declare const bootstrap: any;

@Component({
  selector: 'app-laboratorios',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FontAwesomeModule, MatTooltipModule],
  templateUrl: './laboratorios.component.html',
  styleUrl: './laboratorios.component.css',
})
export class LaboratoriosComponent implements OnInit {
  laboratorios: Laboratorio[] = [];
  formLaboratorio: FormGroup = new FormGroup({});

  filtroLaboratorio = '';
  tipoBusqueda: 'comienza' | 'incluye' = 'incluye';
  modoEdicion = false;
  laboratorioEditandoId: string | null = null;
  guardando = false;
  cargando = false;
  columnaOrden: '' | 'laboratorio' = '';
  direccionOrden: 'asc' | 'desc' = 'asc';

  paginaActual = 1;
  laboratoriosPorPagina = 20;
  opcionesPagina = [10, 20, 50, 100];

  constructor(
    private fb: FormBuilder,
    private laboratoriosService: LaboratoriosService,
    private library: FaIconLibrary
  ) {
    library.addIcons(faFileExcel, faPen, faPlus, faSearch, faTimes);
  }

  ngOnInit(): void {
    this.formLaboratorio = this.fb.group({
      laboratorio: ['', [Validators.required, Validators.minLength(2)]],
    });

    this.cargarLaboratorios();
  }

  cargarLaboratorios(): void {
    this.cargando = true;
    this.laboratoriosService.obtenerLaboratorios({
      laboratorio: this.filtroLaboratorio,
      tipoBusqueda: this.tipoBusqueda,
    }).subscribe({
      next: (data) => {
        this.laboratorios = data || [];
        this.aplicarOrdenLaboratorios(false);
        this.paginaActual = 1;
        this.cargando = false;
      },
      error: (err) => {
        this.cargando = false;
        const msg = err?.error?.mensaje || 'No se pudieron cargar los laboratorios';
        Swal.fire('Error', msg, 'error');
      },
    });
  }

  limpiarFiltros(): void {
    this.filtroLaboratorio = '';
    this.tipoBusqueda = 'incluye';
    this.cargarLaboratorios();
  }

  get laboratoriosPaginados(): Laboratorio[] {
    const inicio = (this.paginaActual - 1) * this.laboratoriosPorPagina;
    return this.laboratorios.slice(inicio, inicio + this.laboratoriosPorPagina);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.laboratorios.length / this.laboratoriosPorPagina));
  }

  get paginas(): number[] {
    return Array.from({ length: this.totalPaginas }, (_, i) => i + 1);
  }

  cambiarTamanioPagina(): void {
    this.paginaActual = 1;
  }

  irPrimeraPagina(): void {
    this.paginaActual = 1;
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) this.paginaActual--;
  }

  irPagina(pagina: number): void {
    const paginaSegura = Math.min(Math.max(Number(pagina) || 1, 1), this.totalPaginas);
    this.paginaActual = paginaSegura;
  }

  paginaSiguiente(): void {
    if (this.paginaActual < this.totalPaginas) this.paginaActual++;
  }

  irUltimaPagina(): void {
    this.paginaActual = this.totalPaginas;
  }

  ordenarPorLaboratorio(): void {
    if (this.columnaOrden === 'laboratorio') {
      this.direccionOrden = this.direccionOrden === 'asc' ? 'desc' : 'asc';
    } else {
      this.columnaOrden = 'laboratorio';
      this.direccionOrden = 'asc';
    }

    this.aplicarOrdenLaboratorios(true);
  }

  exportarExcel(): void {
    const visibles = this.laboratoriosPaginados;

    if (!visibles.length) {
      Swal.fire('Sin registros', 'No hay laboratorios visibles para exportar.', 'info');
      return;
    }

    const data = visibles.map((lab) => ({
      Laboratorio: String(lab?.laboratorio || '').trim(),
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laboratorios');
    XLSX.writeFile(wb, `laboratorios-${this.stampArchivo()}.xlsx`);
  }

  private aplicarOrdenLaboratorios(resetPagina: boolean): void {
    if (this.columnaOrden !== 'laboratorio') return;

    const factor = this.direccionOrden === 'asc' ? 1 : -1;
    this.laboratorios = [...this.laboratorios].sort((a, b) => {
      const valorA = this.normalizarTexto(a?.laboratorio);
      const valorB = this.normalizarTexto(b?.laboratorio);
      return valorA.localeCompare(valorB, 'es', { sensitivity: 'base' }) * factor;
    });

    if (resetPagina) this.paginaActual = 1;
  }

  private normalizarTexto(valor: any): string {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stampArchivo(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  abrirModalAgregar(): void {
    this.modoEdicion = false;
    this.laboratorioEditandoId = null;
    this.formLaboratorio.reset({ laboratorio: '' });
    this.abrirModal();
  }

  editar(laboratorio: Laboratorio): void {
    this.modoEdicion = true;
    this.laboratorioEditandoId = laboratorio._id || null;
    this.formLaboratorio.reset({ laboratorio: laboratorio.laboratorio || '' });
    this.abrirModal();
  }

  guardar(): void {
    if (this.formLaboratorio.invalid || this.guardando) return;

    this.guardando = true;
    const datos = {
      laboratorio: String(this.formLaboratorio.value.laboratorio || '').trim(),
    };

    const request = this.modoEdicion && this.laboratorioEditandoId
      ? this.laboratoriosService.actualizarLaboratorio(this.laboratorioEditandoId, datos)
      : this.laboratoriosService.crearLaboratorio(datos);

    request.subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarModal();
        Swal.fire(
          this.modoEdicion ? 'Actualizado' : 'Agregado',
          this.modoEdicion ? 'Laboratorio actualizado' : 'Laboratorio creado',
          'success'
        );
        this.modoEdicion = false;
        this.laboratorioEditandoId = null;
        this.cargarLaboratorios();
      },
      error: (err) => {
        this.guardando = false;
        const msg = err?.error?.mensaje || (this.modoEdicion ? 'No se pudo actualizar' : 'No se pudo crear');
        Swal.fire('Error', msg, 'error');
      },
    });
  }

  private abrirModal(): void {
    const modalElement = document.getElementById('modalLaboratorio');
    if (modalElement) {
      new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false }).show();
    }
  }

  private cerrarModal(): void {
    const modalElement = document.getElementById('modalLaboratorio');
    if (modalElement) bootstrap.Modal.getInstance(modalElement)?.hide();
  }
}

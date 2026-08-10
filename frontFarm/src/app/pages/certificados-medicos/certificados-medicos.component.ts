import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

import { CertificadoMedicoComponent } from '../../components/certificado-medico/certificado-medico.component';
import { AuthService } from '../../services/auth.service';
import { CertificadosMedicosService } from '../../services/certificados-medicos.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { UsuarioService } from '../../services/usuario.service';

type CampoOrden = 'farmacia' | 'nombre' | 'responsable' | 'medico' | 'fechaRevision';

@Component({
  selector: 'app-certificados-medicos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatTooltipModule],
  templateUrl: './certificados-medicos.component.html',
  styleUrls: ['./certificados-medicos.component.css'],
})
export class CertificadosMedicosComponent implements OnInit {
  formFiltros!: FormGroup;
  certificados: any[] = [];
  farmacias: any[] = [];
  usuariosMedicos: any[] = [];
  medicosFarmacia: any[] = [];

  rol = '';
  cargando = false;
  pagina = 1;
  readonly limite = 20;
  total = 0;
  totalPaginas = 1;
  sortBy: CampoOrden = 'fechaRevision';
  sortDir: 'asc' | 'desc' = 'desc';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private certificadosService: CertificadosMedicosService,
    private farmaciaService: FarmaciaService,
    private usuarioService: UsuarioService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    const usuario = this.authService.getUserData() || {};
    this.rol = String(usuario.rol || '');

    this.formFiltros = this.fb.group({
      farmacia: [''],
      nombre: [''],
      responsable: [''],
      medico: [''],
      fechaRevision: [''],
    });

    this.formFiltros.valueChanges.subscribe(() => {
      this.pagina = 1;
    });

    if (this.esAdmin) this.cargarCatalogosAdmin();
    else this.inicializarMedico(usuario);
  }

  get esAdmin(): boolean {
    return this.rol === 'admin';
  }

  buscar(): void {
    if (this.cargando) return;
    this.cargando = true;
    const filtros = this.formFiltros.getRawValue();

    this.certificadosService.obtenerListado({
      ...filtros,
      page: this.pagina,
      limit: this.limite,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
    }).subscribe({
      next: resp => {
        this.certificados = Array.isArray(resp?.certificados) ? resp.certificados : [];
        this.total = Number(resp?.paginacion?.total || 0);
        this.totalPaginas = Math.max(1, Number(resp?.paginacion?.totalPages || 1));
        this.pagina = Math.min(Math.max(1, Number(resp?.paginacion?.page || this.pagina)), this.totalPaginas);
        this.cargando = false;
      },
      error: err => {
        this.certificados = [];
        this.total = 0;
        this.totalPaginas = 1;
        this.cargando = false;
        Swal.fire('Error', err?.error?.mensaje || 'No se pudieron cargar los certificados médicos.', 'error');
      },
    });
  }

  onFarmaciaCambio(): void {
    this.pagina = 1;
    this.actualizarMedicosFarmacia();
  }

  limpiarFiltro(campo: string): void {
    this.formFiltros.get(campo)?.setValue('');
    if (campo === 'farmacia') this.actualizarMedicosFarmacia();
    this.buscar();
  }

  ordenar(campo: CampoOrden): void {
    if (this.sortBy === campo) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.sortBy = campo;
      this.sortDir = 'asc';
    }
    this.pagina = 1;
    this.buscar();
  }

  indicadorOrden(campo: CampoOrden): string {
    if (this.sortBy !== campo) return '↕';
    return this.sortDir === 'asc' ? '▲' : '▼';
  }

  agregar(): void {
    this.abrirModal({ modo: 'alta' });
  }

  editar(certificado: any): void {
    const id = String(certificado?._id || '').trim();
    if (!id) return;
    this.abrirModal({ modo: 'edicion', certificadoId: id });
  }

  irAPrimera(): void {
    if (this.pagina === 1) return;
    this.pagina = 1;
    this.buscar();
  }

  paginaAnterior(): void {
    if (this.pagina <= 1) return;
    this.pagina--;
    this.buscar();
  }

  paginaSiguiente(): void {
    if (this.pagina >= this.totalPaginas) return;
    this.pagina++;
    this.buscar();
  }

  irAUltima(): void {
    if (this.pagina === this.totalPaginas) return;
    this.pagina = this.totalPaginas;
    this.buscar();
  }

  fechaVisible(fecha: any): string {
    const match = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
  }

  private abrirModal(data: any): void {
    const ref = this.dialog.open(CertificadoMedicoComponent, {
      width: '98vw',
      maxWidth: '1500px',
      height: '95vh',
      maxHeight: '95vh',
      disableClose: true,
      panelClass: 'certificado-medico-dialog',
      data: { ...data, origen: 'certificados-medicos' },
    });

    ref.afterClosed().subscribe(resultado => {
      if (resultado?.guardado) this.buscar();
    });
  }

  private cargarCatalogosAdmin(): void {
    forkJoin({
      farmacias: this.farmaciaService.obtenerFarmacias(),
      usuarios: this.usuarioService.obtenerUsuarios(),
    }).subscribe({
      next: ({ farmacias, usuarios }) => {
        this.farmacias = (Array.isArray(farmacias) ? farmacias : []).filter((f: any) => f?.activo !== false);
        this.usuariosMedicos = (Array.isArray(usuarios) ? usuarios : []).filter(
          (u: any) => u?.rol === 'medico' && u?.activo !== false
        );

        const farmaciaActiva = this.obtenerFarmaciaLocal();
        const inicial = this.farmacias.some(f => String(f?._id) === String(farmaciaActiva?._id))
          ? String(farmaciaActiva._id)
          : '';
        this.formFiltros.get('farmacia')?.setValue(inicial, { emitEvent: false });
        this.actualizarMedicosFarmacia();
        this.buscar();
      },
      error: () => {
        this.farmacias = [];
        this.usuariosMedicos = [];
        this.medicosFarmacia = [];
        this.buscar();
      },
    });
  }

  private inicializarMedico(usuario: any): void {
    const farmacia = usuario?.farmacia || this.obtenerFarmaciaLocal();
    const farmaciaId = String(farmacia?._id || farmacia || '').trim();
    this.farmacias = farmaciaId ? [{ ...(typeof farmacia === 'object' ? farmacia : {}), _id: farmaciaId }] : [];
    this.formFiltros.patchValue({ farmacia: farmaciaId, medico: '' }, { emitEvent: false });
    this.formFiltros.get('farmacia')?.disable({ emitEvent: false });
    this.buscar();
  }

  private actualizarMedicosFarmacia(): void {
    const farmaciaId = String(this.formFiltros.get('farmacia')?.value || '').trim();
    this.medicosFarmacia = this.usuariosMedicos.filter(
      usuario => this.idFarmaciaUsuario(usuario) === farmaciaId
    );

    const medicoSeleccionado = String(this.formFiltros.get('medico')?.value || '').trim();
    if (medicoSeleccionado && !this.medicosFarmacia.some(m => String(m?._id) === medicoSeleccionado)) {
      this.formFiltros.get('medico')?.setValue('', { emitEvent: false });
    }
  }

  private idFarmaciaUsuario(usuario: any): string {
    const farmacia = usuario?.farmacia;
    return String(typeof farmacia === 'object' ? farmacia?._id : farmacia || '').trim();
  }

  private obtenerFarmaciaLocal(): any {
    try {
      return JSON.parse(localStorage.getItem('user_farmacia') || 'null');
    } catch {
      return null;
    }
  }
}

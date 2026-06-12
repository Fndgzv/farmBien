import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';

import { PacientesService } from '../../services/pacientes.service';

declare const bootstrap: any;

type ExpedienteTab = 'datos' | 'contacto' | 'antecedentes' | 'signos' | 'notas' | 'recetas' | 'farmacias';
type SortCol = 'nombre' | 'apPaterno' | 'apMaterno' | 'fechaNacimiento' | 'sexo' | 'curp' | 'contacto' | 'telefono' | 'parentesco';
type SortKey = SortCol;

interface PacientesFiltros {
  q: string;
  sexo: string;
  fechaNacimientoInicial: string;
  fechaNacimientoFinal: string;
  farmaciaId: string;
}

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './pacientes.component.html',
  styleUrl: './pacientes.component.css'
})
export class PacientesComponent implements OnInit {
  pacientes: any[] = [];
  farmaciasDisponibles: Array<{ _id: string; nombre: string }> = [];

  filtros: PacientesFiltros = this.filtrosVacios();
  filtrosAplicados: PacientesFiltros = this.filtrosVacios();

  cargando = false;
  cargandoExpediente = false;
  guardando = false;
  errorCarga = '';

  pacienteExpediente: any = null;
  editForm: any = this.formVacio();
  activeTab: ExpedienteTab = 'datos';

  sort: { key: SortKey; dir: 'asc' | 'desc' } = { key: 'nombre', dir: 'asc' };
  page = 1;
  limit = 20;
  readonly opcionesRegistrosPorPagina = [10, 20, 50, 100];

  readonly sexoOptions = [
    { value: '', label: 'Todos' },
    { value: 'M', label: 'Masculino' },
    { value: 'F', label: 'Femenino' },
    { value: 'Otro', label: 'Otro' },
    { value: 'NoEspecifica', label: 'No especificado' },
  ];

  readonly sexoEditOptions = this.sexoOptions.filter(s => s.value);

  readonly entidadesNacimiento = [
    { value: '', label: 'Seleccione' },
    { value: 'AS', label: 'Aguascalientes' },
    { value: 'BC', label: 'Baja California' },
    { value: 'BS', label: 'Baja California Sur' },
    { value: 'CC', label: 'Campeche' },
    { value: 'CL', label: 'Coahuila' },
    { value: 'CM', label: 'Colima' },
    { value: 'CS', label: 'Chiapas' },
    { value: 'CH', label: 'Chihuahua' },
    { value: 'DF', label: 'Ciudad de Mexico' },
    { value: 'DG', label: 'Durango' },
    { value: 'GT', label: 'Guanajuato' },
    { value: 'GR', label: 'Guerrero' },
    { value: 'HG', label: 'Hidalgo' },
    { value: 'JC', label: 'Jalisco' },
    { value: 'MC', label: 'Mexico' },
    { value: 'MN', label: 'Michoacan' },
    { value: 'MS', label: 'Morelos' },
    { value: 'NT', label: 'Nayarit' },
    { value: 'NL', label: 'Nuevo Leon' },
    { value: 'OC', label: 'Oaxaca' },
    { value: 'PL', label: 'Puebla' },
    { value: 'QT', label: 'Queretaro' },
    { value: 'QR', label: 'Quintana Roo' },
    { value: 'SP', label: 'San Luis Potosi' },
    { value: 'SL', label: 'Sinaloa' },
    { value: 'SR', label: 'Sonora' },
    { value: 'TC', label: 'Tabasco' },
    { value: 'TS', label: 'Tamaulipas' },
    { value: 'TL', label: 'Tlaxcala' },
    { value: 'VZ', label: 'Veracruz' },
    { value: 'YN', label: 'Yucatan' },
    { value: 'ZS', label: 'Zacatecas' },
    { value: 'NE', label: 'Extranjero' },
  ];

  private modalRef: any = null;
  private readonly collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  constructor(private pacientesService: PacientesService) { }

  ngOnInit(): void {
    this.cargarPacientes();
  }

  cargarPacientes(): void {
    this.cargando = true;
    this.errorCarga = '';

    this.pacientesService.listarPacientes().subscribe({
      next: (resp: any) => {
        this.pacientes = Array.isArray(resp?.pacientes) ? resp.pacientes : [];
        this.farmaciasDisponibles = this.extraerFarmaciasDisponibles(this.pacientes);
        this.resetPaginacion();
        this.cargando = false;
      },
      error: (err) => {
        console.error('[pacientes-admin][listar]', err);
        this.pacientes = [];
        this.farmaciasDisponibles = [];
        this.errorCarga = err?.error?.msg || 'No se pudo cargar la lista de pacientes.';
        this.cargando = false;
        Swal.fire('Error', this.errorCarga, 'error');
      }
    });
  }

  buscar(): void {
    if (!this.rangoFechasValido()) {
      Swal.fire('Aviso', 'La fecha inicial no puede ser mayor que la fecha final.', 'warning');
      return;
    }

    this.filtrosAplicados = { ...this.filtros };
    this.resetPaginacion();
  }

  limpiarFiltros(): void {
    this.filtros = this.filtrosVacios();
    this.filtrosAplicados = this.filtrosVacios();
    this.sort = { key: 'nombre', dir: 'asc' };
    this.resetPaginacion();
  }

  setSort(col: SortCol): void {
    if (!this.sort || this.sort.key !== col) {
      this.sort = { key: col, dir: 'asc' };
      this.resetPaginacion();
      return;
    }

    this.sort = { key: col, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' };
    this.resetPaginacion();
  }

  sortIcon(col: SortCol): string {
    if (!this.sort || this.sort.key !== col) return 'fa-sort';
    return this.sort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  get pacientesVisibles(): any[] {
    const filtrados = this.pacientes.filter(p => this.cumpleFiltros(p));
    return this.ordenarPacientes(filtrados);
  }

  get totalRegistros(): number {
    return this.pacientesVisibles.length;
  }

  get totalPaginas(): number {
    return this.totalRegistros > 0 ? Math.ceil(this.totalRegistros / this.limit) : 0;
  }

  get pacientesPaginados(): any[] {
    const visibles = this.pacientesVisibles;
    const total = visibles.length > 0 ? Math.ceil(visibles.length / this.limit) : 0;
    const pagina = total > 0 ? Math.min(this.page, total) : 1;
    const inicio = (pagina - 1) * this.limit;
    return visibles.slice(inicio, inicio + this.limit);
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

  async eliminarPaciente(paciente: any): Promise<void> {
    const id = String(paciente?._id || '');
    if (!id) {
      Swal.fire('Error', 'No se encontro el ID del paciente.', 'error');
      return;
    }

    const result = await Swal.fire({
      title: 'Eliminar paciente',
      text: 'Seguro que deseas eliminar este paciente? Esta accion no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Si, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
    });

    if (!result.isConfirmed) return;

    this.pacientesService.eliminarPaciente(id).subscribe({
      next: () => {
        this.pacientes = this.pacientes.filter(p => String(p?._id) !== id);
        this.farmaciasDisponibles = this.extraerFarmaciasDisponibles(this.pacientes);
        this.ajustarPaginaActual();
        Swal.fire('Eliminado', 'Paciente eliminado correctamente.', 'success');
      },
      error: (err) => {
        console.error('[pacientes-admin][eliminar]', err);
        Swal.fire('Error', err?.error?.msg || 'No se pudo eliminar el paciente.', 'error');
      }
    });
  }

  abrirExpediente(row: any): void {
    const id = String(row?._id || '');
    if (!id) {
      Swal.fire('Error', 'No se encontro el ID del paciente.', 'error');
      return;
    }

    this.cargandoExpediente = true;
    this.pacienteExpediente = null;
    this.activeTab = 'datos';

    this.pacientesService.obtenerPaciente(id).subscribe({
      next: (resp: any) => {
        this.pacienteExpediente = resp?.paciente || null;
        this.editForm = this.buildEditForm(this.pacienteExpediente || row);
        this.cargandoExpediente = false;
        setTimeout(() => this.abrirModal(), 0);
      },
      error: (err) => {
        console.error('[pacientes-admin][expediente]', err);
        this.cargandoExpediente = false;
        Swal.fire('Error', err?.error?.msg || 'No se pudo obtener el expediente.', 'error');
      }
    });
  }

  setTab(tab: ExpedienteTab): void {
    this.activeTab = tab;
  }

  guardarExpediente(): void {
    const id = String(this.pacienteExpediente?._id || '');
    if (!id) {
      Swal.fire('Error', 'No se encontro el ID del paciente.', 'error');
      return;
    }

    const nombre = this.textoPlano(this.editForm?.nombre);
    if (!nombre) {
      Swal.fire('Aviso', 'El nombre del paciente es requerido.', 'warning');
      return;
    }

    this.guardando = true;

    this.pacientesService.actualizarPacienteAdmin(id, this.buildUpdatePayload()).subscribe({
      next: (resp: any) => {
        if (resp?.paciente) this.reemplazarPaciente(resp.paciente);
        this.guardando = false;
        this.cerrarModal();
        Swal.fire('Guardado', 'Datos del paciente actualizados correctamente.', 'success');
      },
      error: (err) => {
        console.error('[pacientes-admin][guardar]', err);
        this.guardando = false;
        Swal.fire('Error', err?.error?.msg || 'No se pudieron guardar los cambios.', 'error');
      }
    });
  }

  trackById(index: number, row: any): string {
    return String(row?._id || row?.id || index);
  }

  nombreCompleto(paciente: any): string {
    return [paciente?.nombre, paciente?.apPaterno, paciente?.apMaterno]
      .map(v => this.textoPlano(v))
      .filter(Boolean)
      .join(' ');
  }

  sexoLabel(value: any): string {
    const sexo = this.textoPlano(value);
    const option = this.sexoOptions.find(s => s.value === sexo);
    return option?.label || '-';
  }

  fechaMx(value: any): string {
    const ymd = this.fechaYmd(value);
    if (!ymd) return '';
    const [year, month, day] = ymd.split('-');
    return `${day}/${month}/${year}`;
  }

  fechaHoraMx(value: any): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  }

  texto(value: any, fallback = '-'): string {
    const limpio = this.textoPlano(value);
    return limpio || fallback;
  }

  listaTexto(value: any): string {
    if (Array.isArray(value)) {
      const items = value.map(v => this.textoPlano(v)).filter(Boolean);
      return items.length ? items.join(', ') : '-';
    }

    return this.texto(value);
  }

  diagnosticosTexto(value: any): string {
    if (Array.isArray(value)) return this.listaTexto(value);
    if (Array.isArray(value?.diagnosticos)) return this.listaTexto(value.diagnosticos);
    if (value?.diagnosticoPrincipal) return this.texto(value.diagnosticoPrincipal);
    return '-';
  }

  medicamentosTexto(receta: any): string {
    const medicamentos = Array.isArray(receta?.medicamentos) ? receta.medicamentos : [];
    const nombres = medicamentos
      .map((m: any) => this.textoPlano(m?.nombreLibre || (typeof m?.productoId === 'object' ? m?.productoId?.nombre : '')))
      .filter(Boolean);

    return nombres.length ? nombres.join(', ') : '-';
  }

  presionTexto(signos: any): string {
    const sis = this.textoPlano(signos?.presionSis);
    const dia = this.textoPlano(signos?.presionDia);
    if (!sis && !dia) return '-';
    return `${sis || '-'} / ${dia || '-'}`;
  }

  personaNombre(value: any): string {
    if (!value) return '-';
    if (typeof value === 'string') return this.esObjectId(value) ? 'No disponible' : value;
    return this.texto(value?.nombre || value?.usuario, 'No disponible');
  }

  farmaciaNombre(value: any): string {
    if (!value) return 'Sin farmacia';
    if (typeof value === 'string') {
      if (this.esObjectId(value)) return this.farmaciaNombrePorId(value) || 'No disponible';
      return value;
    }
    return this.texto(value?.nombre || this.farmaciaNombrePorId(this.extraerId(value)), 'No disponible');
  }

  farmaciasTexto(paciente: any): string {
    const farmacias = Array.isArray(paciente?.farmaciasVinculadas) ? paciente.farmaciasVinculadas : [];
    const nombres = farmacias
      .map((f: any) => this.farmaciaNombre(f))
      .filter((v: string) => v && v !== '-');
    return nombres.length ? nombres.join(', ') : '-';
  }

  get antecedentes(): any {
    return this.pacienteExpediente?.antecedentes || {};
  }

  get signosVitales(): any[] {
    return Array.isArray(this.pacienteExpediente?.signosVitales) ? this.pacienteExpediente.signosVitales : [];
  }

  get notasClinicas(): any[] {
    return Array.isArray(this.pacienteExpediente?.notasClinicas) ? this.pacienteExpediente.notasClinicas : [];
  }

  get recetas(): any[] {
    const recetas = this.pacienteExpediente?.recetas;
    if (Array.isArray(recetas) && recetas.length) return recetas;

    const ultimas = this.pacienteExpediente?.ultimasRecetas;
    return Array.isArray(ultimas) ? ultimas : [];
  }

  get farmaciasVinculadas(): any[] {
    const farmacias = this.pacienteExpediente?.farmaciasVinculadas;
    return Array.isArray(farmacias) ? farmacias : [];
  }

  private abrirModal(): void {
    const el = document.getElementById('modalExpedientePaciente');
    if (!el || typeof bootstrap === 'undefined') return;
    this.modalRef = bootstrap.Modal.getOrCreateInstance(el);
    this.modalRef.show();
  }

  private cerrarModal(): void {
    if (this.modalRef) {
      this.modalRef.hide();
      return;
    }

    const el = document.getElementById('modalExpedientePaciente');
    if (el && typeof bootstrap !== 'undefined') {
      bootstrap.Modal.getOrCreateInstance(el).hide();
    }
  }

  private buildEditForm(paciente: any): any {
    const dg = paciente?.datosGenerales || {};
    const contacto = paciente?.contacto || {};
    const emergencia = contacto?.emergencia || {};

    return {
      nombre: this.textoPlano(paciente?.nombre),
      apPaterno: this.textoPlano(paciente?.apPaterno),
      apMaterno: this.textoPlano(paciente?.apMaterno),
      datosGenerales: {
        fechaNacimiento: this.fechaYmd(dg?.fechaNacimiento),
        sexo: this.textoPlano(dg?.sexo) || 'NoEspecifica',
        curp: this.textoPlano(dg?.curp),
        entidadNacimiento: this.textoPlano(dg?.entidadNacimiento),
        ocupacion: this.textoPlano(dg?.ocupacion),
        escolaridad: this.textoPlano(dg?.escolaridad),
      },
      contacto: {
        telefono: this.textoPlano(contacto?.telefono),
        email: this.textoPlano(contacto?.email),
        direccion: this.textoPlano(contacto?.direccion),
        emergencia: {
          nombre: this.textoPlano(emergencia?.nombre),
          telefono: this.textoPlano(emergencia?.telefono),
          parentesco: this.textoPlano(emergencia?.parentesco),
        }
      }
    };
  }

  private buildUpdatePayload(): any {
    return {
      nombre: this.textoPlano(this.editForm?.nombre),
      apPaterno: this.textoPlano(this.editForm?.apPaterno),
      apMaterno: this.textoPlano(this.editForm?.apMaterno),
      datosGenerales: {
        fechaNacimiento: this.textoPlano(this.editForm?.datosGenerales?.fechaNacimiento),
        sexo: this.textoPlano(this.editForm?.datosGenerales?.sexo) || 'NoEspecifica',
        curp: this.textoPlano(this.editForm?.datosGenerales?.curp),
        entidadNacimiento: this.textoPlano(this.editForm?.datosGenerales?.entidadNacimiento),
        ocupacion: this.textoPlano(this.editForm?.datosGenerales?.ocupacion),
        escolaridad: this.textoPlano(this.editForm?.datosGenerales?.escolaridad),
      },
      contacto: {
        telefono: this.textoPlano(this.editForm?.contacto?.telefono),
        email: this.textoPlano(this.editForm?.contacto?.email),
        direccion: this.textoPlano(this.editForm?.contacto?.direccion),
        emergencia: {
          nombre: this.textoPlano(this.editForm?.contacto?.emergencia?.nombre),
          telefono: this.textoPlano(this.editForm?.contacto?.emergencia?.telefono),
          parentesco: this.textoPlano(this.editForm?.contacto?.emergencia?.parentesco),
        }
      }
    };
  }

  private reemplazarPaciente(actualizado: any): void {
    const id = String(actualizado?._id || '');
    if (!id) return;

    this.pacientes = this.pacientes.map(p => String(p?._id) === id ? actualizado : p);
    this.farmaciasDisponibles = this.extraerFarmaciasDisponibles(this.pacientes);
    this.pacienteExpediente = {
      ...(this.pacienteExpediente || {}),
      ...actualizado,
    };
  }

  private cumpleFiltros(paciente: any): boolean {
    const f = this.filtrosAplicados;

    const q = this.normalizar(f.q);
    if (q) {
      const valores = [
        this.nombreCompleto(paciente),
        paciente?.datosGenerales?.curp,
        paciente?.contacto?.telefono,
        paciente?.contacto?.email,
        paciente?.contacto?.emergencia?.nombre,
        paciente?.contacto?.emergencia?.telefono,
        paciente?.contacto?.emergencia?.parentesco,
      ].map(v => this.normalizar(v)).join(' ');

      if (!valores.includes(q)) return false;
    }

    if (f.sexo && this.textoPlano(paciente?.datosGenerales?.sexo) !== f.sexo) return false;

    const fecha = this.fechaYmd(paciente?.datosGenerales?.fechaNacimiento);
    if (f.fechaNacimientoInicial && (!fecha || fecha < f.fechaNacimientoInicial)) return false;
    if (f.fechaNacimientoFinal && (!fecha || fecha > f.fechaNacimientoFinal)) return false;

    if (f.farmaciaId) {
      const ids = this.farmaciaIdsPaciente(paciente);
      if (!ids.includes(f.farmaciaId)) return false;
    }

    return true;
  }

  private ordenarPacientes(rows: any[]): any[] {
    if (!this.sort) return rows;

    const { key, dir } = this.sort;
    const factor = dir === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      if (key === 'fechaNacimiento') {
        const av = this.fechaYmd(a?.datosGenerales?.fechaNacimiento);
        const bv = this.fechaYmd(b?.datosGenerales?.fechaNacimiento);
        return this.compararOrdenable(av, bv, factor);
      }

      const av = this.valorSort(a, key);
      const bv = this.valorSort(b, key);
      const cmp = this.collator.compare(av, bv);
      if (cmp !== 0) return cmp * factor;
      return this.collator.compare(this.valorSort(a, 'nombre'), this.valorSort(b, 'nombre'));
    });
  }

  private valorSort(paciente: any, key: SortKey): string {
    const dg = paciente?.datosGenerales || {};
    const emergencia = paciente?.contacto?.emergencia || {};

    const map: Record<SortKey, any> = {
      nombre: paciente?.nombre,
      apPaterno: paciente?.apPaterno,
      apMaterno: paciente?.apMaterno,
      fechaNacimiento: dg?.fechaNacimiento,
      sexo: this.sexoLabel(dg?.sexo),
      curp: dg?.curp,
      contacto: emergencia?.nombre,
      telefono: emergencia?.telefono,
      parentesco: emergencia?.parentesco,
    };

    return this.textoPlano(map[key]).toLocaleLowerCase('es-MX');
  }

  private compararOrdenable(a: string, b: string, factor: number): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a < b) return -1 * factor;
    if (a > b) return 1 * factor;
    return 0;
  }

  private rangoFechasValido(): boolean {
    const ini = this.filtros.fechaNacimientoInicial;
    const fin = this.filtros.fechaNacimientoFinal;
    return !ini || !fin || ini <= fin;
  }

  private fechaYmd(value: any): string {
    if (!value) return '';

    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  private normalizar(value: any): string {
    return this.textoPlano(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX');
  }

  private textoPlano(value: any): string {
    return String(value ?? '').trim();
  }

  private filtrosVacios(): PacientesFiltros {
    return {
      q: '',
      sexo: '',
      fechaNacimientoInicial: '',
      fechaNacimientoFinal: '',
      farmaciaId: '',
    };
  }

  private formVacio(): any {
    return this.buildEditForm({});
  }

  private extraerFarmaciasDisponibles(pacientes: any[]): Array<{ _id: string; nombre: string }> {
    const map = new Map<string, string>();

    pacientes.forEach(paciente => {
      const farmacias = Array.isArray(paciente?.farmaciasVinculadas) ? paciente.farmaciasVinculadas : [];
      farmacias.forEach((farmacia: any) => {
        const id = this.extraerId(farmacia);
        if (!id) return;
        const nombre = this.farmaciaNombre(farmacia);
        map.set(id, nombre && nombre !== '-' ? nombre : 'Sin nombre');
      });
    });

    return Array.from(map.entries())
      .map(([_id, nombre]) => ({ _id, nombre }))
      .sort((a, b) => this.collator.compare(a.nombre, b.nombre));
  }

  private farmaciaIdsPaciente(paciente: any): string[] {
    const farmacias = Array.isArray(paciente?.farmaciasVinculadas) ? paciente.farmaciasVinculadas : [];
    return farmacias.map((f: any) => this.extraerId(f)).filter(Boolean);
  }

  private extraerId(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value?._id || value?.id || value?.$oid || '').trim();
  }

  private resetPaginacion(): void {
    this.page = 1;
  }

  private ajustarPaginaActual(): void {
    const total = this.totalPaginas;
    if (total === 0) {
      this.page = 1;
      return;
    }

    if (this.page > total) this.page = total;
    if (this.page < 1) this.page = 1;
  }

  private farmaciaNombrePorId(id: any): string {
    const farmaciaId = this.extraerId(id);
    if (!farmaciaId) return '';

    const desdeCatalogo = this.farmaciasDisponibles.find(f => f._id === farmaciaId)?.nombre || '';
    if (desdeCatalogo && !this.esObjectId(desdeCatalogo)) return desdeCatalogo;

    const vinculadas = Array.isArray(this.pacienteExpediente?.farmaciasVinculadas)
      ? this.pacienteExpediente.farmaciasVinculadas
      : [];

    const vinculada = vinculadas.find((f: any) => this.extraerId(f) === farmaciaId);
    return this.textoPlano(vinculada?.nombre);
  }

  private esObjectId(value: any): boolean {
    return /^[a-fA-F0-9]{24}$/.test(String(value ?? '').trim());
  }
}

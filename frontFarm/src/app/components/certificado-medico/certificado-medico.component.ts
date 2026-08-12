import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

import {
  CertificadoMedico,
  DIENTES_CERTIFICADO,
  FAMILIARES_CERTIFICADO,
  FILAS_DIENTES,
  VALORES_DIENTE,
  crearCertificadoMedicoVacio,
  fechaHoyCiudadMexico,
  idRelacionado,
  mezclarCertificadoMedico,
  soloFecha,
  sumarDiasCalendario,
} from '../../models/certificado-medico.model';
import { AuthService } from '../../services/auth.service';
import { CertificadosMedicosService } from '../../services/certificados-medicos.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { UsuarioService } from '../../services/usuario.service';
import { printNodeInIframe } from '../../shared/utils/print-utils';

export interface CertificadoMedicoDialogData {
  modo: 'alta' | 'edicion';
  origen: 'certificados-medicos' | 'medico-consultorio';
  certificadoId?: string;
  certificado?: any;
  fichaConsultorioId?: string;
  precarga?: Partial<CertificadoMedico>;
}

@Component({
  selector: 'app-certificado-medico',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatTooltipModule],
  templateUrl: './certificado-medico.component.html',
  styleUrls: ['./certificado-medico.component.css'],
})
export class CertificadoMedicoComponent implements OnInit {
  @ViewChild('printDocument') printDocument?: ElementRef<HTMLElement>;

  certificado: CertificadoMedico = crearCertificadoMedicoVacio();
  farmacias: any[] = [];
  medicos: any[] = [];
  medicosFarmacia: any[] = [];
  usuario: any = null;
  rol = '';
  cargando = false;
  guardando = false;
  imprimiendo = false;
  errorCarga = '';

  readonly familiares = FAMILIARES_CERTIFICADO;
  readonly valoresDiente = VALORES_DIENTE;
  readonly filasDientes: string[][] = FILAS_DIENTES.map(fila => [...fila]);
  readonly dientes = DIENTES_CERTIFICADO;
  readonly encabezadoCertificadoUrl = new URL(
    'assets/certificados-medicos/encabezado-certificado.png',
    document.baseURI,
  ).href;
  readonly dienteOdontogramaUrl = new URL(
    'assets/certificados-medicos/diente-odontograma.png',
    document.baseURI,
  ).href;

  readonly antecedentesHereditarios = [
    { numero: '01', key: 'diabetes', label: 'DIABETES' },
    { numero: '02', key: 'hipertension', label: 'HIPERTENSIÓN' },
    { numero: '03', key: 'obesidad', label: 'OBESIDAD' },
    { numero: '04', key: 'convulsiones', label: 'CONVULSIONES' },
    { numero: '05', key: 'hemofilicos', label: 'HEMOFÍLICOS' },
    { numero: '06', key: 'respiratorios', label: 'RESPIRATORIOS' },
    { numero: '07', key: 'hepatitis', label: 'HEPATITIS' },
    { numero: '08', key: 'oncologicos', label: 'ONCOLÓGICOS' },
    { numero: '09', key: 'otras', label: 'OTRAS' },
    { numero: '10', key: 'niegaAntecedentes', label: 'NIEGA ANTECEDENTES' },
  ];

  readonly antecedentesPersonalesBooleanos = [
    { numero: '02', key: 'obesidad', label: 'OBESIDAD' },
    { numero: '03', key: 'diabetes', label: 'DIABETES' },
    { numero: '04', key: 'hipertension', label: 'HIPERTENSIÓN' },
    { numero: '05', key: 'hepatitis', label: 'HEPATITIS' },
    { numero: '06', key: 'convulsiones', label: 'CONVULSIONES' },
    { numero: '07', key: 'alcoholismo', label: 'ALCOHOLISMO' },
    { numero: '08', key: 'tabaquismo', label: 'TABAQUISMO' },
    { numero: '10', key: 'niegaAntecedentes', label: 'NIEGA ANTECEDENTES' },
  ];

  readonly tablasExamen = [
    {
      titulo: 'PROBLEMAS DE DESARROLLO',
      key: 'problemasDesarrollo',
      opciones: [
        { key: 'maltrato', label: 'MALTRATO' },
        { key: 'problemasConducta', label: 'P. CONDUCTA' },
        { key: 'problemasAprendizaje', label: 'P. APRENDIZAJE' },
        { key: 'problemasLenguaje', label: 'P. LENGUAJE' },
        { key: 'ninguno', label: 'NINGUNO' },
      ],
    },
    {
      titulo: 'CARDIOVASCULAR',
      key: 'cardiovascular',
      opciones: [
        { key: 'normal', label: 'NORMAL' },
        { key: 'sFisiologico', label: 'S. FISIOLÓGICO' },
        { key: 'sOrganico', label: 'S. ORGÁNICO' },
        { key: 'arritmias', label: 'ARRITMIAS' },
        { key: 'bradicardias', label: 'BRADICARDIAS' },
      ],
    },
    {
      titulo: 'PIEL',
      key: 'piel',
      opciones: [
        { key: 'normal', label: 'NORMAL' },
        { key: 'piodermias', label: 'PIODERMIAS' },
        { key: 'pAlba', label: 'P. ALBA' },
        { key: 'micosis', label: 'MICOSIS' },
        { key: 'escabiasis', label: 'ESCABIASIS' },
      ],
    },
    {
      titulo: 'MUSCULAR',
      key: 'muscular',
      opciones: [
        { key: 'normal', label: 'NORMAL' },
        { key: 'dColumna', label: 'D. COLUMNA' },
        { key: 'piePlano', label: 'PIE PLANO' },
        { key: 'gValgo', label: 'G. VALGO' },
      ],
    },
    {
      titulo: 'RESPIRATORIO',
      key: 'respiratorio',
      opciones: [
        { key: 'normal', label: 'NORMAL' },
        { key: 'resfriadoC', label: 'RESFRIADO C.' },
        { key: 'otitis', label: 'OTITIS' },
        { key: 'bronquitis', label: 'BRONQUITIS' },
        { key: 'asma', label: 'ASMA' },
      ],
    },
  ];

  private estadoInicial = '';

  constructor(
    private ref: MatDialogRef<CertificadoMedicoComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CertificadoMedicoDialogData,
    private authService: AuthService,
    private certificadosService: CertificadosMedicosService,
    private farmaciaService: FarmaciaService,
    private usuarioService: UsuarioService,
    private changeDetectorRef: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.usuario = this.authService.getUserData() || {};
    this.rol = String(this.usuario?.rol || '');
    this.ref.disableClose = true;

    if (this.data?.modo === 'edicion') await this.cargarCertificado();
    else this.inicializarAlta();

    if (this.esAdmin) this.cargarCatalogosAdmin();
    else this.aplicarRelacionMedico();

    this.actualizarEstadoInicial();
  }

  get esAdmin(): boolean {
    return this.rol === 'admin';
  }

  get esEdicion(): boolean {
    return this.data?.modo === 'edicion' || !!this.certificado?._id;
  }

  get medicoImpresion(): any {
    const id = String(this.certificado.medicoId || '').trim();
    const seleccionado = [...this.medicos, ...this.medicosFarmacia].find(m => String(m?._id || m?.id) === id);
    if (seleccionado) return seleccionado;
    if (typeof this.certificado.medico === 'object') return this.certificado.medico;
    if (this.certificado.medicoSnapshot?.nombre) return this.certificado.medicoSnapshot;
    return this.usuario || {};
  }

  onFarmaciaCambio(): void {
    this.actualizarMedicosFarmacia(true);
  }

  onFechaNacimientoCambio(): void {
    if (!this.certificado.fechaNacimiento) {
      this.certificado.edad = null;
      return;
    }
    this.certificado.edad = this.calcularEdad(this.certificado.fechaNacimiento);
  }

  incluyeFamiliar(key: string, familiar: string): boolean {
    return this.familiaresDe(key).includes(familiar);
  }

  cambiarFamiliar(key: string, familiar: string, checked: boolean): void {
    const actual = new Set(this.familiaresDe(key));
    if (checked) actual.add(familiar);
    else actual.delete(familiar);
    this.asignarFamiliares(key, Array.from(actual));
  }

  familiaresTexto(key: string): string {
    return this.familiaresDe(key).join(', ');
  }

  marca(valor: any): string {
    return valor === true ? 'X' : '';
  }

  marcaSi(valor: boolean | null): string {
    return valor === true ? 'X' : '';
  }

  marcaNo(valor: boolean | null): string {
    return valor === false ? 'X' : '';
  }

  formatoFecha(valor: any): string {
    const fecha = soloFecha(valor);
    if (!fecha) return '';
    const [year, month, day] = fecha.split('-');
    return `${day}/${month}/${year}`;
  }

  async grabar(): Promise<void> {
    if (this.guardando || this.cargando) return;
    const validacion = this.validar();
    if (validacion) {
      await Swal.fire('Datos incompletos', validacion, 'warning');
      return;
    }

    this.guardando = true;
    try {
      const eraEdicion = this.esEdicion;
      const payload = this.construirPayload();
      const resp: any = eraEdicion
        ? await firstValueFrom(this.certificadosService.actualizar(String(this.certificado._id), payload))
        : await firstValueFrom(this.certificadosService.crear(payload));

      this.certificado = mezclarCertificadoMedico(resp?.certificado || this.certificado);
      this.actualizarEstadoInicial();

      await Swal.fire({
        icon: 'success',
        title: eraEdicion
          ? 'Certificado médico actualizado correctamente'
          : 'Certificado médico guardado correctamente',
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false,
        allowOutsideClick: false,
      });
      this.ref.close({ guardado: true, certificado: this.certificado });
    } catch (error: any) {
      await Swal.fire('Error', error?.error?.mensaje || 'No se pudo guardar el certificado médico.', 'error');
    } finally {
      this.guardando = false;
    }
  }

  async imprimir(): Promise<void> {
    if (this.imprimiendo || !this.printDocument?.nativeElement) return;
    if (!String(this.certificado.nombre || '').trim()) {
      await Swal.fire('Datos incompletos', 'Captura al menos el nombre del paciente antes de imprimir.', 'warning');
      return;
    }

    this.imprimiendo = true;
    try {
      // ngModel ya contiene la captura actual; forzamos su reflejo en la plantilla oculta antes de clonarla.
      this.changeDetectorRef.detectChanges();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      await printNodeInIframe(this.printDocument.nativeElement, {
        fallbackMs: 30000,
        settleMs: 180,
        feedMm: 0,
        offscreenFrame: true,
        forceVisibleClone: true,
        printCss: `
          @page { size: letter portrait; margin: 0; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            .certificado-print,
            .certificado-print * { visibility: visible !important; }
            .certificado-print { display: block !important; opacity: 1 !important; }
          }
        `,
      });
    } catch {
      await Swal.fire('Error', 'No se pudo abrir la impresión del certificado.', 'error');
    } finally {
      this.imprimiendo = false;
    }
  }

  async salir(): Promise<void> {
    if (this.guardando) return;
    if (!this.tieneCambios()) {
      this.ref.close();
      return;
    }

    const respuesta = await Swal.fire({
      icon: 'warning',
      title: 'Cambios sin grabar',
      text: 'La información no grabada se perderá. ¿Desea continuar?',
      showCancelButton: true,
      confirmButtonText: 'SI',
      cancelButtonText: 'NO',
      reverseButtons: true,
      allowOutsideClick: false,
    });

    if (respuesta.isConfirmed) this.ref.close();
  }

  valorTabla(tabla: string, key: string): boolean {
    return !!this.certificado.examenFisico?.[tabla]?.[key];
  }

  private inicializarAlta(): void {
    const precarga = this.data?.precarga || {};
    const vigenciaDesdePrecargada = sumarDiasCalendario(
      soloFecha((precarga as any)?.vigenciaDesde),
      0,
    );
    const vigenciaDesde = vigenciaDesdePrecargada || fechaHoyCiudadMexico();
    const vigenciaHastaPrecargada = sumarDiasCalendario(
      soloFecha((precarga as any)?.vigenciaHasta),
      0,
    );
    const vigenciaHasta = vigenciaHastaPrecargada || sumarDiasCalendario(vigenciaDesde, 90);

    this.certificado = mezclarCertificadoMedico({
      ...crearCertificadoMedicoVacio(),
      ...precarga,
      vigenciaDesde,
      vigenciaHasta,
      fichaConsultorioId: this.data?.fichaConsultorioId || (precarga as any)?.fichaConsultorioId,
    });
  }

  private async cargarCertificado(): Promise<void> {
    this.cargando = true;
    try {
      let valor = this.data?.certificado;
      if (!valor && this.data?.certificadoId) {
        const resp: any = await firstValueFrom(this.certificadosService.obtenerPorId(this.data.certificadoId));
        valor = resp?.certificado;
      }
      if (!valor) throw new Error('Certificado no encontrado');
      this.certificado = mezclarCertificadoMedico(valor);
    } catch (error: any) {
      this.errorCarga = error?.error?.mensaje || error?.message || 'No se pudo cargar el certificado.';
      await Swal.fire('Error', this.errorCarga, 'error');
      this.ref.close();
    } finally {
      this.cargando = false;
    }
  }

  private cargarCatalogosAdmin(): void {
    forkJoin({
      farmacias: this.farmaciaService.obtenerFarmacias(),
      usuarios: this.usuarioService.obtenerUsuarios(),
    }).subscribe({
      next: ({ farmacias, usuarios }) => {
        this.farmacias = (Array.isArray(farmacias) ? farmacias : []).filter((f: any) => f?.activo !== false);
        this.medicos = (Array.isArray(usuarios) ? usuarios : []).filter(
          (u: any) => u?.rol === 'medico' && u?.activo !== false
        );

        if (!this.certificado.farmaciaId) {
          const activa = this.obtenerFarmaciaLocal();
          const activaId = idRelacionado(activa);
          this.certificado.farmaciaId = this.farmacias.some(f => String(f?._id) === activaId) ? activaId : '';
        }
        this.actualizarMedicosFarmacia(false);
        this.actualizarEstadoInicial();
      },
      error: () => {
        this.farmacias = [];
        this.medicos = [];
        this.medicosFarmacia = [];
      },
    });
  }

  private aplicarRelacionMedico(): void {
    const farmacia = this.usuario?.farmacia || this.obtenerFarmaciaLocal();
    const farmaciaId = idRelacionado(farmacia);
    const medicoId = String(this.usuario?._id || this.usuario?.id || '').trim();
    this.certificado.farmaciaId = farmaciaId;
    this.certificado.medicoId = medicoId;
    this.farmacias = farmaciaId ? [{ ...(typeof farmacia === 'object' ? farmacia : {}), _id: farmaciaId }] : [];
    this.medicosFarmacia = medicoId ? [{ ...this.usuario, _id: medicoId }] : [];
  }

  private actualizarMedicosFarmacia(limpiarInvalido: boolean): void {
    const farmaciaId = String(this.certificado.farmaciaId || '').trim();
    this.medicosFarmacia = this.medicos.filter(m => idRelacionado(m?.farmacia) === farmaciaId);
    const seleccionado = String(this.certificado.medicoId || '').trim();
    if (limpiarInvalido && seleccionado && !this.medicosFarmacia.some(m => String(m?._id) === seleccionado)) {
      this.certificado.medicoId = '';
    }
  }

  private validar(): string {
    if (!String(this.certificado.farmaciaId || '').trim()) return 'La farmacia es obligatoria.';
    if (!String(this.certificado.medicoId || '').trim()) return 'El médico responsable es obligatorio.';
    if (!String(this.certificado.fechaRevision || '').trim()) return 'La fecha de revisión es obligatoria.';
    if (!String(this.certificado.nombre || '').trim()) return 'El nombre del paciente es obligatorio.';
    if (!['ESCOLAR', 'LABORAL'].includes(this.certificado.tipo)) return 'Selecciona un tipo de certificado válido.';

    if (this.esAdmin) {
      const medico = this.medicosFarmacia.find(m => String(m?._id) === String(this.certificado.medicoId));
      if (!medico) return 'El médico debe estar asociado a la farmacia seleccionada.';
    }
    return '';
  }

  private construirPayload(): any {
    const payload: any = JSON.parse(JSON.stringify(this.certificado));
    delete payload._id;
    delete payload.farmacia;
    delete payload.medico;
    delete payload.fichaConsultorio;
    delete payload.medicoSnapshot;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.__v;

    payload.farmaciaId = this.certificado.farmaciaId;
    payload.medicoId = this.certificado.medicoId;
    payload.fichaConsultorioId = this.certificado.fichaConsultorioId || undefined;
    return payload;
  }

  private familiaresDe(key: string): string[] {
    const base = this.certificado.antecedentesHereditarios || {};
    const valor = key === 'otras' ? base?.otras?.familiares : base?.[key];
    return Array.isArray(valor) ? valor : [];
  }

  private asignarFamiliares(key: string, familiares: string[]): void {
    if (key === 'otras') this.certificado.antecedentesHereditarios.otras.familiares = familiares;
    else this.certificado.antecedentesHereditarios[key] = familiares;
  }

  private calcularEdad(fecha: string): number | null {
    const match = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const nacimiento = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    const hoy = new Date();
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(hoy);
    const year = Number(partes.find(p => p.type === 'year')?.value);
    const month = Number(partes.find(p => p.type === 'month')?.value);
    const day = Number(partes.find(p => p.type === 'day')?.value);
    let edad = year - nacimiento.year;
    if (month < nacimiento.month || (month === nacimiento.month && day < nacimiento.day)) edad--;
    return edad >= 0 && edad <= 150 ? edad : null;
  }

  private tieneCambios(): boolean {
    return this.serializarEstado() !== this.estadoInicial;
  }

  private actualizarEstadoInicial(): void {
    this.estadoInicial = this.serializarEstado();
  }

  private serializarEstado(): string {
    return JSON.stringify(this.construirPayload());
  }

  private obtenerFarmaciaLocal(): any {
    try {
      return JSON.parse(localStorage.getItem('user_farmacia') || 'null');
    } catch {
      return null;
    }
  }
}

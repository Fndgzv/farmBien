// frontFarm\src\app\pages\medico-consultorio\medico-consultorio.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';
import { FichasConsultorioService } from '../../services/fichas-consultorio.service';
import { PacientesService } from '../../services/pacientes.service';
import { RecetasService } from '../../services/recetas.service';
import { ProductoService } from '../../services/producto.service';
import { environment } from '../../../environments/environment';
import { buildImgUrl } from '../../shared/img-url';
import { formatearTurnoConsultorioVisual } from '../../shared/utils/turno-visual';
import { text } from '@fortawesome/fontawesome-svg-core';

type ServicioMedico = { _id: string; nombre: string; precioVenta?: number; categoria?: string };

type ServicioUI = {
  productoId: string;
  cantidad: number;
  notas?: string;
  categoria?: string;

  // UI buscador
  query?: string;              // lo que escribe el médico
  sugerencias?: ServicioMedico[];
  buscando?: boolean;
};

type MedicamentoUI = {
  productoId?: string | null;
  nombreLibre: string;
  ingreActivo?: string;
  codigoBarras?: string;
  buscando?: boolean;
  sinCoincidencias?: boolean;

  dosis: string;
  via: string;
  viaOtra?: string;
  frecuencia: string;
  duracion: string;
  cantidad?: number | null;
  indicaciones?: string;
  esControlado?: boolean;

  modo: 'CATALOGO' | 'OTRO';
  q?: string;              // texto del buscador
  resultados?: any[];      // resultados del backend
};


type RecetaPrintMedicamento = {
  nombre: string;
  dosis: string;
  via: string;
  frecuencia: string;
  duracion: string;
  categoria?: string;
  indicaciones?: string;
};

type RecetaPrintData = {
  medicoNombre: string;
  medicoTitulo: string;
  medicoEscuela: string;
  logoEscuelaUrl?: string;
  cedula: string;
  pacienteNombre: string;
  fecha: string;
  citaSeguimiento?: string;
  diagnosticos: string[];
  edad?: string;
  alergias?: string;
  signosVitales?: string[];
  recomendaciones?: string;
  direccion?: string;
  telefono?: string;
  medicamentos: RecetaPrintMedicamento[];
};

type MiTrabajoFila = {
  ficha: string;
  pacienteNombre: string;
  nombre: string;
  cantidad: number;
  fichaId?: string;
};

declare const bootstrap: any;
@Component({
  selector: 'app-medico-consultorio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './medico-consultorio.component.html',
  styleUrls: ['./medico-consultorio.component.css'],
})


export class MedicoConsultorioComponent implements OnInit {
  recetaVista: any = null;
  cargandoReceta = false;

  antForm = {
    alergiasTxt: '',
    enfermedadesCronicasTxt: '',
    medicamentosActualesTxt: '',
    cirugiasPreviasTxt: '',
    antecedentesFamiliaresTxt: '',
    tabaquismo: 'No' as 'No' | 'Si' | 'Ex',
    alcohol: 'No' as 'No' | 'Si' | 'Ocasional',
  };

  farmaciaNombre = '';

  cola: any[] = [];
  fichaActual: any = null;
  fichaParaCancelar: any = null;
  motivoCancelacion = 'El paciente se retiró';
  motivoCancelacionError = '';

  servicios: ServicioUI[] = [];

  guardando = false;
  cancelandoFicha = false;

  private timers = new Map<number, any>();

  private tick: any;
  private readonly motivoCancelacionPredeterminado = 'El paciente se retiró';
  colaExpandida = true;
  // colapsables (ATENCIÓN)
  svExpandida = false;
  capturaSignosDisponible = true;
  expExpandida = true;
  rxExpandida = false;
  servExpandida = false;
  ncExpandida = false;

  toggleSV() { this.svExpandida = !this.svExpandida; }
  toggleExp() { this.expExpandida = !this.expExpandida; }
  toggleRX() { this.rxExpandida = !this.rxExpandida; }
  toggleServ() { this.servExpandida = !this.servExpandida; }
  toggleNC() { this.ncExpandida = !this.ncExpandida; }

  get esPacienteDePasoActual(): boolean {
    return !!this.fichaActual && !this.fichaActual?.pacienteId;
  }

  paciente: any = null;
  expediente: any = null; // signosVitalesRecientes, ultimasRecetas, etc.

  pacienteBusqueda = '';
  pacientesEncontrados: any[] = [];
  buscandoPaciente = false;
  busquedaPacienteRealizada = false;
  guardandoPaciente = false;
  guardandoAntecedentes = false;
  guardandoNotaClinica = false;
  guardandoServicios = false;
  cargandoMiTrabajo = false;
  miTrabajoFilas: MiTrabajoFila[] = [];
  miTrabajoTurnoFecha = '';

  readonly entidadesNacimiento = [
    { value: 'AS', label: 'Aguascalientes' },
    { value: 'BC', label: 'Baja California' },
    { value: 'BS', label: 'Baja California Sur' },
    { value: 'CC', label: 'Campeche' },
    { value: 'CL', label: 'Coahuila' },
    { value: 'CM', label: 'Colima' },
    { value: 'CS', label: 'Chiapas' },
    { value: 'CH', label: 'Chihuahua' },
    { value: 'DF', label: 'Ciudad de México' },
    { value: 'DG', label: 'Durango' },
    { value: 'GT', label: 'Guanajuato' },
    { value: 'GR', label: 'Guerrero' },
    { value: 'HG', label: 'Hidalgo' },
    { value: 'JC', label: 'Jalisco' },
    { value: 'MC', label: 'México' },
    { value: 'MN', label: 'Michoacán' },
    { value: 'MS', label: 'Morelos' },
    { value: 'NT', label: 'Nayarit' },
    { value: 'NL', label: 'Nuevo León' },
    { value: 'OC', label: 'Oaxaca' },
    { value: 'PL', label: 'Puebla' },
    { value: 'QT', label: 'Querétaro' },
    { value: 'QR', label: 'Quintana Roo' },
    { value: 'SP', label: 'San Luis Potosí' },
    { value: 'SL', label: 'Sinaloa' },
    { value: 'SR', label: 'Sonora' },
    { value: 'TC', label: 'Tabasco' },
    { value: 'TS', label: 'Tamaulipas' },
    { value: 'TL', label: 'Tlaxcala' },
    { value: 'VZ', label: 'Veracruz' },
    { value: 'YN', label: 'Yucatán' },
    { value: 'ZS', label: 'Zacatecas' },
    { value: 'NE', label: 'Extranjero' },
  ];

  nota = {
    motivoConsulta: '',
    padecimientoActual: '',
    exploracionFisica: '',
    diagnosticosTexto: '', // textarea -> luego split por saltos
    plan: '',
  };

  VIAS_ADMIN: string[] = [
    "ORAL", "SUBLINGUAL", "BUCAL", "INHALATORIA", "NASAL", "TOPICA", "TRANSDERMICA",
    "OFTALMICA", "OTICA", "RECTAL", "VAGINAL", "INTRAVENOSA", "INTRAMUSCULAR",
    "SUBCUTANEA", "INTRADERMICA", "OTRA",
  ];

  // Receta
  receta = {
    diagnosticosTexto: '',
    indicacionesGenerales: '',
    citaSeguimiento: '', // input date -> string
    medicamentos: [] as MedicamentoUI[],
  };

  generandoReceta = false;
  private recetaPendienteImpresionId: string | null = null;
  private readonly recetaActivaPorFichaStorageKey = 'medico_consultorio_receta_activa_por_ficha_v1';
  private readonly signosPasoPorFichaStorageKey = 'medico_consultorio_signos_paso_por_ficha_v1';

  signos = {
    pesoKg: null as number | null,
    tallaCm: null as number | null,
    imc: null as number | null,

    temperatura: null as number | null,

    presionSis: null as number | null,
    presionDia: null as number | null,

    fc: null as number | null,
    fr: null as number | null,
    spo2: null as number | null,
    glucosaCapilar: null as number | null,
  };

  guardandoSignos = false;

  private joinLista(arr: any): string {
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr
      .map(x => String(x ?? '').trim())
      .filter(Boolean)
      .join('\n'); // x uno por renglón para editar fácil
  }

  private prefillAntecedentesFormDesdePaciente() {
    const ant = this.paciente?.antecedentes || null;

    if (!ant) {
      this.antForm = {
        alergiasTxt: '',
        enfermedadesCronicasTxt: '',
        medicamentosActualesTxt: '',
        cirugiasPreviasTxt: '',
        antecedentesFamiliaresTxt: '',
        tabaquismo: 'No',
        alcohol: 'No',
      };
      return;
    }

    this.antForm = {
      alergiasTxt: this.joinLista(ant.alergias),
      enfermedadesCronicasTxt: this.joinLista(ant.enfermedadesCronicas),
      medicamentosActualesTxt: this.joinLista(ant.medicamentosActuales),
      cirugiasPreviasTxt: this.joinLista(ant.cirugiasPrevias),
      antecedentesFamiliaresTxt: this.joinLista(ant.antecedentesFamiliares),
      tabaquismo: (ant.tabaquismo || 'No') as any,
      alcohol: (ant.alcohol || 'No') as any,
    };
  }


  private parseLista(txt: string): string[] {
    return String(txt || '')
      .split(/\r?\n|,/g)
      .map(x => x.trim())
      .filter(Boolean);
  }

  private buildAntecedentesPayload() {
    const a = this.antForm;

    const payload = {
      alergias: this.parseLista(a.alergiasTxt),
      enfermedadesCronicas: this.parseLista(a.enfermedadesCronicasTxt),
      medicamentosActuales: this.parseLista(a.medicamentosActualesTxt),
      cirugiasPrevias: this.parseLista(a.cirugiasPreviasTxt),
      antecedentesFamiliares: this.parseLista(a.antecedentesFamiliaresTxt),
      tabaquismo: a.tabaquismo,
      alcohol: a.alcohol,
    };

    const hayAlgo =
      payload.alergias.length ||
      payload.enfermedadesCronicas.length ||
      payload.medicamentosActuales.length ||
      payload.cirugiasPrevias.length ||
      payload.antecedentesFamiliares.length ||
      payload.tabaquismo !== 'No' ||
      payload.alcohol !== 'No';

    return { hayAlgo, payload };
  }

  private obtenerAlergiasConsultaActual(): string[] {
    const desdeCaptura = this.parseLista(this.antForm.alergiasTxt);
    if (desdeCaptura.length) return desdeCaptura;

    const desdePaciente = Array.isArray(this.paciente?.antecedentes?.alergias)
      ? this.paciente.antecedentes.alergias
      : [];

    return desdePaciente
      .map((alergia: any) => String(alergia || '').trim())
      .filter(Boolean);
  }

  private obtenerAlergiasConsultaActualTexto(): string {
    const alergias = this.obtenerAlergiasConsultaActual();
    return alergias.length ? alergias.join(', ') : '';
  }

  pacForm = {
    nombre: '',
    apPaterno: '',
    apMaterno: '',
    telefono: '',
    email: '',
    direccion: '',
    emergenciaNombre: '',
    emergenciaTelefono: '',
    emergenciaParentesco: '',
    fechaNacimiento: '',
    sexo: 'NoEspecifica',
    curp: '',
    curpEsProvisional: false,
    entidadNacimiento: '',
    ocupacion: '',
    escolaridad: '',
  };


  constructor(
    private fichasService: FichasConsultorioService,
    private pacientesService: PacientesService,
    private recetasService: RecetasService,
    private productosService: ProductoService) { }

  async ngOnInit() {
    // (opcional) mostrar farmacia del localStorage
    const stored = localStorage.getItem('user_farmacia');
    const f = stored ? JSON.parse(stored) : null;
    this.farmaciaNombre = f?.nombre || '';

    await this.cargarCola({ expand: true });

    this.tick = setInterval(() => { }, 60000); // fuerza change detection indirecta por bindings
  }


  ngOnDestroy() {
    if (this.tick) clearInterval(this.tick);
  }


  async cargarCola(options: { expand?: boolean } = {}) {
    try {
      const resp = await firstValueFrom(this.fichasService.obtenerColaMedico());
      this.cola = resp?.fichas ?? [];

      if (typeof options.expand === 'boolean') {
        this.colaExpandida = options.expand;
      }
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo cargar la cola', 'error');
    }
  }

  private get miUsuarioId(): string {
    const posibles = [
      localStorage.getItem('auth_user'),
      localStorage.getItem('usuario')
    ];

    for (const raw of posibles) {
      try {
        const obj = raw ? JSON.parse(raw) : null;
        if (obj?._id) return String(obj._id);
        if (obj?.id) return String(obj.id);
      } catch { }
    }

    return '';
  }

  private get fichaActualId(): string {
    return String(this.fichaActual?._id || '').trim();
  }

  private leerRecetasActivasPorFichaMap(): Record<string, string> {
    try {
      const raw = localStorage.getItem(this.recetaActivaPorFichaStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  }

  private guardarRecetasActivasPorFichaMap(map: Record<string, string>) {
    try {
      localStorage.setItem(this.recetaActivaPorFichaStorageKey, JSON.stringify(map || {}));
    } catch { }
  }

  private setRecetaActivaDeFicha(fichaId: any, recetaId: any) {
    const fId = String(fichaId || '').trim();
    const rId = String(recetaId || '').trim();
    if (!fId || !rId) return;
    const map = this.leerRecetasActivasPorFichaMap();
    map[fId] = rId;
    this.guardarRecetasActivasPorFichaMap(map);
  }

  private getRecetaActivaDeFicha(fichaId: any): string | null {
    const fId = String(fichaId || '').trim();
    if (!fId) return null;
    const map = this.leerRecetasActivasPorFichaMap();
    const recetaId = String(map?.[fId] || '').trim();
    return recetaId || null;
  }

  private removeRecetaActivaDeFicha(fichaId: any) {
    const fId = String(fichaId || '').trim();
    if (!fId) return;
    const map = this.leerRecetasActivasPorFichaMap();
    if (!(fId in map)) return;
    delete map[fId];
    this.guardarRecetasActivasPorFichaMap(map);
  }

  private leerSignosPasoPorFichaMap(): Record<string, any> {
    try {
      const raw = localStorage.getItem(this.signosPasoPorFichaStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch {
      return {};
    }
  }

  private guardarSignosPasoPorFichaMap(map: Record<string, any>) {
    try {
      localStorage.setItem(this.signosPasoPorFichaStorageKey, JSON.stringify(map || {}));
    } catch { }
  }

  private setSignosPasoDeFicha(fichaId: any, signos: any) {
    const fId = String(fichaId || '').trim();
    if (!fId || !signos) return;
    const map = this.leerSignosPasoPorFichaMap();
    map[fId] = signos;
    this.guardarSignosPasoPorFichaMap(map);
  }

  private getSignosPasoDeFicha(fichaId: any): any | null {
    const fId = String(fichaId || '').trim();
    if (!fId) return null;
    const map = this.leerSignosPasoPorFichaMap();
    return map?.[fId] || null;
  }

  private removeSignosPasoDeFicha(fichaId: any) {
    const fId = String(fichaId || '').trim();
    if (!fId) return;
    const map = this.leerSignosPasoPorFichaMap();
    if (!(fId in map)) return;
    delete map[fId];
    this.guardarSignosPasoPorFichaMap(map);
  }

  private toEpochMs(value: any): number | null {
    if (!value) return null;
    const d = new Date(value);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }

  private inferirRecetaIdDesdeExpedienteParaFichaActual(): string | null {
    const lista = Array.isArray(this.expediente?.ultimasRecetas) ? this.expediente.ultimasRecetas : [];
    if (!lista.length) return null;

    const fichaId = this.fichaActualId;
    if (fichaId) {
      const exactas = lista
        .map((entry: any) => {
          const recetaId = String(entry?.recetaId || '').trim();
          const recetaFichaId = String(entry?.fichaConsultorioId || '').trim();
          const fechaMs = this.toEpochMs(entry?.fecha) || 0;
          return { recetaId, recetaFichaId, fechaMs };
        })
        .filter((entry: any) => !!entry.recetaId && entry.recetaFichaId === fichaId)
        .sort((a: any, b: any) => Number(b.fechaMs || 0) - Number(a.fechaMs || 0));

      if (exactas.length) return exactas[0].recetaId;
    }

    const inicioAtencionMs =
      this.toEpochMs(this.fichaActual?.inicioAtencionAt) ??
      this.toEpochMs(this.fichaActual?.llamadoAt) ??
      this.toEpochMs(this.fichaActual?.llegadaAt);

    if (!inicioAtencionMs) return null;

    const ventanaInferior = inicioAtencionMs - (30 * 60 * 1000);
    const ventanaSuperior = Date.now() + (5 * 60 * 1000);
    const miId = this.miUsuarioId;

    const candidatos = lista
      .map((entry: any) => {
        const recetaId = String(entry?.recetaId || '').trim();
        const fechaMs = this.toEpochMs(entry?.fecha);
        const medicoEntry = entry?.medicoId;
        const medicoId = typeof medicoEntry === 'object'
          ? String(medicoEntry?._id || '').trim()
          : String(medicoEntry || '').trim();
        return { recetaId, fechaMs, medicoId };
      })
      .filter((entry: any) =>
        !!entry.recetaId &&
        entry.fechaMs != null &&
        entry.fechaMs >= ventanaInferior &&
        entry.fechaMs <= ventanaSuperior
      );

    if (!candidatos.length) return null;

    const candidatosMedico = miId
      ? candidatos.filter((entry: any) => entry.medicoId && entry.medicoId === miId)
      : [];

    const pool = candidatosMedico.length ? candidatosMedico : candidatos;
    pool.sort((a: any, b: any) => Number(b.fechaMs || 0) - Number(a.fechaMs || 0));

    return pool[0]?.recetaId || null;
  }

  private mapearMedicamentoRecetaAFormulario(medicamento: any): MedicamentoUI {
    const producto = medicamento?.productoId;
    const productoId = typeof producto === 'object'
      ? String(producto?._id || '').trim()
      : String(producto || '').trim();

    const nombreProducto = String(producto?.nombre || '').trim();
    const nombreLibreReceta = String(medicamento?.nombreLibre || '').trim();
    const nombreBase = nombreProducto || nombreLibreReceta;

    const via = String(medicamento?.via || 'ORAL').trim() || 'ORAL';
    const viaOtra = String(medicamento?.viaOtra || '').trim();
    const cantidadNum = medicamento?.cantidad != null && medicamento?.cantidad !== ''
      ? Number(medicamento.cantidad)
      : null;

    return {
      modo: productoId ? 'CATALOGO' : 'OTRO',
      productoId: productoId || null,
      nombreLibre: nombreBase,
      ingreActivo: String(producto?.ingreActivo || medicamento?.ingreActivo || '').trim(),
      codigoBarras: String(producto?.codigoBarras || medicamento?.codigoBarras || '').trim(),
      buscando: false,
      sinCoincidencias: false,
      dosis: String(medicamento?.dosis || '').trim(),
      via,
      viaOtra: via === 'OTRA' ? viaOtra : '',
      frecuencia: String(medicamento?.frecuencia || '').trim(),
      duracion: String(medicamento?.duracion || '').trim(),
      cantidad: Number.isFinite(cantidadNum as any) ? cantidadNum : null,
      indicaciones: String(medicamento?.indicaciones || '').trim(),
      esControlado: !!medicamento?.esControlado,
      q: productoId ? nombreBase : '',
      resultados: [],
    };
  }

  private aplicarRecetaGuardadaEnFormulario(receta: any) {
    const diagnosticos = Array.isArray(receta?.diagnosticos)
      ? receta.diagnosticos.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];

    const medicamentos = Array.isArray(receta?.medicamentos)
      ? receta.medicamentos.map((m: any) => this.mapearMedicamentoRecetaAFormulario(m))
      : [];

    this.receta = {
      diagnosticosTexto: diagnosticos.join('\n'),
      indicacionesGenerales: String(receta?.indicacionesGenerales || receta?.observaciones || '').trim(),
      citaSeguimiento: receta?.citaSeguimiento ? this.toDateInputValue(receta.citaSeguimiento) : '',
      medicamentos: medicamentos.length ? medicamentos : [this.nuevoMedicamento()],
    };
  }

  private async cargarRecetaGuardadaAlReanudar() {
    if (!this.fichaActual?._id || !this.fichaActual?.pacienteId) return;

    const recetaId =
      this.recetaPendienteImpresionId ||
      this.getRecetaActivaDeFicha(this.fichaActual._id) ||
      this.inferirRecetaIdDesdeExpedienteParaFichaActual();

    if (!recetaId) return;

    try {
      const resp: any = await firstValueFrom(this.recetasService.obtenerPorId(recetaId));
      const recetaDoc = resp?.receta;
      if (!recetaDoc?._id) {
        this.removeRecetaActivaDeFicha(this.fichaActual._id);
        return;
      }

      this.recetaPendienteImpresionId = String(recetaDoc._id);
      this.setRecetaActivaDeFicha(this.fichaActual._id, this.recetaPendienteImpresionId);
      this.aplicarRecetaGuardadaEnFormulario(recetaDoc);

      const alergiasReceta = Array.isArray(recetaDoc?.alergias)
        ? recetaDoc.alergias.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!String(this.antForm.alergiasTxt || '').trim() && alergiasReceta.length) {
        this.antForm.alergiasTxt = alergiasReceta.join(', ');
      }

      const alergiasExtra = Array.isArray(resp?.extraPaciente?.alergias)
        ? resp.extraPaciente.alergias.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!String(this.antForm.alergiasTxt || '').trim() && alergiasExtra.length) {
        this.antForm.alergiasTxt = alergiasExtra.join(', ');
      }
    } catch (e: any) {
      if (e?.status === 404) {
        this.removeRecetaActivaDeFicha(this.fichaActual._id);
      }
      console.error('No se pudo cargar receta guardada al reanudar:', e);
    }
  }

  esMia(f: any): boolean {
    const miId = this.miUsuarioId;
    return !!miId && !!f?.medicoId && String(f.medicoId) === String(miId);
  }

  async reanudar(f: any) {
    try {
      const resp = await firstValueFrom(this.fichasService.reanudarFicha(f._id));
      this.fichaActual = resp?.ficha;

      this.colapsarColaSiHayAtencion();
      this.resetAtencionUI();
      this.hydrateAtencionDesdeFicha();

      await this.cargarExpedienteSiHayPaciente();
      this.cargarSignosYNotaClinicaDeConsultaActual();
      await this.cargarRecetaGuardadaAlReanudar();

      this.colapsarColaSiHayAtencion();
      await this.cargarCola({ expand: false });
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo reanudar', e?.error?.msg || 'Error', 'error');
    }
  }

  nuevoRenglonServicio(): ServicioUI {
    return {
      productoId: '',
      cantidad: 1,
      notas: '',
      categoria: 'Servicio Médico',
      query: '',
      sugerencias: [],
      buscando: false,
    };
  }

  private hydrateAtencionDesdeFicha() {
    const serviciosFicha = Array.isArray(this.fichaActual?.servicios)
      ? this.fichaActual.servicios
      : [];

    const serviciosMedicosFicha = serviciosFicha.filter((s: any) =>
      this.esCategoriaServicioMedico(s?.categoria)
    );

    this.servicios = serviciosMedicosFicha.length
      ? serviciosMedicosFicha.map((s: any) => ({
        productoId: s?.productoId ? String(s.productoId) : '',
        cantidad: Number(s?.cantidad ?? 1) || 1,
        notas: s?.notas || '',
        categoria: String(s?.categoria || '').trim(),
        query: s?.nombre || '',
        sugerencias: [],
        buscando: false,
      }))
      : [this.nuevoRenglonServicio()];
  }

  get medicoOcupado(): boolean {
    // 1) si en UI ya estás atendiendo una ficha
    if (this.fichaActual?.estado === 'EN_ATENCION') return true;

    // 2) si no hay fichaActual (por refresh), pero la cola trae una EN_ATENCION mía
    return (this.cola || []).some(f => f?.estado === 'EN_ATENCION' && this.esMia(f));
  }

  puedeCancelarFicha(f: any): boolean {
    const estado = String(f?.estado || '').trim();
    if (!estado) return false;
    if (['ATENDIDA', 'CANCELADA', 'EN_COBRO'].includes(estado)) return false;
    if (estado === 'EN_ATENCION' && !this.esMia(f)) return false;
    return ['EN_ESPERA', 'EN_ATENCION', 'LISTA_PARA_COBRO'].includes(estado);
  }

  abrirCancelarFicha(f: any) {
    if (!this.puedeCancelarFicha(f) || this.cancelandoFicha) return;

    this.fichaParaCancelar = f;
    this.motivoCancelacion = this.motivoCancelacionPredeterminado;
    this.motivoCancelacionError = '';

    const el = document.getElementById('modalCancelarFicha');
    if (el) {
      bootstrap.Modal.getOrCreateInstance(el, { backdrop: 'static', keyboard: false }).show();
      setTimeout(() => {
        (document.getElementById('motivo-cancelacion-input') as HTMLTextAreaElement | null)?.focus();
      }, 120);
    }
  }

  onMotivoCancelacionInput() {
    if (String(this.motivoCancelacion || '').trim()) {
      this.motivoCancelacionError = '';
    }
  }

  cerrarModalCancelarFicha() {
    if (this.cancelandoFicha) return;
    this.ocultarModalCancelarFicha();
    this.limpiarCancelacionFicha();
  }

  private ocultarModalCancelarFicha() {
    const el = document.getElementById('modalCancelarFicha');
    if (!el) return;
    bootstrap.Modal.getInstance(el)?.hide();
  }

  private limpiarCancelacionFicha() {
    this.fichaParaCancelar = null;
    this.motivoCancelacion = this.motivoCancelacionPredeterminado;
    this.motivoCancelacionError = '';
    this.cancelandoFicha = false;
  }

  async confirmarCancelacionFicha() {
    if (this.cancelandoFicha) return;

    const fichaId = String(this.fichaParaCancelar?._id || '').trim();
    const motivoFinal = String(this.motivoCancelacion || '').trim();

    if (!fichaId) {
      this.motivoCancelacionError = 'Selecciona una ficha válida.';
      return;
    }

    if (!motivoFinal) {
      this.motivoCancelacionError = 'Captura el motivo de cancelación.';
      return;
    }

    this.motivoCancelacionError = '';
    this.cancelandoFicha = true;

    try {
      const resp: any = await firstValueFrom(this.fichasService.cancelarFicha(fichaId, motivoFinal));

      this.cola = (this.cola || []).filter((f) => String(f?._id || '') !== fichaId);

      if (String(this.fichaActual?._id || '') === fichaId) {
        this.removeRecetaActivaDeFicha(fichaId);
        this.removeSignosPasoDeFicha(fichaId);
        this.cancelarAtencion();
      }

      this.ocultarModalCancelarFicha();
      this.limpiarCancelacionFicha();
      await this.cargarCola({ expand: true });

      Swal.fire({
        icon: 'success',
        title: 'Listo',
        text: resp?.mensaje || 'Ficha cancelada correctamente',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo cancelar', e?.error?.msg || 'Error de red o servidor', 'error');
    } finally {
      this.cancelandoFicha = false;
    }
  }

  async llamar(f: any) {
    try {

      if (this.medicoOcupado) {
        Swal.fire('Ocupado', 'Ya estás atendiendo a un paciente. Reanuda o finaliza antes de llamar a otro.', 'info');
        return;
      }

      const resp = await firstValueFrom(this.fichasService.llamarFicha(f._id));
      this.fichaActual = resp?.ficha;

      this.resetAtencionUI();
      this.hydrateAtencionDesdeFicha();

      await this.cargarExpedienteSiHayPaciente();
      this.cargarSignosYNotaClinicaDeConsultaActual();
      await this.cargarRecetaGuardadaAlReanudar();

      if (!this.fichaActual?.pacienteId) {
        Swal.fire({
          icon: 'info',
          title: 'Paciente aún no vinculado',
          text: 'Esta ficha no está vinculada a un paciente de nuestro archivo. Completa la búsqueda o alta desde la pestaña PAC para abrir expediente.',
          timer: 2500,
          showConfirmButton: false
        });
      }

      this.colapsarColaSiHayAtencion();
      await this.cargarCola({ expand: false });
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo llamar', e?.error?.msg || 'Error', 'error');
    }
  }

  private async guardarPendientesAntesDeRegresarACola() {
    if (!this.fichaActual?._id) return;

    await this.guardarServiciosMedicos({ silent: true, closeSection: true });

    const pacienteId = this.fichaActual?.pacienteId;
    if (!pacienteId) {
      if (this.hayAlgoEnSignos()) {
        this.setSignosPasoDeFicha(this.fichaActual._id, this.payloadSignosDesdeFormulario());
        this.svExpandida = false;
      }
      return;
    }

    if (this.hayAlgoEnSignos()) {
      const payloadSignos = this.payloadSignosDesdeFormulario();
      await firstValueFrom(this.pacientesService.guardarSignosVitales(pacienteId, payloadSignos));
      this.svExpandida = false;
    }

    const notaInfo = this.buildNotaClinicaPayload();
    if (notaInfo.hayAlgo) {
      await firstValueFrom(this.pacientesService.guardarNotaClinica(pacienteId, notaInfo.payload));
      this.ncExpandida = false;
    }

    const antInfo = this.buildAntecedentesPayload();
    if (antInfo.hayAlgo) {
      await firstValueFrom(this.pacientesService.actualizarPaciente(pacienteId, { antecedentes: antInfo.payload }));
    }

    const rxInfo = this.buildPayloadRecetaFinal();
    if (rxInfo.hayAlgo && !rxInfo.tieneMedicamentos) {
      throw new Error('La receta está incompleta. Agrega al menos un medicamento o limpia la captura antes de regresar a fila.');
    }

    if (rxInfo.tieneMedicamentos) {
      const resp: any = await firstValueFrom(this.recetasService.crear(rxInfo.payload));
      this.recetaPendienteImpresionId = resp?.receta?._id ? String(resp.receta._id) : null;
      this.setRecetaActivaDeFicha(this.fichaActual?._id, this.recetaPendienteImpresionId);
      this.rxExpandida = false;
    }

    await this.cargarExpedienteSiHayPaciente();
    this.cargarSignosYNotaClinicaDeConsultaActual();
    await this.cargarRecetaGuardadaAlReanudar();
  }

  async regresarACola() {
    if (!this.fichaActual?._id) return;

    const nombre = this.fichaActual?.pacienteNombre || 'el paciente';

    const r = await Swal.fire({
      icon: 'warning',
      title: '¿Regresar a lista de espera?',
      html: `Se regresará <b>${nombre}</b> a la cola. Antes se guardarán los datos clínicos y servicios capturados.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, regresar',
      cancelButtonText: 'No',
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: true,
    });

    if (!r.isConfirmed) return;

    try {
      await this.guardarPendientesAntesDeRegresarACola();
      await firstValueFrom(this.fichasService.regresarAListaDeEspera(this.fichaActual._id));
      this.cancelarAtencion();
      await this.cargarCola({ expand: true });
      Swal.fire({ icon: 'success', title: 'Listo', timer: 900, showConfirmButton: false });
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo regresar a lista de espera', e?.message || e?.error?.msg || 'Error', 'error');
    }
  }

  cancelarAtencion() {
    this.fichaActual = null;
    this.resetAtencionUI();
    this.servicios = [];
    this.colaExpandida = true;
  }


  agregarRenglonServicio() {
    this.servicios.push(this.nuevoRenglonServicio());
  }

  private normalizarCategoriaServicio(valor: any): string {
    return String(valor ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private esCategoriaServicioMedico(categoria: any): boolean {
    const categoriaNorm = this.normalizarCategoriaServicio(categoria);
    return /^servicios?\s+medicos?(\s|$)/.test(categoriaNorm);
  }

  esServicioBloqueadoNoMedico(servicio: ServicioUI | null | undefined): boolean {
    const productoId = String(servicio?.productoId || '').trim();
    const categoria = String(servicio?.categoria || '').trim();
    return !!productoId && !!categoria && !this.esCategoriaServicioMedico(categoria);
  }

  puedeQuitarServicio(servicio: ServicioUI | null | undefined): boolean {
    return !this.esServicioBloqueadoNoMedico(servicio);
  }

  private buildServiciosConsultaPayload() {
    const conceptosVisibles = (this.servicios || [])
      .map((servicio) => ({
        productoId: String(servicio?.productoId || '').trim(),
        cantidad: Math.max(parseInt(String(servicio?.cantidad ?? 1), 10) || 1, 1),
        notas: String(servicio?.notas || '').trim(),
        categoria: String(servicio?.categoria || '').trim(),
        bloqueadoNoMedico: this.esServicioBloqueadoNoMedico(servicio),
      }))
      .filter((servicio) => !!servicio.productoId);

    const payload = conceptosVisibles
      .filter((servicio) => !servicio.bloqueadoNoMedico)
      .map(({ productoId, cantidad, notas }) => ({ productoId, cantidad, notas }));

    return {
      hayConceptos: conceptosVisibles.length > 0,
      payload,
    };
  }

  private tieneServiciosConTextoSinSeleccion(): boolean {
    return (this.servicios || []).some((servicio) => {
      if (this.esServicioBloqueadoNoMedico(servicio)) return false;
      const productoId = String(servicio?.productoId || '').trim();
      const query = String(servicio?.query || '').trim();
      return !productoId && !!query;
    });
  }

  async guardarServiciosMedicos(options: { silent?: boolean; closeSection?: boolean } = {}): Promise<boolean> {
    if (!this.fichaActual?._id) return false;

    const silent = !!options.silent;
    const closeSection = options.closeSection !== false;

    if (this.tieneServiciosConTextoSinSeleccion()) {
      const msg = 'Hay renglones de servicios sin seleccionar desde la lista. Selecciona un servicio válido o limpia esos renglones.';
      if (silent) throw new Error(msg);
      Swal.fire('Faltan datos', msg, 'warning');
      return false;
    }

    const serviciosInfo = this.buildServiciosConsultaPayload();

    this.guardandoServicios = true;
    try {
      const resp = await firstValueFrom(
        this.fichasService.actualizarServicios(this.fichaActual._id, {
          servicios: serviciosInfo.payload,
          finalizar: false,
        })
      );

      this.fichaActual = resp?.ficha ?? this.fichaActual;
      this.hydrateAtencionDesdeFicha();
      if (closeSection) this.servExpandida = false;

      if (!silent) {
        Swal.fire({
          icon: 'success',
          title: serviciosInfo.payload.length ? 'Servicios médicos guardados' : 'Servicios médicos actualizados',
          timer: 1200,
          showConfirmButton: false,
        });
      }
      return true;
    } catch (e: any) {
      const msg = e?.error?.msg || 'No se pudieron guardar los servicios médicos';
      if (silent) throw new Error(msg);
      Swal.fire('Error', msg, 'error');
      return false;
    } finally {
      this.guardandoServicios = false;
    }
  }

  quitarServicio(i: number) {
    const row = this.servicios[i];
    if (this.esServicioBloqueadoNoMedico(row)) return;
    this.servicios.splice(i, 1);
  }


  onInputServicio(i: number) {
    const row = this.servicios[i];
    if (!row || this.esServicioBloqueadoNoMedico(row)) return;

    const q = (row.query || '').trim();

    if (row.productoId) {
      row.productoId = '';
      row.categoria = 'Servicio Médico';
    }

    // limpia si está vacío
    if (!q) {
      row.sugerencias = [];
      row.productoId = '';
      row.categoria = 'Servicio Médico';
      return;
    }

    // debounce
    if (this.timers.has(i)) clearTimeout(this.timers.get(i));
    this.timers.set(i, setTimeout(() => this.buscarServicios(i), 250));
  }

  private async buscarServicios(i: number) {
    const row = this.servicios[i];
    if (!row) return;

    const q = (row.query || '').trim();
    if (q.length < 2) {
      row.sugerencias = [];
      return;
    }

    row.buscando = true;
    try {
      const resp = await firstValueFrom(this.fichasService.buscarServiciosMedicos(q));
      row.sugerencias = resp?.productos ?? [];
    } catch (e) {
      console.error(e);
      row.sugerencias = [];
    } finally {
      row.buscando = false;
    }
  }

  seleccionarServicio(i: number, p: ServicioMedico) {
    const row = this.servicios[i];
    if (!row || this.esServicioBloqueadoNoMedico(row)) return;

    row.productoId = p._id;
    row.query = p.nombre;
    row.categoria = String(p?.categoria || 'Servicio Médico').trim() || 'Servicio Médico';
    row.sugerencias = [];
  }

  blurServicio(i: number) {
    // pequeño delay para permitir click en sugerencia
    setTimeout(() => {
      const row = this.servicios[i];
      if (row) row.sugerencias = [];
    }, 150);
  }

  private hayAlgoEnSignos(): boolean {
    const s = this.signos;
    return (
      s.pesoKg != null ||
      s.tallaCm != null ||
      s.imc != null ||
      s.temperatura != null ||
      s.presionSis != null ||
      s.presionDia != null ||
      s.fc != null ||
      s.fr != null ||
      s.spo2 != null ||
      s.glucosaCapilar != null
    );
  }

  private obtenerSignosDeFichaActualEnExpediente(): any | null {
    const fichaId = this.fichaActualId;
    const lista = Array.isArray(this.expediente?.signosVitalesRecientes)
      ? this.expediente.signosVitalesRecientes
      : [];
    if (!fichaId || !lista.length) return null;

    const candidatos = lista
      .filter((sv: any) => String(sv?.fichaConsultorioId || '').trim() === fichaId)
      .sort((a: any, b: any) => {
        const aMs = this.toEpochMs(a?.fecha) || 0;
        const bMs = this.toEpochMs(b?.fecha) || 0;
        return bMs - aMs;
      });

    return candidatos[0] || null;
  }

  private obtenerNotaDeFichaActualEnExpediente(): any | null {
    const fichaId = this.fichaActualId;
    const lista = Array.isArray(this.expediente?.notasClinicasRecientes)
      ? this.expediente.notasClinicasRecientes
      : [];
    if (!fichaId || !lista.length) return null;

    const candidatos = lista
      .filter((nota: any) => String(nota?.fichaConsultorioId || '').trim() === fichaId)
      .sort((a: any, b: any) => {
        const aMs = this.toEpochMs(a?.fecha) || 0;
        const bMs = this.toEpochMs(b?.fecha) || 0;
        return bMs - aMs;
      });

    return candidatos[0] || null;
  }

  private fueGuardadoSignoEnConsultaActual(): boolean {
    const porFicha = this.obtenerSignosDeFichaActualEnExpediente();
    if (porFicha) return true;

    const llegadaAt = this.fichaActual?.llegadaAt;
    const ultimoRegistro = this.expediente?.signosVitalesRecientes?.[0];
    const fechaRegistro = ultimoRegistro?.fecha;

    if (!llegadaAt || !fechaRegistro) return false;

    const inicioAtencion = new Date(llegadaAt).getTime();
    const ultimoSigno = new Date(fechaRegistro).getTime();

    if (!Number.isFinite(inicioAtencion) || !Number.isFinite(ultimoSigno)) return false;

    // Se da una tolerancia mínima para desfases de reloj al guardar.
    return ultimoSigno >= (inicioAtencion - 60000);
  }

  private actualizarDisponibilidadCapturaSignos() {
    if (!this.fichaActual?.pacienteId) {
      this.capturaSignosDisponible = true;
      return;
    }
    this.capturaSignosDisponible = !this.fueGuardadoSignoEnConsultaActual();
  }

  private toNullableNumber(value: any): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private payloadSignosDesdeFormulario() {
    return {
      fichaConsultorioId: this.fichaActualId || undefined,
      pesoKg: this.signos.pesoKg ?? undefined,
      tallaCm: this.signos.tallaCm ?? undefined,
      imc: this.signos.imc ?? undefined,
      temperatura: this.signos.temperatura ?? undefined,
      presionSis: this.signos.presionSis ?? undefined,
      presionDia: this.signos.presionDia ?? undefined,
      fc: this.signos.fc ?? undefined,
      fr: this.signos.fr ?? undefined,
      spo2: this.signos.spo2 ?? undefined,
      glucosaCapilar: this.signos.glucosaCapilar ?? undefined,
    };
  }

  private aplicarSignosEnFormulario(signos: any) {
    this.signos = {
      pesoKg: this.toNullableNumber(signos?.pesoKg),
      tallaCm: this.toNullableNumber(signos?.tallaCm),
      imc: this.toNullableNumber(signos?.imc),
      temperatura: this.toNullableNumber(signos?.temperatura),
      presionSis: this.toNullableNumber(signos?.presionSis),
      presionDia: this.toNullableNumber(signos?.presionDia),
      fc: this.toNullableNumber(signos?.fc),
      fr: this.toNullableNumber(signos?.fr),
      spo2: this.toNullableNumber(signos?.spo2),
      glucosaCapilar: this.toNullableNumber(signos?.glucosaCapilar),
    };
  }

  private inicioConsultaActualMs(): number | null {
    const candidates = [
      this.fichaActual?.inicioAtencionAt,
      this.fichaActual?.llamadoAt,
      this.fichaActual?.llegadaAt,
    ];
    for (const value of candidates) {
      if (!value) continue;
      const ms = new Date(value).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  }

  private esFechaDeConsultaActual(fecha: any, toleranciaAntesMs = 30 * 60 * 1000): boolean {
    const fechaMs = fecha ? new Date(fecha).getTime() : NaN;
    const inicioMs = this.inicioConsultaActualMs();
    if (!Number.isFinite(fechaMs) || !Number.isFinite(inicioMs as any)) return false;
    return Number(fechaMs) >= (Number(inicioMs) - toleranciaAntesMs);
  }

  private cargarUltimosSignosEnFormulario() {
    const ultimo = this.obtenerSignosDeFichaActualEnExpediente() || this.expediente?.signosVitalesRecientes?.[0];
    if (!ultimo) {
      this.limpiarSignos();
      return;
    }

    this.signos = {
      pesoKg: this.toNullableNumber(ultimo.pesoKg),
      tallaCm: this.toNullableNumber(ultimo.tallaCm),
      imc: this.toNullableNumber(ultimo.imc),
      temperatura: this.toNullableNumber(ultimo.temperatura),
      presionSis: this.toNullableNumber(ultimo.presionSis),
      presionDia: this.toNullableNumber(ultimo.presionDia),
      fc: this.toNullableNumber(ultimo.fc),
      fr: this.toNullableNumber(ultimo.fr),
      spo2: this.toNullableNumber(ultimo.spo2),
      glucosaCapilar: this.toNullableNumber(ultimo.glucosaCapilar),
    };
  }

  private cargarSignosYNotaClinicaDeConsultaActual() {
    if (!this.fichaActual?.pacienteId) {
      const signosPaso = this.getSignosPasoDeFicha(this.fichaActual?._id);
      if (signosPaso) {
        this.aplicarSignosEnFormulario(signosPaso);
      } else {
        this.limpiarSignos();
      }
      return;
    }

    const signosFicha = this.obtenerSignosDeFichaActualEnExpediente();
    if (signosFicha) {
      this.aplicarSignosEnFormulario(signosFicha);
    } else if (this.fueGuardadoSignoEnConsultaActual()) {
      this.cargarUltimosSignosEnFormulario();
    }

    const notas = Array.isArray(this.expediente?.notasClinicasRecientes)
      ? this.expediente.notasClinicasRecientes
      : [];
    if (!notas.length) return;

    const notaExacta = this.obtenerNotaDeFichaActualEnExpediente();
    const notaActual = notaExacta || notas.find((n: any) => this.esFechaDeConsultaActual(n?.fecha, 30 * 60 * 1000));
    if (!notaActual) return;

    this.nota = {
      motivoConsulta: String(notaActual?.motivoConsulta || '').trim(),
      padecimientoActual: String(notaActual?.padecimientoActual || '').trim(),
      exploracionFisica: String(notaActual?.exploracionFisica || '').trim(),
      diagnosticosTexto: Array.isArray(notaActual?.diagnosticos)
        ? notaActual.diagnosticos.map((x: any) => String(x || '').trim()).filter(Boolean).join('\n')
        : '',
      plan: String(notaActual?.plan || '').trim(),
    };
  }

  reabrirCapturaSignos() {
    if (this.fichaActual?.pacienteId) {
      const signosFicha = this.obtenerSignosDeFichaActualEnExpediente();
      if (signosFicha) {
        this.aplicarSignosEnFormulario(signosFicha);
      } else {
        this.cargarUltimosSignosEnFormulario();
      }
    } else {
      const signosPaso = this.getSignosPasoDeFicha(this.fichaActual?._id);
      if (signosPaso) this.aplicarSignosEnFormulario(signosPaso);
    }
    this.capturaSignosDisponible = true;
    this.svExpandida = true;
  }

  private buildPayloadRecetaFinal() {
    const payload = this.buildPayloadReceta();

    const diagnosticos = this.parseDiagnosticos(this.receta.diagnosticosTexto);
    const meds = Array.isArray(payload.medicamentos)
      ? payload.medicamentos
      : [];

    payload.diagnosticos = diagnosticos;

    const diagnosticosOk = diagnosticos.length > 0;
    const medsOk = meds.length > 0;

    const hayAlgo =
      diagnosticosOk ||
      medsOk ||
      !!(this.receta.indicacionesGenerales || '').trim() ||
      !!this.receta.citaSeguimiento;

    const tieneMedicamentos = medsOk;

    return {
      hayAlgo,
      tieneMedicamentos,
      completaMin: tieneMedicamentos,
      payload
    };
  }

  async guardarYEnviarACaja() {
    if (!this.fichaActual?._id) return;

    const nombre = this.fichaActual?.pacienteNombre || 'el paciente';
    const tienePaciente = !!this.fichaActual?.pacienteId;
    const esPacienteDePaso = !tienePaciente;

    const serviciosInfo = this.buildServiciosConsultaPayload();
    const serviciosOk = serviciosInfo.payload;

    const hayServicios = serviciosInfo.hayConceptos;

    const haySignosCapturados = this.hayAlgoEnSignos();
    const signosSeGuardaran = haySignosCapturados && tienePaciente;
    const expedienteTieneSignos = (this.expediente?.signosVitalesRecientes || []).length > 0;

    const rxInfo = this.buildPayloadRecetaFinal();
    const hayRecetaValida = rxInfo.tieneMedicamentos;
    const recetaPacienteDePaso = !tienePaciente && hayRecetaValida;
    const recetaIncompleta = rxInfo.hayAlgo && !rxInfo.tieneMedicamentos;
    const expedienteTieneRecetas = (this.expediente?.ultimasRecetas || []).length > 0;

    const faltantes: string[] = [];
    const antInfo = this.buildAntecedentesPayload();
    const pacInfo = this.buildPacienteUpdatePayload();
    const notaInfo = this.buildNotaClinicaPayload();
    const antecedentesSeGuardaran = tienePaciente && antInfo.hayAlgo;
    const expedienteTieneAntecedentes = this.expedienteTieneAntecedentes();

    if (tienePaciente) {
      if (!haySignosCapturados && !expedienteTieneSignos) faltantes.push('Signos vitales');
      if (!rxInfo.hayAlgo && !expedienteTieneRecetas) faltantes.push('Receta médica');
      if (!antInfo.hayAlgo && !expedienteTieneAntecedentes) faltantes.push('Antecedentes');
      if (!pacInfo.hayAlgo) faltantes.push('Datos del paciente');
      if (!hayServicios) faltantes.push('Servicios médicos ("No recibirá usted honorarios por esta consulta")');
    }

    const avisos: string[] = [];

    if (esPacienteDePaso) {
      avisos.push('La consulta se finalizará como paciente de paso. No se dará de alta en la colección de pacientes ni se abrirá expediente.');
    }
    if (haySignosCapturados && !tienePaciente) {
      avisos.push('Capturaste signos vitales, pero al ser paciente de paso no se guardarán en expediente.');
    }
    if (antInfo.hayAlgo && !tienePaciente) {
      avisos.push('Capturaste antecedentes, pero al ser paciente de paso no se guardarán en expediente.');
    }
    if (rxInfo.hayAlgo && !tienePaciente && !hayRecetaValida) {
      avisos.push('La receta del paciente de paso está incompleta.');
    }
    if (recetaPacienteDePaso) {
      avisos.push('La receta del paciente de paso se imprimirá pero no se guardará en historial clínico.');
    }
    if (recetaIncompleta) {
      avisos.push('La receta está incompleta (agrega al menos un medicamento para poder guardarla).');
    }
    if (notaInfo.hayAlgo) {
      avisos.push(
        tienePaciente
          ? 'La nota clínica capturada se guardará o actualizará en esta misma ficha al finalizar.'
          : 'Capturaste una nota clínica, pero al ser paciente de paso no se guardará en expediente.'
      );
    }

    const htmlFaltantes = faltantes.length
      ? `<div style="text-align:left"><b>No se capturó:</b><ul>${faltantes.map(x => `<li>${x}</li>`).join('')}</ul></div>`
      : `<div style="text-align:left"><b>Todo listo.</b></div>`;

    const htmlAvisos = avisos.length
      ? `<div style="text-align:left; margin-top:10px"><b>Notas:</b><ul>${avisos.map(x => `<li>${x}</li>`).join('')}</ul></div>`
      : '';

    const r = await Swal.fire({
      icon: 'question',
      title: '¿Finalizar consulta?',
      html: `
      <div style="text-align:left">
        Se finalizará la consulta de <b>${nombre}</b>.
      </div>
      <hr/>
      ${htmlFaltantes}
      ${htmlAvisos}
    `,
      showCancelButton: true,
      confirmButtonText: 'Sí, finalizar',
      cancelButtonText: 'No',
      reverseButtons: true,
      allowEscapeKey: true,
    });

    if (!r.isConfirmed) return;

    const recetaPendienteId = this.recetaPendienteImpresionId;
    const hayRecetaParaImprimir = recetaPacienteDePaso || hayRecetaValida || !!recetaPendienteId;
    const alergiasCaptura = antInfo.payload.alergias.length
      ? antInfo.payload.alergias.join(', ')
      : this.obtenerAlergiasConsultaActualTexto();
    const signosParaImpresion = this.hayAlgoEnSignos()
      ? { ...this.signos }
      : (this.obtenerSignosDeFichaActualEnExpediente() || this.expediente?.signosVitalesRecientes?.[0] || null);

    const contextoImpresion = {
      recetaPendienteId,
      recetaPacienteDePaso,
      hayRecetaValida,
      recetaPayload: rxInfo.payload,
      alergias: alergiasCaptura,
      signosVitalesPreferidos: signosParaImpresion,
    };

    let recetaImpresa = false;

    if (hayRecetaParaImprimir) {
      recetaImpresa = await this.imprimirRecetaAntesDeFinalizar(contextoImpresion);

      while (true) {
        const confirmacionImpresion = await Swal.fire({
          icon: 'question',
          title: 'Receta impresa',
          text: '¿Todo está correcto o deseas modificar algo antes de cerrar la consulta?',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: 'Todo bien, finalizar',
          denyButtonText: 'Reimprimir',
          cancelButtonText: 'Modificar',
          reverseButtons: true,
          allowOutsideClick: false,
        });

        if (confirmacionImpresion.isConfirmed) break;

        if (confirmacionImpresion.isDenied) {
          const reimpresa = await this.imprimirRecetaAntesDeFinalizar(contextoImpresion);
          recetaImpresa = recetaImpresa || reimpresa;
          continue;
        }

        return;
      }
    }

    const pacienteInfoSeGuardara = tienePaciente && pacInfo.hayAlgo;

    const payloadFinal: any = {
      servicios: serviciosOk,
      signosVitales: signosSeGuardaran ? {
        pesoKg: this.signos.pesoKg ?? undefined,
        tallaCm: this.signos.tallaCm ?? undefined,
        imc: this.signos.imc ?? undefined,
        temperatura: this.signos.temperatura ?? undefined,
        presionSis: this.signos.presionSis ?? undefined,
        presionDia: this.signos.presionDia ?? undefined,
        fc: this.signos.fc ?? undefined,
        fr: this.signos.fr ?? undefined,
        spo2: this.signos.spo2 ?? undefined,
        glucosaCapilar: this.signos.glucosaCapilar ?? undefined,
      } : null,
      notaClinica: (tienePaciente && notaInfo.hayAlgo) ? notaInfo.payload : null,
      antecedentes: antecedentesSeGuardaran ? antInfo.payload : null,
      receta: hayRecetaValida ? rxInfo.payload : null,
      paciente: pacienteInfoSeGuardara ? pacInfo.payload : null,
    };

    this.guardando = true;
    try {
      const resp = await firstValueFrom(this.fichasService.finalizarConsulta(this.fichaActual._id, payloadFinal));

      const estadoFinal = resp?.estadoFinal;
      this.recetaPendienteImpresionId = null;

      const msgs: string[] = [];

      if (estadoFinal === 'LISTA_PARA_COBRO') {
        msgs.push('Indique al paciente que pase a pagar a caja.');
      } else {
        msgs.push(esPacienteDePaso ? 'El paciente de paso fue atendido.' : 'El paciente fue atendido.');
        if (!hayRecetaParaImprimir && !hayServicios) {
          msgs.push('No tuvo receta ni servicios médicos.');
        }
      }

      if (esPacienteDePaso) {
        msgs.push('La consulta se cerró sin alta en la colección de pacientes.');
      }

      if (hayRecetaParaImprimir) {
        msgs.push(
          recetaImpresa
            ? 'La receta se abrió para impresión.'
            : 'La receta quedó lista, pero no se pudo abrir la impresión automáticamente. Revisa el bloqueador de ventanas emergentes.'
        );
        msgs.push('Si gusta puede surtir su receta en nuestra farmacia.');
      }

      await Swal.fire({
        icon: 'success',
        title: 'Listo',
        html: `<div style="text-align:left"><ul>${msgs.map(m => `<li>${m}</li>`).join('')}</ul></div>`,
        confirmButtonText: 'Aceptar',
        allowOutsideClick: false,
      });

      this.removeRecetaActivaDeFicha(this.fichaActual?._id);
      this.removeSignosPasoDeFicha(this.fichaActual?._id);
      this.cancelarAtencion();
      await this.cargarCola({ expand: true });

    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo finalizar la consulta', 'error');
    } finally {
      this.guardando = false;
    }
  }

  private construirSignosDesdeCapturaActual(): string[] {
    if (!this.hayAlgoEnSignos()) return [];
    return this.construirResumenSignosVitales(this.signos);
  }

  private async imprimirRecetaCapturaActual(recetaPayload: any, targetWindow?: Window | null) {
    const farmRaw = localStorage.getItem('user_farmacia');
    const farm = farmRaw ? JSON.parse(farmRaw) : {};
    const medico = await this.obtenerUsuarioMedicoParaImpresion();
    const signos = this.construirSignosDesdeCapturaActual();
    const signosFinales = signos.length
      ? signos
      : this.construirResumenSignosVitales(this.obtenerSignosDeFichaActualEnExpediente() || this.expediente?.signosVitalesRecientes?.[0]);

    const data: RecetaPrintData = {
      medicoNombre: this.obtenerNombreMedicoImpresion(medico),
      medicoTitulo: this.obtenerTituloMedicoImpresion(medico),
      medicoEscuela: this.obtenerEscuelaMedicoImpresion(medico),
      logoEscuelaUrl: this.obtenerLogoEscuelaMedicoImpresion(medico),
      cedula: this.obtenerCedulaMedicoImpresion(medico),
      pacienteNombre: this.nombrePacienteExpediente() || String(this.fichaActual?.pacienteNombre || 'Paciente').trim(),
      fecha: new Date().toLocaleDateString('es-MX'),
      citaSeguimiento: this.formatearCitaSeguimiento(recetaPayload?.citaSeguimiento),
      diagnosticos: Array.isArray(recetaPayload?.diagnosticos) ? recetaPayload.diagnosticos : [],
      edad: this.calcEdad(this.paciente),
      alergias: this.obtenerAlergiasConsultaActualTexto(),
      signosVitales: signosFinales,
      recomendaciones: String(recetaPayload?.indicacionesGenerales || '').trim(),
      direccion: String(farm?.direccion || '').trim(),
      telefono: String(farm?.telefono || '').trim(),
      medicamentos: this.construirMedicamentosImpresion(recetaPayload?.medicamentos || []),
    };

    const copias = this.recetaTieneAntibiotico(data.medicamentos) ? 2 : 1;
    const html = this.construirHtmlImpresionReceta(data, copias);
    this.renderizarHtmlImpresion(html, targetWindow);
  }

  private async imprimirRecetaAntesDeFinalizar(contexto: {
    recetaPendienteId: string | null;
    recetaPacienteDePaso: boolean;
    hayRecetaValida: boolean;
    recetaPayload: any;
    alergias: string;
    signosVitalesPreferidos: any;
  }): Promise<boolean> {
    const printWindow = this.prepararVentanaImpresion();

    try {
      if (contexto.recetaPendienteId) {
        await this.imprimirReceta(contexto.recetaPendienteId, printWindow, {
          signosVitalesPreferidos: contexto.signosVitalesPreferidos,
          alergiasPreferidas: contexto.alergias,
        });
        return true;
      }

      if (contexto.recetaPacienteDePaso) {
        await this.imprimirRecetaPaso(contexto.recetaPayload, printWindow, { alergias: contexto.alergias });
        return true;
      }

      if (contexto.hayRecetaValida) {
        await this.imprimirRecetaCapturaActual(contexto.recetaPayload, printWindow);
        return true;
      }

      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      return false;
    } catch (printErr) {
      console.error(printErr);
      if (printWindow && !printWindow.closed) {
        try { printWindow.close(); } catch { }
      }

      Swal.fire(
        'Aviso',
        'No se pudo abrir la impresión automáticamente. Revisa el bloqueador de ventanas emergentes.',
        'warning'
      );
      return false;
    }
  }

  private pad2(n: number) { return String(n).padStart(2, '0'); }

  tiempoEnEspera(f: any): string {
    // Si está en atención, no mostramos tiempo de espera.
    if (f?.estado === 'EN_ATENCION') return 'En atención';

    const t = f?.llegadaAt ? new Date(f.llegadaAt).getTime() : null;
    if (!t || Number.isNaN(t)) return '?';

    const diff = Date.now() - t;
    if (diff < 0) return '?';

    const totalMin = Math.floor(diff / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;

    return h > 0 ? `${h}h ${this.pad2(m)}m` : `${m}m`;
  }

  toggleCola() {
    this.colaExpandida = !this.colaExpandida;
  }

  // Opcional: colapsar automáticamente cuando llamas a alguien
  private colapsarColaSiHayAtencion() {
    if (this.fichaActual) this.colaExpandida = false;
  }

  get hayUrgenciasEnCola(): boolean {
    return (this.cola || []).some((c: any) => !!c?.urgencia);
  }

  private resetBusquedaPaciente() {
    this.pacienteBusqueda = '';
    this.pacientesEncontrados = [];
    this.buscandoPaciente = false;
    this.busquedaPacienteRealizada = false;
  }

  limpiarBusquedaPaciente() {
    this.resetBusquedaPaciente();
  }

  private resetPacForm() {
    this.pacForm = {
      nombre: '',
      apPaterno: '',
      apMaterno: '',
      telefono: '',
      email: '',
      direccion: '',
      emergenciaNombre: '',
      emergenciaTelefono: '',
      emergenciaParentesco: '',
      fechaNacimiento: '',
      sexo: 'NoEspecifica',
      curp: '',
      curpEsProvisional: false,
      entidadNacimiento: '',
      ocupacion: '',
      escolaridad: '',
    };
  }

  private resetNotaClinicaForm() {
    this.nota = {
      motivoConsulta: '',
      padecimientoActual: '',
      exploracionFisica: '',
      diagnosticosTexto: '',
      plan: '',
    };
  }

  limpiarNotaClinicaForm() {
    this.resetNotaClinicaForm();
  }

  recargarFormularioPaciente() {
    if (this.paciente?._id) {
      this.fillPacienteFormFromPaciente();
      return;
    }
    this.prefillPacienteFormDesdeFicha(true);
  }

  labelEntidadNacimiento(clave: string): string {
    const value = String(clave || '').trim().toUpperCase();
    if (!value) return '?';
    const found = this.entidadesNacimiento.find((e) => e.value === value);
    return found ? found.label : value;
  }

  datosMinimosCurpCapturados(): boolean {
    const curp = String(this.pacForm.curp || '').trim().toUpperCase();
    if (curp) return true;

    return !!(
      String(this.pacForm.nombre || '').trim() &&
      String(this.pacForm.apPaterno || '').trim() &&
      this.pacForm.fechaNacimiento &&
      this.pacForm.sexo !== 'NoEspecifica' &&
      String(this.pacForm.entidadNacimiento || '').trim()
    );
  }

  onPacCurpInput() {
    this.pacForm.curp = String(this.pacForm.curp || '').trim().toUpperCase();
    if (this.pacForm.curp) {
      this.pacForm.curpEsProvisional = false;
    }
  }

  private validarPacFormParaGuardado(requiereDatosParaCurp: boolean): string | null {
    const nombre = String(this.pacForm.nombre || '').trim();
    const apPaterno = String(this.pacForm.apPaterno || '').trim();
    const curp = String(this.pacForm.curp || '').trim().toUpperCase();

    if (!nombre) return 'Nombre(s) es requerido.';
    if (!apPaterno) return 'Apellido paterno es requerido.';

    if (curp && !/^[A-Z0-9]{18}$/.test(curp)) {
      return 'La CURP manual debe tener 18 caracteres alfanuméricos.';
    }

    if (!curp && requiereDatosParaCurp) {
      if (!this.pacForm.fechaNacimiento) return 'Fecha de nacimiento es requerida si no capturas CURP.';
      if (this.pacForm.sexo === 'NoEspecifica') return 'Sexo es requerido si no capturas CURP.';
      if (!String(this.pacForm.entidadNacimiento || '').trim()) {
        return 'Entidad de nacimiento es requerida si no capturas CURP.';
      }
    }

    return null;
  }

  private prefillPacienteFormDesdeFicha(force = false) {
    if (this.paciente?._id && !force) {
      this.fillPacienteFormFromPaciente();
      return;
    }

    this.resetPacForm();

    const nombreCompleto = String(this.fichaActual?.pacienteNombre || '').trim();
    let nombre = '';
    let apPaterno = String(this.fichaActual?.pacienteAPaterno || '').trim();
    let apMaterno = String(this.fichaActual?.pacienteAMaterno || '').trim();

    if (nombreCompleto) {
      if (apPaterno || apMaterno) {
        const fullNorm = nombreCompleto.toLowerCase();
        const apPatNorm = apPaterno.toLowerCase();
        const apMatNorm = apMaterno.toLowerCase();

        if (apPatNorm && fullNorm.endsWith(` ${apPatNorm} ${apMatNorm}`.trim())) {
          nombre = nombreCompleto.slice(0, nombreCompleto.length - (` ${apPaterno} ${apMaterno}`.trim().length)).trim();
        }

        if (!nombre && apPatNorm && fullNorm.endsWith(` ${apPatNorm}`)) {
          nombre = nombreCompleto.slice(0, nombreCompleto.length - apPaterno.length).trim();
        }
      } else {
        const partes = nombreCompleto.split(/\s+/).filter(Boolean);
        if (partes.length >= 3) {
          apMaterno = partes.pop() || '';
          apPaterno = partes.pop() || '';
          nombre = partes.join(' ');
        } else {
          nombre = nombreCompleto;
        }
      }
    }

    this.pacForm.nombre = nombre || nombreCompleto;
    this.pacForm.apPaterno = apPaterno;
    this.pacForm.apMaterno = apMaterno;
    this.pacForm.telefono = String(this.fichaActual?.pacienteTelefono || '').trim();
  }

  private actualizarFichaActualDesdePacienteLocal(data: any) {
    if (!this.fichaActual) return;

    const nombre = String(data?.nombre || this.paciente?.nombre || '').trim();
    const apPaterno = String(data?.apPaterno || this.paciente?.apPaterno || '').trim();
    const apMaterno = String(data?.apMaterno || this.paciente?.apMaterno || '').trim();
    const telefono = String(
      data?.contacto?.telefono ??
      data?.telefono ??
      this.paciente?.contacto?.telefono ??
      this.fichaActual?.pacienteTelefono ??
      ''
    ).trim();

    const nombreCompleto = [nombre, apPaterno, apMaterno].filter(Boolean).join(' ').trim();

    if (nombreCompleto) this.fichaActual.pacienteNombre = nombreCompleto;
    this.fichaActual.pacienteAPaterno = apPaterno;
    this.fichaActual.pacienteAMaterno = apMaterno;
    this.fichaActual.pacienteTelefono = telefono;
    if (data?._id) this.fichaActual.pacienteId = data._id;

    const idx = (this.cola || []).findIndex((x: any) => String(x?._id) === String(this.fichaActual?._id));
    if (idx >= 0) {
      this.cola[idx] = {
        ...this.cola[idx],
        pacienteNombre: this.fichaActual.pacienteNombre,
        pacienteAPaterno: apPaterno,
        pacienteAMaterno: apMaterno,
        pacienteTelefono: telefono,
        pacienteId: this.fichaActual.pacienteId,
      };
    }
  }

  private buildPacienteUpdatePayload(options: { preserveBlankCurp?: boolean } = {}) {
    const preserveBlankCurp = options.preserveBlankCurp !== false;
    const f = this.pacForm;

    const curp = String(f.curp || '').trim().toUpperCase();

    const payload: any = {
      nombre: String(f.nombre || '').trim(),
      apPaterno: String(f.apPaterno || '').trim(),
      apMaterno: String(f.apMaterno || '').trim(),
      contacto: {
        telefono: String(f.telefono || '').trim(),
        email: String(f.email || '').trim(),
        direccion: String(f.direccion || '').trim(),
        emergencia: {
          nombre: String(f.emergenciaNombre || '').trim(),
          telefono: String(f.emergenciaTelefono || '').trim(),
          parentesco: String(f.emergenciaParentesco || '').trim(),
        },
      },
      datosGenerales: {
        fechaNacimiento: f.fechaNacimiento || undefined,
        sexo: f.sexo || 'NoEspecifica',
        entidadNacimiento: String(f.entidadNacimiento || '').trim().toUpperCase(),
        ocupacion: String(f.ocupacion || '').trim(),
        escolaridad: String(f.escolaridad || '').trim(),
      },
    };

    if (curp) {
      payload.datosGenerales.curp = curp;
      payload.datosGenerales.curpEsProvisional = !!f.curpEsProvisional;
    } else if (!preserveBlankCurp) {
      payload.datosGenerales.curp = '';
      payload.datosGenerales.curpEsProvisional = false;
    }

    const hayEmergencia = !!(
      payload.contacto.emergencia.nombre ||
      payload.contacto.emergencia.telefono ||
      payload.contacto.emergencia.parentesco
    );

    const hayAlgo = !!(
      payload.nombre ||
      payload.apPaterno ||
      payload.apMaterno ||
      payload.contacto.telefono ||
      payload.contacto.email ||
      payload.contacto.direccion ||
      hayEmergencia ||
      payload.datosGenerales.fechaNacimiento ||
      curp ||
      payload.datosGenerales.entidadNacimiento ||
      payload.datosGenerales.ocupacion ||
      payload.datosGenerales.escolaridad ||
      (payload.datosGenerales.sexo && payload.datosGenerales.sexo !== 'NoEspecifica')
    );

    return { hayAlgo, payload };
  }

  private buildCreatePacientePayloadFromPacForm() {
    const curp = String(this.pacForm.curp || '').trim().toUpperCase();

    return {
      nombre: String(this.pacForm.nombre || '').trim(),
      apPaterno: String(this.pacForm.apPaterno || '').trim(),
      apMaterno: String(this.pacForm.apMaterno || '').trim(),
      telefono: String(this.pacForm.telefono || '').trim(),
      fechaNacimiento: this.pacForm.fechaNacimiento || undefined,
      sexo: this.pacForm.sexo || 'NoEspecifica',
      entidadNacimiento: String(this.pacForm.entidadNacimiento || '').trim().toUpperCase(),
      curp: curp || undefined,
      generarCurp: !curp,
    };
  }

  private buildNotaClinicaPayload() {
    const motivoCapturado = String(this.nota.motivoConsulta || '').trim();
    const fichaConsultorioId = this.fichaActualId || undefined;

    const payload = {
      fichaConsultorioId,
      motivoConsulta: motivoCapturado,
      padecimientoActual: String(this.nota.padecimientoActual || '').trim(),
      exploracionFisica: String(this.nota.exploracionFisica || '').trim(),
      diagnosticos: this.parseDiagnosticos(this.nota.diagnosticosTexto),
      plan: String(this.nota.plan || '').trim(),
    };

    const hayAlgo = !!(
      payload.motivoConsulta ||
      payload.padecimientoActual ||
      payload.exploracionFisica ||
      payload.diagnosticos.length ||
      payload.plan
    );

    return { hayAlgo, payload };
  }

  private hayNotaClinicaEnCaptura(): boolean {
    return this.buildNotaClinicaPayload().hayAlgo;
  }

  expedienteTieneAntecedentes(): boolean {
    const ant = this.paciente?.antecedentes || {};
    return !!(
      (Array.isArray(ant.alergias) && ant.alergias.length) ||
      (Array.isArray(ant.enfermedadesCronicas) && ant.enfermedadesCronicas.length) ||
      (Array.isArray(ant.medicamentosActuales) && ant.medicamentosActuales.length) ||
      (Array.isArray(ant.cirugiasPrevias) && ant.cirugiasPrevias.length) ||
      (Array.isArray(ant.antecedentesFamiliares) && ant.antecedentesFamiliares.length) ||
      (ant.tabaquismo && ant.tabaquismo !== 'No') ||
      (ant.alcohol && ant.alcohol !== 'No')
    );
  }

  async buscarPacientes() {
    const q = String(this.pacienteBusqueda || '').trim();
    if (!q) {
      Swal.fire('Falta búsqueda', 'Escribe CURP o nombre del paciente.', 'warning');
      return;
    }

    this.buscandoPaciente = true;
    this.busquedaPacienteRealizada = false;
    this.pacientesEncontrados = [];

    try {
      const resp: any = await firstValueFrom(this.pacientesService.buscar(q));
      const encontrados = resp?.paciente?._id
        ? [resp.paciente]
        : Array.isArray(resp?.pacientes)
          ? resp.pacientes
          : [];

      this.pacientesEncontrados = encontrados;
      this.busquedaPacienteRealizada = true;
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo buscar el paciente', 'error');
    } finally {
      this.buscandoPaciente = false;
    }
  }

  async guardarPacientePAC() {
    if (!this.fichaActual?._id) return;

    const esAlta = !this.fichaActual?.pacienteId;
    const error = this.validarPacFormParaGuardado(esAlta);
    if (error) {
      this.expedienteTab = 'PAC';
      Swal.fire('Completa los datos del paciente', error, 'warning');
      return;
    }

    this.guardandoPaciente = true;
    try {
      if (esAlta) {
        const createPayload = this.buildCreatePacientePayloadFromPacForm();
        const resp: any = await firstValueFrom(this.pacientesService.crearConsultorio(createPayload));
        const pacienteId = resp?.paciente?._id;

        if (!pacienteId) {
          throw new Error('No se pudo crear el paciente');
        }

        if (!resp?.yaExistia) {
          const patchInfo = this.buildPacienteUpdatePayload({ preserveBlankCurp: true });
          await firstValueFrom(this.pacientesService.actualizarPaciente(pacienteId, patchInfo.payload));
        }

        await this.vincularPacientePorId(pacienteId, { silentSuccess: true });
        this.expedienteTab = 'PAC';

        Swal.fire({
          icon: 'success',
          title: resp?.yaExistia
            ? 'Paciente existente vinculado'
            : 'Paciente creado y vinculado',
          text: resp?.yaExistia
            ? 'Se reutilizó el paciente existente asociado a la CURP capturada.'
            : 'La CURP provisional quedó generada en cuando fue necesario.',
          timer: 1500,
          showConfirmButton: false,
        });
        return;
      }

      const patchInfo = this.buildPacienteUpdatePayload({ preserveBlankCurp: true });
      await firstValueFrom(this.pacientesService.actualizarPaciente(this.fichaActual.pacienteId, patchInfo.payload));
      await this.cargarExpedienteSiHayPaciente();
      this.expedienteTab = 'PAC';

      Swal.fire({
        icon: 'success',
        title: 'Datos del paciente guardados',
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo guardar la información del paciente', 'error');
    } finally {
      this.guardandoPaciente = false;
    }
  }

  async guardarAntecedentes() {
    const pacienteId = this.fichaActual?.pacienteId;
    if (!pacienteId) {
      Swal.fire('Falta paciente', 'Primero vincula o crea el paciente.', 'warning');
      return;
    }

    const antInfo = this.buildAntecedentesPayload();
    const habiaAntecedentes = this.expedienteTieneAntecedentes();

    if (!antInfo.hayAlgo && !habiaAntecedentes) {
      Swal.fire('Sin datos', 'Captura al menos un antecedente para guardarlo.', 'warning');
      return;
    }

    this.guardandoAntecedentes = true;
    try {
      await firstValueFrom(
        this.pacientesService.actualizarPaciente(pacienteId, { antecedentes: antInfo.payload })
      );
      await this.cargarExpedienteSiHayPaciente();
      this.expedienteTab = 'ANT';

      Swal.fire({
        icon: 'success',
        title: antInfo.hayAlgo ? 'Antecedentes guardados' : 'Antecedentes limpiados',
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudieron guardar los antecedentes', 'error');
    } finally {
      this.guardandoAntecedentes = false;
    }
  }

  async guardarNotaClinica() {
    const pacienteId = this.fichaActual?.pacienteId;
    if (!pacienteId) {
      Swal.fire('Falta paciente', 'Primero vincula o crea el paciente.', 'warning');
      return;
    }

    const notaInfo = this.buildNotaClinicaPayload();
    if (!notaInfo.hayAlgo) {
      Swal.fire('Sin datos', 'Captura al menos un campo de la nota clínica.', 'warning');
      return;
    }

    this.guardandoNotaClinica = true;
    try {
      const respNota: any = await firstValueFrom(this.pacientesService.guardarNotaClinica(pacienteId, notaInfo.payload));
      await this.cargarExpedienteSiHayPaciente();
      this.ncExpandida = false;

      Swal.fire({
        icon: 'success',
        title: respNota?.actualizado ? 'Nota clínica actualizada' : 'Nota clínica guardada',
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo guardar la nota clínica', 'error');
    } finally {
      this.guardandoNotaClinica = false;
    }
  }

  private fillPacienteFormFromPaciente() {
    const p: any = this.paciente || {};
    const c = p.contacto || {};
    const dg = p.datosGenerales || {};
    const em = c.emergencia || {};

    this.pacForm.nombre = p.nombre || '';
    this.pacForm.apPaterno = p.apPaterno || '';
    this.pacForm.apMaterno = p.apMaterno || '';

    this.pacForm.telefono = c.telefono || '';
    this.pacForm.email = c.email || '';
    this.pacForm.direccion = c.direccion || '';

    this.pacForm.emergenciaNombre = em.nombre || '';
    this.pacForm.emergenciaTelefono = em.telefono || '';
    this.pacForm.emergenciaParentesco = em.parentesco || '';

    this.pacForm.fechaNacimiento = dg.fechaNacimiento
      ? this.toDateInputValue(dg.fechaNacimiento)
      : '';

    this.pacForm.sexo = dg.sexo || 'NoEspecifica';
    this.pacForm.curp = dg.curp || '';
    this.pacForm.curpEsProvisional = !!dg.curpEsProvisional;
    this.pacForm.entidadNacimiento = dg.entidadNacimiento || '';
    this.pacForm.ocupacion = dg.ocupacion || '';
    this.pacForm.escolaridad = dg.escolaridad || '';
  }

  private getDateParts(d: any): { year: number; month: number; day: number } | null {
    if (!d) return null;

    if (typeof d === 'string') {
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        return {
          year: Number(m[1]),
          month: Number(m[2]),
          day: Number(m[3]),
        };
      }
    }

    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;

    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
    };
  }

  private toDateInputValue(d: any): string {
    const parts = this.getDateParts(d);
    if (!parts) return '';
    const mm = String(parts.month).padStart(2, '0');
    const dd = String(parts.day).padStart(2, '0');
    return `${parts.year}-${mm}-${dd}`;
  }

  async cargarExpedienteSiHayPaciente() {
    const pid = this.fichaActual?.pacienteId;
    if (!pid) {
      this.paciente = null;
      this.expediente = null;
      this.prefillAntecedentesFormDesdePaciente();
      this.prefillPacienteFormDesdeFicha(true);
      this.expedienteTab = 'PAC';
      this.actualizarDisponibilidadCapturaSignos();
      return;
    }

    try {
      const resp: any = await firstValueFrom(this.pacientesService.getExpediente(pid));
      this.paciente = resp?.paciente ?? null;
      this.expediente = resp ?? null;
      this.fillPacienteFormFromPaciente();
      this.prefillAntecedentesFormDesdePaciente();
      this.actualizarFichaActualDesdePacienteLocal(this.paciente);
      this.actualizarDisponibilidadCapturaSignos();
    } catch (e) {
      console.error(e);
      this.paciente = null;
      this.expediente = null;
      this.prefillAntecedentesFormDesdePaciente();
      this.prefillPacienteFormDesdeFicha(true);
      this.actualizarDisponibilidadCapturaSignos();
    }
  }

  async vincularPacientePorId(pacienteId: string, options: { silentSuccess?: boolean } = {}) {
    if (!this.fichaActual?._id) return;

    try {
      const resp = await firstValueFrom(this.fichasService.vincularPaciente(this.fichaActual._id, pacienteId));
      this.fichaActual = resp?.ficha;

      this.resetBusquedaPaciente();
      await this.cargarExpedienteSiHayPaciente();
      this.expedienteTab = 'PAC';

      if (!options.silentSuccess) {
        Swal.fire({ icon: 'success', title: 'Paciente vinculado', timer: 900, showConfirmButton: false });
      }
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo vincular paciente', e?.error?.msg || 'Error', 'error');
    }
  }

  async abrirVincularPaciente() {
    if (!this.fichaActual?._id) return;

    this.expExpandida = true;
    this.expedienteTab = 'PAC';

    if (!this.fichaActual?.pacienteId) {
      this.prefillPacienteFormDesdeFicha(true);
    } else {
      this.fillPacienteFormFromPaciente();
    }

    setTimeout(() => {
      document.getElementById('paciente-busqueda-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (document.getElementById('paciente-busqueda-input') as HTMLInputElement | null)?.focus();
    }, 80);
  }

  expedienteTab: 'PAC' | 'ANT' | 'SV' | 'RX' = 'PAC';

  setExpedienteTab(tab: 'PAC' | 'ANT' | 'SV' | 'RX') {
    if (!this.fichaActual?.pacienteId && tab !== 'PAC') return;
    this.expedienteTab = tab;
    if (tab === 'PAC') {
      if (this.paciente?._id) this.fillPacienteFormFromPaciente();
      else this.prefillPacienteFormDesdeFicha();
    }
  }

  nombrePacienteExpediente(): string {
    const p = this.paciente;
    if (!p) return this.fichaActual?.pacienteNombre || '';
    return `${p?.nombre || ''} ${p?.apPaterno || ''} ${p?.apMaterno || ''}`.trim();
  }

  fmtLista(arr: any[] | undefined): string {
    if (!Array.isArray(arr) || arr.length === 0) return '?';
    return arr.filter(Boolean).join(', ');
  }

  fmtTA(sv: any): string {
    const sis = sv?.presionSis;
    const dia = sv?.presionDia;
    if (sis == null && dia == null) return '?';
    return `${sis ?? '?'}/${dia ?? '?'}`;
  }

  private obtenerTituloMedicoImpresion(info: any): string {
    return this.repararMojibake(
      String(info?.titulo || info?.especialidad || info?.titulo1 || info?.titulo2 || '').trim()
    );
  }

  private obtenerEscuelaMedicoImpresion(info: any): string {
    return this.repararMojibake(String(info?.escuela || '').trim());
  }

  private obtenerLogoEscuelaMedicoImpresion(info: any): string {
    const ruta = String(info?.logoescuela || '').trim();
    if (!ruta) return '';
    return buildImgUrl(ruta);
  }

  private obtenerNombreMedicoImpresion(info: any): string {
    const nombreSolo = this.repararMojibake(String(info?.nombre || '').trim());
    if (nombreSolo) return nombreSolo;

    const nombre = this.repararMojibake(String(info?.nombre || info?.nombreCompleto || '').trim());
    const apellidos = this.repararMojibake(String(info?.apellidos || '').trim());
    const nombreCompleto = [nombre, apellidos].filter(Boolean).join(' ').trim();

    return this.repararMojibake(String(
      info?.nombreCompleto ||
      info?.nombreMedico ||
      nombreCompleto ||
      nombre
    ).trim()) || '?';
  }

  private obtenerCedulaMedicoImpresion(info: any): string {
    return this.repararMojibake(
      String(info?.cedulaProfesional || info?.cedula || info?.profesional || info?.cedulaProf || '').trim()
    );
  }

  private obtenerUsuarioMedicoLocal(): any {
    const posibles = ['auth_user', 'usuario'];
    const merged: any = {};

    for (const key of posibles) {
      try {
        const raw = localStorage.getItem(key);
        const obj = raw ? JSON.parse(raw) : null;
        if (obj && typeof obj === 'object') {
          Object.assign(merged, obj);
        }
      } catch { }
    }

    return merged;
  }

  private async obtenerUsuarioMedicoParaImpresion(): Promise<any> {
    const local = this.obtenerUsuarioMedicoLocal();
    const yaCompleto = !!String(local?.nombre || '').trim() &&
      !!String(local?.cedulaProfesional || local?.cedula || '').trim() &&
      !!String(local?.titulo || '').trim() &&
      !!String(local?.escuela || '').trim();

    if (yaCompleto) return local;

    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
      if (!token) return local;

      const resp = await fetch(`${environment.apiUrl}/auth/me`, {
        headers: {
          'x-auth-token': token,
        },
      });

      if (!resp.ok) return local;
      const data = await resp.json();
      const usuario = data?.usuario && typeof data.usuario === 'object' ? data.usuario : {};
      return { ...local, ...usuario };
    } catch {
      return local;
    }
  }

  private tieneDatosSignos(sv: any): boolean {
    if (!sv) return false;
    return (
      sv?.pesoKg != null ||
      sv?.tallaCm != null ||
      sv?.imc != null ||
      sv?.temperatura != null ||
      sv?.presionSis != null ||
      sv?.presionDia != null ||
      sv?.fc != null ||
      sv?.fr != null ||
      sv?.spo2 != null ||
      sv?.glucosaCapilar != null
    );
  }

  private construirResumenSignosVitales(sv: any): string[] {
    if (!sv) return [];

    const peso = this.toNullableNumber(sv?.pesoKg);
    const tallaCm = this.toNullableNumber(sv?.tallaCm);
    let imc = this.toNullableNumber(sv?.imc);

    if (imc == null && peso != null && tallaCm != null && tallaCm > 0) {
      const tallaM = tallaCm / 100;
      const calculado = tallaM > 0 ? (peso / (tallaM * tallaM)) : null;
      imc = (calculado != null && Number.isFinite(calculado)) ? Math.round(calculado * 10) / 10 : null;
    }

    const rows = [
      ['Peso', sv?.pesoKg != null ? `${sv.pesoKg} kg` : ''],
      ['Talla', sv?.tallaCm != null ? `${sv.tallaCm} cm` : ''],
      ['IMC', imc != null && Number.isFinite(imc) ? `${imc}` : ''],
      ['TA', this.fmtTA(sv) !== '?' ? this.fmtTA(sv) : ''],
      ['FC', sv?.fc != null ? `${sv.fc} lpm` : ''],
      ['FR', sv?.fr != null ? `${sv.fr} rpm` : ''],
      ['Temp', sv?.temperatura != null ? `${sv.temperatura} °C` : ''],
      ['SpO2', sv?.spo2 != null ? `${sv.spo2}%` : ''],
      ['Glucosa', sv?.glucosaCapilar != null ? `${sv.glucosaCapilar} mg/dL` : ''],
    ];

    return rows
      .filter(([, value]) => !!String(value || '').trim())
      .map(([label, value]) => `${label}: ${value}`);
  }

  private construirMedicamentosImpresion(medicamentos: any[] = []): RecetaPrintMedicamento[] {
    return (Array.isArray(medicamentos) ? medicamentos : [])
      .map((m) => {
        const nombreDirecto = String(m?.nombreLibre || m?.productoId?.nombre || '').trim();
        let nombre = this.repararMojibake(nombreDirecto);

        if (!nombre) {
          const productoId = typeof m?.productoId === 'object'
            ? String(m?.productoId?._id || '').trim()
            : String(m?.productoId || '').trim();

          if (productoId) {
            const medLocal = (this.receta?.medicamentos || []).find((med: MedicamentoUI) =>
              String(med?.productoId || '').trim() === productoId
            );
            nombre = this.repararMojibake(
              String(medLocal?.nombreLibre || medLocal?.q || '').trim()
            );
          }
        }

        const viaRaw = this.repararMojibake(String(m?.via || '').trim());
        const via = viaRaw === 'OTRA'
          ? `OTRA: ${this.repararMojibake(String(m?.viaOtra || '').trim())}`
          : viaRaw;

        return {
          nombre,
          dosis: this.repararMojibake(String(m?.dosis || '').trim()),
          via,
          frecuencia: this.repararMojibake(String(m?.frecuencia || '').trim()),
          duracion: this.repararMojibake(String(m?.duracion || '').trim()),
          categoria: this.repararMojibake(String(m?.categoria || m?.productoId?.categoria || '').trim()),
          indicaciones: this.repararMojibake(String(m?.indicaciones || '').trim()),
        };
      })
      .filter((m) => !!m.nombre);
  }

  private normalizarTextoCategoria(valor: any): string {
    return this.repararMojibake(String(valor || ''))
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private categoriaMedicamentoPermitida(categoriaNorm: any): boolean {
    const categoria = this.normalizarTextoCategoria(categoriaNorm);
    return (
      categoria === 'antibiotico' ||
      categoria === 'iv' ||
      categoria === 'vi' ||
      categoria.startsWith('vi ') ||
      categoria === 'suplementos' ||
      categoria.startsWith('suplementos')
    );
  }

  private recetaTieneAntibiotico(medicamentos: RecetaPrintMedicamento[] = []): boolean {
    return (medicamentos || []).some((medicamento) =>
      this.normalizarTextoCategoria(medicamento.categoria).includes('antibiotico')
    );
  }

  private formatearCitaSeguimiento(fecha: any): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX');
  }

  private enumerarDiagnosticos(diagnosticos: string[] = []): string {
    const lista = (Array.isArray(diagnosticos) ? diagnosticos : [])
      .map((diagnostico) => String(diagnostico || '').trim())
      .filter(Boolean);

    if (!lista.length) return '—';
    return lista.map((diagnostico, index) => `${index + 1}. ${diagnostico}`).join(' · ');
  }

  private construirFilasMedicamentosImpresion(medicamentos: RecetaPrintMedicamento[] = []): string {
    if (!medicamentos.length) {
      return `<div class="med-empty">— Sin medicamentos —</div>`;
    }

    const items = medicamentos.map((m, index) => {
      const tiempoTratamiento = [
        String(m.frecuencia || '').trim(),
        m.duracion ? `por ${String(m.duracion).trim()}` : '',
      ].filter(Boolean).join(' ');

      return `
        <article class="med-item">
          <div class="med-head">
            <span class="med-num">${index + 1}.</span>
            <span class="med-name">${this.esc(m.nombre || '—')}</span>
          </div>
          <div class="med-detail">
            <b>Dosis:</b> ${this.esc(m.dosis || '—')}, <b>Vía:</b> ${this.esc(m.via || '—')}, ${this.esc(tiempoTratamiento || '—')}
          </div>
          ${m.indicaciones ? `<div class="med-ind"><b>Indicaciones:</b> ${this.esc(m.indicaciones)}</div>` : ``}
        </article>
      `;
    }).join('');

    return `<div class="med-list">${items}</div>`;
  }

  private construirHtmlCopiaReceta(data: RecetaPrintData): string {
    const diagnostico = this.enumerarDiagnosticos(data.diagnosticos || []);
    const recomendaciones = String(data.recomendaciones || '').trim();
    const signosVitales = Array.isArray(data.signosVitales) ? data.signosVitales.filter(Boolean) : [];
    const alergias = String(data.alergias || '').trim() || 'No referidas';
    const footerDerecha = [
      String(data.direccion || '').trim(),
      data.telefono ? `Tel: ${String(data.telefono).trim()}` : '',
    ].filter(Boolean).join(' · ');
    const tituloYCedula = `${data.medicoTitulo ? this.esc(data.medicoTitulo) : '—'} · Céd. Prof.: ${this.esc(data.cedula || '—')}`;
    const citaSeguimiento = String(data.citaSeguimiento || '').trim();
    const tieneCitaSeguimiento = !!citaSeguimiento;
    const logoEscuelaUrl = String(data.logoEscuelaUrl || '').trim();
    const logoEscuelaHtml = logoEscuelaUrl
      ? `
        <div class="doctor-logo-wrap">
          <img src="${this.esc(logoEscuelaUrl)}" alt="Logo escuela" onerror="this.style.display='none';" />
        </div>
      `
      : '';

    const signosHtml = signosVitales.length
      ? signosVitales.map((signo) => `<span class="sv-pill">${this.esc(signo)}</span>`).join('')
      : `<span class="sv-pill">Sin registro</span>`;

    return `
      <section class="rx-page">
        <table class="rx-table">
          <thead>
            <tr>
              <th>
                <div class="doctor-head ${logoEscuelaHtml ? 'with-logo' : ''}">
                  ${logoEscuelaHtml}
                  <div class="doctor-name">${this.esc(data.medicoNombre || '—')}</div>
                  <div class="doctor-line">${tituloYCedula}</div>
                  <div class="doctor-line">${this.esc(data.medicoEscuela || '—')}</div>
                </div>

                <div class="top-line">
                  <span>${tieneCitaSeguimiento ? `<b>Cita seguimiento:</b> ${this.esc(citaSeguimiento)}` : ''}</span>
                  <span><b>Fecha:</b> ${this.esc(data.fecha || '—')}</span>
                </div>

                <div class="divider"></div>

                <div class="top-line">
                  <span><b>Paciente:</b> ${this.esc(data.pacienteNombre || '—')}</span>
                  <span><b>Edad:</b> ${this.esc(data.edad || '—')}</span>
                </div>

                <div class="dx-line">
                  <b>Diagnóstico:</b> ${this.esc(diagnostico)}
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            <tr class="body-row">
              <td>
                <div class="content-stack">
                  <div class="compact-grid">
                    <div class="sv-block">
                      <div class="compact-label">Signos vitales</div>
                      <div class="sv-grid">${signosHtml}</div>
                    </div>
                    <div class="alergias-block">
                      <div class="compact-label">Alergias</div>
                      <div class="alergias-value">${this.esc(alergias)}</div>
                    </div>
                  </div>

                  <section class="med-section">
                    <div class="section-title">Medicamentos</div>
                    ${this.construirFilasMedicamentosImpresion(data.medicamentos)}
                  </section>

                  ${recomendaciones ? `
                    <section class="notes-section">
                      <div class="section-title">Indicaciones generales</div>
                      <div class="notes-body">${this.esc(recomendaciones)}</div>
                    </section>
                  ` : ``}
                </div>
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr class="footer-row">
              <td>
                <div class="signature-block">
                  <div class="signature-line"></div>
                  <div class="signature-name">${this.esc(data.medicoNombre || '—')}</div>
                </div>
                <div class="footer-divider"></div>
                <div class="footer">${footerDerecha ? this.esc(footerDerecha) : '&nbsp;'}</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    `;
  }

  private construirHtmlImpresionReceta(data: RecetaPrintData, copias = 1): string {
    const totalCopias = Math.max(1, Math.trunc(copias));
    const paginas = Array.from({ length: totalCopias }, () => this.construirHtmlCopiaReceta(data)).join('');

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receta</title>
  <style>
    @page { size: 5.5in 8.5in; margin: 4mm; }

    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      font-family: Arial, sans-serif;
      color: #111;
      background: #fff;
    }

    body {
      box-sizing: border-box;
    }

    .rx-page {
      width: 100%;
      min-height: calc(8.5in - 8mm);
      box-sizing: border-box;
      page-break-after: always;
      break-after: page;
      padding: 0;
    }

    .rx-page:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }

    .rx-table {
      width: 100%;
      height: calc(8.5in - 8mm);
      border-collapse: collapse;
      border: 1px solid #dedede;
      border-radius: 2mm;
      overflow: hidden;
      table-layout: fixed;
    }

    .rx-table thead {
      display: table-header-group;
    }

    .rx-table tfoot {
      display: table-footer-group;
    }

    .rx-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .rx-table th,
    .rx-table td {
      text-align: left;
      vertical-align: top;
      padding: 0;
      font-weight: normal;
    }

    .doctor-head {
      position: relative;
    }

    .doctor-head.with-logo {
      padding-right: 22mm;
      min-height: 16mm;
    }

    .doctor-head.with-logo + .top-line {
      padding-right: 22mm;
    }

    .doctor-logo-wrap {
      position: absolute;
      right: 0;
      top: 0.5mm;
      width: 16mm;
      height: 16mm;
      max-width: 16mm;
      max-height: 16mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .doctor-logo-wrap img,
    .doctor-logo {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }

    .doctor-name {
      text-align: center;
      font-size: 11pt;
      font-weight: 800;
      line-height: 1.2;
      margin-top: 2mm;
    }

    .doctor-line {
      text-align: center;
      font-size: 8pt;
      margin-top: .8mm;
      color: #2f2f2f;
      line-height: 1.25;
    }

    .top-line {
      margin-top: 1.4mm;
      display: flex;
      justify-content: space-between;
      gap: 6mm;
      font-size: 8pt;
      line-height: 1.2;
    }

    .divider {
      border-top: 1px solid #8f8f8f;
      margin: 1.4mm 0;
    }

    .dx-line {
      margin-top: 1mm;
      font-size: 8pt;
      line-height: 1.25;
    }

    .rx-table thead th {
      padding: 0 3.2mm 1.8mm;
    }

    .rx-table tbody td {
      padding: 0 3.2mm;
    }

    .rx-table tfoot td {
      padding: 0 3.2mm 2.2mm;
      vertical-align: bottom;
    }

    .body-row td {
      padding-top: .8mm;
      padding-bottom: .6mm;
    }

    .content-stack {
      display: flex;
      flex-direction: column;
      gap: 1.4mm;
    }

    .compact-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: 1.6mm 2.6mm;
      padding: 0;
      border: none;
      outline: none;
      box-shadow: none;
      border-radius: 0;
      background: transparent;
    }

    .sv-block,
    .alergias-block {
      border: 1px solid #e1e1e1;
      border-radius: 1.5mm;
      padding: .9mm 1.1mm;
      background: #fff;
    }

    .compact-label {
      font-size: 7.1pt;
      font-weight: 800;
      margin-bottom: .6mm;
      color: #222;
      letter-spacing: .02em;
    }

    .sv-grid {
      display: flex;
      flex-wrap: wrap;
      gap: .8mm;
    }

    .sv-pill {
      display: inline-flex;
      align-items: center;
      border: 1px solid #d8d8d8;
      border-radius: 999px;
      padding: .35mm 1.1mm;
      font-size: 7pt;
      line-height: 1.2;
      background: #fff;
      color: #222;
      white-space: nowrap;
    }

    .alergias-value {
      font-size: 7.2pt;
      line-height: 1.2;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 3.8mm;
    }

    .med-section,
    .notes-section {
      display: flex;
      flex-direction: column;
      gap: .9mm;
    }

    .section-title {
      font-size: 8pt;
      font-weight: 800;
      color: #111;
    }

    .med-list {
      display: flex;
      flex-direction: column;
      gap: .9mm;
    }

    .med-empty {
      border: 1px dashed #cfcfcf;
      border-radius: 2mm;
      padding: 1.9mm 1.6mm;
      text-align: center;
      font-size: 7.4pt;
      color: #666;
    }

    .med-item {
      border: 1px solid #e6e6e6;
      border-radius: 2mm;
      padding: 1.2mm 1.6mm;
      background: #fff;
    }

    .med-head {
      display: flex;
      gap: 1.1mm;
      align-items: flex-start;
      font-size: 8pt;
      line-height: 1.2;
    }

    .med-num {
      min-width: 4mm;
      color: #b7307f;
      font-weight: 800;
    }

    .med-name {
      font-weight: 800;
      word-break: break-word;
    }

    .med-detail {
      margin-top: .7mm;
      font-size: 7.1pt;
      line-height: 1.22;
      word-break: break-word;
    }

    .med-ind {
      margin-top: .6mm;
      font-size: 7.1pt;
      line-height: 1.25;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .notes-body {
      border: 1px solid #e6e6e6;
      border-radius: 2mm;
      min-height: 4.8mm;
      padding: 1mm 1.4mm;
      font-size: 7.2pt;
      line-height: 1.25;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .footer-row td {
      padding-top: 2.2mm;
    }

    .signature-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.1mm;
    }

    .signature-line {
      width: 62mm;
      border-top: 1px solid #444;
      height: 0;
    }

    .signature-name {
      font-size: 8pt;
      font-weight: 700;
      text-align: center;
      word-break: break-word;
    }

    .footer-divider {
      border-top: 1px solid #8f8f8f;
      margin-top: 1.8mm;
      padding-top: 1.1mm;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 2mm;
      font-size: 7pt;
      color: #555;
      line-height: 1.25;
      text-align: right;
      min-height: 3.5mm;
    }

    @media screen {
      body {
        background: #f4f4f4;
        padding: 8px;
      }

      .rx-page {
        max-width: 5.5in;
        min-height: 8.5in;
        margin: 0 auto 10px;
      }
    }

    @media print {
      body {
        background: #fff;
      }

      .rx-page {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  ${paginas}

  <script>
    window.onload = () => setTimeout(() => window.print(), 180);
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`;
  }

  nuevoMedicamento(): MedicamentoUI {
    return {
      // Requerido por flujo.
      modo: 'CATALOGO',

      // buscador
      q: '',
      resultados: [],
      buscando: false,
      sinCoincidencias: false,

      // catálogo / libre
      productoId: null,
      nombreLibre: '',
      ingreActivo: '',
      codigoBarras: '',

      // receta
      dosis: '',
      via: 'ORAL',
      viaOtra: '',
      frecuencia: '',
      duracion: '',
      cantidad: null,
      indicaciones: '',
      esControlado: false,
    };
  }


  agregarMedicamento() {
    this.receta.medicamentos.push(this.nuevoMedicamento());
  }

  quitarMedicamento(i: number) {
    this.receta.medicamentos.splice(i, 1);
  }

  private parseDiagnosticos(texto: string): string[] {
    return String(texto || '')
      .split(/\r?\n|,/g)
      .map(x => x.trim())
      .filter(Boolean);
  }

  private getMedicamentoTextoCapturado(m: MedicamentoUI): string {
    const q = String(m?.q || '').trim();
    const nombreLibre = String(m?.nombreLibre || '').trim();
    return q || nombreLibre;
  }

  private buildPayloadReceta() {
    const medicamentosOk = (this.receta.medicamentos || [])
      .map(m => {
        const esCat = m.modo === 'CATALOGO' && !!m.productoId;
        const esOtro = m.modo === 'OTRO';

        const productoId = esCat ? m.productoId : undefined;
        const nombreLibre = esOtro
          ? String(m.nombreLibre || '').trim()
          : (!productoId ? this.getMedicamentoTextoCapturado(m) : undefined);

        const via = (m.via || '').trim();
        const viaOtra = via === 'OTRA' ? (m.viaOtra || '').trim() : undefined;

        const cantidadRaw = (m as any).cantidad;
        const cantidad =
          cantidadRaw == null || cantidadRaw === ''
            ? undefined
            : (() => {
              const n = Number(cantidadRaw);
              return Number.isFinite(n) ? n : undefined;
            })();

        return {
          productoId,
          nombreLibre,
          dosis: (m.dosis || '').trim(),
          via,
          viaOtra,
          frecuencia: (m.frecuencia || '').trim(),
          duracion: (m.duracion || '').trim(),
          cantidad: Number.isFinite(cantidad as any) ? cantidad : undefined,
          indicaciones: (m.indicaciones || '').trim(),
          esControlado: !!m.esControlado,
        };
      })
      .filter(m =>
        (!!m.productoId || !!m.nombreLibre) &&
        !!m.via &&
        (m.via !== 'OTRA' || !!m.viaOtra)
      );

    const diagnosticos = this.parseDiagnosticos(this.receta.diagnosticosTexto);

    return {
      recetaId: this.recetaPendienteImpresionId || undefined,
      fichaConsultorioId: this.fichaActualId || undefined,
      pacienteId: this.fichaActual?.pacienteId || undefined,
      diagnosticos,
      alergias: this.obtenerAlergiasConsultaActual(),
      medicamentos: medicamentosOk,
      indicacionesGenerales: (this.receta.indicacionesGenerales || '').trim(),
      citaSeguimiento: this.receta.citaSeguimiento
        ? new Date(`${this.receta.citaSeguimiento}T12:00:00`)
        : null,
    };
  }

  async generarReceta() {
    if (!this.fichaActual?.pacienteId) {
      Swal.fire('Falta paciente', 'Primero vincula un paciente para poder generar receta.', 'warning');
      return;
    }

    const payload = this.buildPayloadReceta();

    if (!payload.diagnosticos.length) {
      Swal.fire('Faltan diagnósticos', 'Captura al menos un diagnóstico (uno por línea o separado por coma).', 'warning');
      return;
    }

    if (!payload.medicamentos.length) {
      Swal.fire('Faltan medicamentos', 'Agrega al menos un medicamento.', 'warning');
      return;
    }

    const tieneOtroSinNombre = (payload.medicamentos || []).some((m: any) =>
      !m.productoId && !(m.nombreLibre || '').trim()
    );
    if (tieneOtroSinNombre) {
      Swal.fire('Falta medicamento', 'Hay un medicamento en "OTRO" sin nombre.', 'warning');
      return;
    }

    const r = await Swal.fire({
      icon: 'question',
      title: '¿Guardar receta en expediente?',
      text: 'La receta quedará disponible en el historial del paciente.',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'No',
      allowOutsideClick: false,
      reverseButtons: true,
    });

    if (!r.isConfirmed) return;

    this.generandoReceta = true;
    try {
      const resp: any = await firstValueFrom(this.recetasService.crear(payload));
      this.recetaPendienteImpresionId = resp?.receta?._id ? String(resp.receta._id) : null;
      this.setRecetaActivaDeFicha(this.fichaActual?._id, this.recetaPendienteImpresionId);

      await this.cargarExpedienteSiHayPaciente();

      this.rxExpandida = false;

      const msg = resp?.actualizado
        ? 'Receta actualizada correctamente en el expediente.'
        : 'Receta guardada correctamente en el expediente.';
      Swal.fire({
        title: 'Listo',
        text: msg,
        icon: 'success',
        timer: 1300
      });
    } catch (e: any) {
      console.error(e);
      Swal.fire({
        title: 'Error',
        text: e?.error?.msg || 'No se pudo generar receta',
        icon: 'error',
        timer: 1300
      });
    } finally {
      this.generandoReceta = false;
    }
  }

  buscandoMedIdx: number | null = null;
  private medSearchTimer: any = null;

  onFocusMedicamento(i: number) {
    this.buscandoMedIdx = i;
    setTimeout(() => { }, 0);
  }

  ocultarResultados(i: number) {
    // pequeño delay para que el click en resultado alcance a disparar
    setTimeout(() => {
      const m = this.receta.medicamentos[i];
      if (m) {
        m.resultados = [];
        m.buscando = false;
      }
      if (this.buscandoMedIdx === i) this.buscandoMedIdx = null;
    }, 150);
  }

  async buscarMedicamentos(i: number) {
    const m = this.receta.medicamentos[i];
    if (!m || m.modo !== 'CATALOGO') return;

    const q = (m.q || '').trim();
    const nombreSeleccionado = String(m.nombreLibre || '').trim();

    if (!!m.productoId && q !== nombreSeleccionado) {
      m.productoId = null;
      m.nombreLibre = '';
      m.ingreActivo = '';
      m.codigoBarras = '';
      m.sinCoincidencias = false;
    }

    if (q.length < 2) {
      m.resultados = [];
      m.buscando = false;
      m.sinCoincidencias = false;
      return;
    }

    // debounce
    clearTimeout(this.medSearchTimer);
    this.medSearchTimer = setTimeout(async () => {
      const queryAtRequest = (m.q || '').trim();
      m.buscando = true;
      m.sinCoincidencias = false;
      try {
        const resp = await firstValueFrom(this.productosService.buscarMedicamentosReceta(queryAtRequest, 100));
        const resultadosRaw = Array.isArray(resp?.productos) ? resp.productos : [];
        const resultados = resultadosRaw.filter((producto: any) =>
          this.categoriaMedicamentoPermitida(producto?.categoriaNorm)
        );
        if ((m.q || '').trim() !== queryAtRequest) return;
        m.resultados = resultados;
        m.sinCoincidencias = queryAtRequest.length >= 2 && resultados.length === 0;
      } catch (e) {
        console.error(e);
        m.resultados = [];
        m.sinCoincidencias = queryAtRequest.length >= 2;
      } finally {
        m.buscando = false;
      }
    }, 250);
  }

  seleccionarMedicamento(i: number, p: any) {
    const m = this.receta.medicamentos[i];
    if (!m) return;

    const nombreSeleccionado = String(p?.nombre || p?.ingreActivo || '').trim();

    m.productoId = p?._id || null;
    m.nombreLibre = nombreSeleccionado;
    m.ingreActivo = p?.ingreActivo || '';
    m.codigoBarras = p?.codigoBarras || '';
    m.q = nombreSeleccionado;
    m.resultados = [];
    m.buscando = false;
    m.sinCoincidencias = false;
  }

  usarOtro(i: number) {
    const m = this.receta.medicamentos[i];
    if (!m) return;
    m.modo = 'OTRO';
    m.productoId = null;
    m.q = '';
    m.resultados = [];
    m.buscando = false;
    m.sinCoincidencias = false;
    m.ingreActivo = '';
    m.codigoBarras = '';
  }

  usarCatalogo(i: number) {
    const m = this.receta.medicamentos[i];
    if (!m) return;
    m.modo = 'CATALOGO';
    m.nombreLibre = '';
    m.productoId = null;
    m.ingreActivo = '';
    m.codigoBarras = '';
    m.q = '';
    m.resultados = [];
    m.buscando = false;
    m.sinCoincidencias = false;
  }

  recalcularIMC() {
    const peso = Number(this.signos.pesoKg ?? 0);
    const tallaCm = Number(this.signos.tallaCm ?? 0);
    if (!peso || !tallaCm) {
      this.signos.imc = null;
      return;
    }
    const tallaM = tallaCm / 100;
    const imc = peso / (tallaM * tallaM);
    this.signos.imc = Number.isFinite(imc) ? Math.round(imc * 10) / 10 : null;
  }

  limpiarSignos() {
    this.signos = {
      pesoKg: null, tallaCm: null, imc: null,
      temperatura: null,
      presionSis: null, presionDia: null,
      fc: null, fr: null, spo2: null, glucosaCapilar: null,
    };
  }

  async guardarSignosVitales() {
    if (!this.fichaActual?._id) return;

    const pacienteId = this.fichaActual?.pacienteId;

    // validación mínima útil (no obligamos todo)
    const hayAlgo =
      this.signos.pesoKg != null ||
      this.signos.tallaCm != null ||
      this.signos.temperatura != null ||
      this.signos.presionSis != null ||
      this.signos.presionDia != null ||
      this.signos.fc != null ||
      this.signos.fr != null ||
      this.signos.spo2 != null ||
      this.signos.glucosaCapilar != null;

    if (!hayAlgo) {
      /* Swal.fire('Sin datos', 'Captura al menos un signo vital.', 'warning'); */
      Swal.fire({
        title: 'Sin datos',
        text: 'Captura al menos un signo vital.',
        icon: 'warning',
        timer: 1300,
      });
      return;
    }

    const r = await Swal.fire({
      icon: 'question',
      title: '¿Guardar signos vitales?',
      text: pacienteId
        ? 'Se guardarán en la ficha actual del paciente (si ya existen, se actualizarán).'
        : 'Se guardarán en la ficha actual del paciente de paso.',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
    });

    if (!r.isConfirmed) return;

    this.guardandoSignos = true;
    try {
      this.recalcularIMC();
      const payload = this.payloadSignosDesdeFormulario();

      if (pacienteId) {
        const respSignos: any = await firstValueFrom(this.pacientesService.guardarSignosVitales(pacienteId, payload));
        this.removeSignosPasoDeFicha(this.fichaActual?._id);

        /* Swal.fire(
          'Listo',
          respSignos?.actualizado ? 'Signos vitales actualizados en esta ficha.' : 'Signos vitales guardados.',
          'success'
        ); */

        Swal.fire({
          title: 'Listo',
          text: respSignos?.actualizado ? 'Signos vitales actualizados en esta ficha.' : 'Signos vitales guardados.',
          icon: 'success',
          timer: 1300,
        });

        await this.cargarExpedienteSiHayPaciente();
        this.expedienteTab = 'SV';
        setTimeout(() => {
          document.getElementById('expediente')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      } else {
        this.setSignosPasoDeFicha(this.fichaActual?._id, payload);
        /* Swal.fire('Listo', 'Signos vitales guardados para esta consulta.', 'success'); */
        Swal.fire({
          title: 'Listo',
          text: 'Signos vitales guardados para esta consulta.',
          icon: 'success',
          timer: 1300,
        });
      }

      this.colapsarColaSiHayAtencion?.();
      this.svExpandida = false;
    } catch (e: any) {
      console.error(e);
      /* Swal.fire('Error', e?.error?.msg || 'No se pudieron guardar los signos vitales', 'error'); */
      Swal.fire({
        title: 'Error',
        text: e?.error?.msg || 'No se pudieron guardar los signos vitales',
        icon: 'error',
        timer: 1300,
      });
    } finally {
      this.guardandoSignos = false;
    }
  }

  private abrirSeccionesAtencion() {
    this.expExpandida = true;
    this.expedienteTab = 'PAC';
    this.svExpandida = false;
    this.rxExpandida = false;
    this.servExpandida = false;
    this.ncExpandida = false;
  }

  private prepararVentanaImpresion(): Window | null {
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return null;

    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Preparando impresión</title></head><body style="font-family:Arial,sans-serif;padding:24px;">Preparando receta para impresión…</body></html>`);
    w.document.close();
    return w;
  }

  private renderizarHtmlImpresion(html: string, targetWindow?: Window | null) {
    const w = targetWindow && !targetWindow.closed
      ? targetWindow
      : window.open('', '_blank', 'width=900,height=1200');

    if (!w) throw new Error('No se pudo abrir ventana de impresión (popup bloqueado)');

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async imprimirReceta(
    recetaId: string,
    targetWindow?: Window | null,
    options: { forzarUnaCopia?: boolean; signosVitalesPreferidos?: any; alergiasPreferidas?: string } = {}
  ) {
    const resp = await firstValueFrom(this.recetasService.obtenerPorId(recetaId));
    const rx = resp?.receta;
    const extra = resp?.extraPaciente || {};
    if (!rx) throw new Error('No llegó la receta');

    const farm = rx.farmaciaId || {};
    const pac = rx.pacienteId || {};
    const med = rx.medicoId || {};

    const alergiasPreferidas = String(options.alergiasPreferidas || '').trim();
    const alergiasReceta = Array.isArray(rx?.alergias)
      ? rx.alergias.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];
    const alergiasExtra = Array.isArray(extra?.alergias)
      ? extra.alergias.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];

    const signosPreferidos = options?.signosVitalesPreferidos || null;
    const signosFuente = this.tieneDatosSignos(signosPreferidos)
      ? signosPreferidos
      : (extra?.ultimoSV || null);

    const data: RecetaPrintData = {
      medicoNombre: this.obtenerNombreMedicoImpresion(med),
      medicoTitulo: this.obtenerTituloMedicoImpresion(med),
      medicoEscuela: this.obtenerEscuelaMedicoImpresion(med),
      logoEscuelaUrl:
        this.obtenerLogoEscuelaMedicoImpresion(med) ||
        this.obtenerLogoEscuelaMedicoImpresion(this.obtenerUsuarioMedicoLocal()),
      cedula: this.obtenerCedulaMedicoImpresion(med),
      pacienteNombre: `${pac.nombre || ''} ${pac.apPaterno || ''} ${pac.apMaterno || ''}`.trim() || '?',
      fecha: new Date(rx.fecha || Date.now()).toLocaleDateString('es-MX'),
      citaSeguimiento: this.formatearCitaSeguimiento(rx.citaSeguimiento),
      diagnosticos: Array.isArray(rx.diagnosticos) ? rx.diagnosticos : [],
      edad: this.calcEdad(pac),
      alergias: alergiasPreferidas ||
        (alergiasReceta.length ? alergiasReceta.join(', ') : '') ||
        (alergiasExtra.length ? alergiasExtra.join(', ') : '') ||
        this.obtenerAlergiasConsultaActualTexto(),
      signosVitales: this.construirResumenSignosVitales(signosFuente),
      recomendaciones: (rx.indicacionesGenerales || '').trim() || (rx.observaciones || '').trim(),
      direccion: String(farm?.direccion || '').trim(),
      telefono: String(farm?.telefono || '').trim(),
      medicamentos: this.construirMedicamentosImpresion(rx.medicamentos || []),
    };

    const copias = options.forzarUnaCopia
      ? 1
      : (this.recetaTieneAntibiotico(data.medicamentos) ? 2 : 1);

    const html = this.construirHtmlImpresionReceta(data, copias);
    this.renderizarHtmlImpresion(html, targetWindow);
  }

  async imprimirRecetaPaso(
    receta: any,
    targetWindow?: Window | null,
    options: { alergias?: string; forzarUnaCopia?: boolean } = {}
  ) {
    const rx = receta || {};
    const farmRaw = localStorage.getItem('user_farmacia');
    const farm = farmRaw ? JSON.parse(farmRaw) : {};
    const medico = await this.obtenerUsuarioMedicoParaImpresion();
    const alergias = String(options.alergias || '').trim() || this.obtenerAlergiasConsultaActualTexto();
    const signos = this.construirSignosDesdeCapturaActual();
    const signosFinales = signos.length
      ? signos
      : this.construirResumenSignosVitales(this.obtenerSignosDeFichaActualEnExpediente() || this.expediente?.signosVitalesRecientes?.[0]);

    const data: RecetaPrintData = {
      medicoNombre: this.obtenerNombreMedicoImpresion(medico),
      medicoTitulo: this.obtenerTituloMedicoImpresion(medico),
      medicoEscuela: this.obtenerEscuelaMedicoImpresion(medico),
      logoEscuelaUrl: this.obtenerLogoEscuelaMedicoImpresion(medico),
      cedula: this.obtenerCedulaMedicoImpresion(medico),
      pacienteNombre: String(this.fichaActual?.pacienteNombre || 'Paciente de paso').trim(),
      fecha: new Date().toLocaleDateString('es-MX'),
      citaSeguimiento: this.formatearCitaSeguimiento(rx.citaSeguimiento),
      diagnosticos: Array.isArray(rx.diagnosticos) ? rx.diagnosticos : [],
      edad: this.calcEdad(this.paciente),
      alergias,
      signosVitales: signosFinales,
      recomendaciones: (rx.indicacionesGenerales || '').trim() || (rx.observaciones || '').trim(),
      direccion: String(farm?.direccion || '').trim(),
      telefono: String(farm?.telefono || '').trim(),
      medicamentos: this.construirMedicamentosImpresion(rx.medicamentos || []),
    };

    const copias = options.forzarUnaCopia
      ? 1
      : (this.recetaTieneAntibiotico(data.medicamentos) ? 2 : 1);
    const html = this.construirHtmlImpresionReceta(data, copias);
    this.renderizarHtmlImpresion(html, targetWindow);
  }

  private repararMojibake(valor: any): string {
    const original = String(valor ?? '');
    if (!original) return '';

    const indicadorMojibake = /\u00C3|\u00C2|\u00E2[\u0080-\u00BF]/;
    if (!indicadorMojibake.test(original)) {
      return original;
    }

    try {
      const bytes = Uint8Array.from([...original].map((char) => char.charCodeAt(0) & 0xff));
      const reparado = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return reparado || original;
    } catch {
      return original;
    }
  }

  private esc(v: any) {
    return this.repararMojibake(String(v ?? ''))
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  limpiarCitaSeguimientoReceta() {
    this.receta.citaSeguimiento = '';
  }


  private resetAtencionUI() {
    this.recetaPendienteImpresionId = null;
    this.servicios = [this.nuevoRenglonServicio()];

    this.antForm = {
      alergiasTxt: '',
      enfermedadesCronicasTxt: '',
      medicamentosActualesTxt: '',
      cirugiasPreviasTxt: '',
      antecedentesFamiliaresTxt: '',
      tabaquismo: 'No',
      alcohol: 'No',
    };

    this.limpiarSignos();
    this.resetNotaClinicaForm();
    this.resetBusquedaPaciente();
    this.resetPacForm();

    this.receta = {
      diagnosticosTexto: '',
      indicacionesGenerales: '',
      citaSeguimiento: '',
      medicamentos: [this.nuevoMedicamento()],
    };

    this.paciente = null;
    this.expediente = null;
    this.expedienteTab = 'PAC';
    this.capturaSignosDisponible = true;

    if (this.fichaActual) {
      this.prefillPacienteFormDesdeFicha(true);
    }

    this.abrirSeccionesAtencion();
    this.buscandoMedIdx = null;
  }

  async verReceta(recetaId: string) {
    this.recetaVista = null;
    this.cargandoReceta = true;

    try {
      const resp = await firstValueFrom(this.recetasService.obtenerPorId(recetaId));
      this.recetaVista = resp?.receta ?? null;

      const el = document.getElementById('modalVerReceta');
      if (el) new bootstrap.Modal(el, { backdrop: 'static' }).show();

    } catch (e: any) {
      console.error(e);
      /* Swal.fire('Error', e?.error?.msg || 'No se pudo cargar la receta', 'error'); */
      Swal.fire({
        title: 'Error', 
        text: e?.error?.msg || 'No se pudo cargar la receta',
        icon: 'error',
        timer: 1300,
      });
    } finally {
      this.cargandoReceta = false;
    }
  }

  async verMiTrabajo() {
    const el = document.getElementById('modalMiTrabajo');
    if (el) new bootstrap.Modal(el, { backdrop: 'static' }).show();

    this.cargandoMiTrabajo = true;
    this.miTrabajoFilas = [];
    this.miTrabajoTurnoFecha = '';

    try {
      const resp = await firstValueFrom(this.fichasService.obtenerMiTrabajoTurnoActual());
      const filasRaw = Array.isArray(resp?.filas) ? resp.filas : [];

      this.miTrabajoFilas = filasRaw
        .map((fila: any) => this.normalizarFilaMiTrabajo(fila))
        .filter((fila: MiTrabajoFila | null): fila is MiTrabajoFila => !!fila);

      this.miTrabajoTurnoFecha = String(resp?.turnoFecha || '').trim();
    } catch (e: any) {
      console.error(e);
      /* Swal.fire('Error', e?.error?.msg || 'No se pudo cargar el resumen de servicios del turno actual.', 'error'); */
      Swal.fire({
        title: 'Error',
        text: e?.error?.msg || 'No se pudo cargar el resumen de servicios del turno actual.',
        icon: 'error',
        timer: 1300,
      });
    } finally {
      this.cargandoMiTrabajo = false;
    }
  }

  imprimirMiTrabajo() {
    const medicoNombre = this.obtenerNombreMedicoImpresion(this.obtenerUsuarioMedicoLocal()) || 'Médico';
    const fechaTexto = this.formatearFechaMiTrabajo(this.miTrabajoTurnoFecha);
    const filas = Array.isArray(this.miTrabajoFilas) ? this.miTrabajoFilas : [];

    const filasHtml = filas.length
      ? filas
        .map((fila) => `
          <tr>
            <td>${this.esc(fila.ficha)}</td>
            <td>${this.esc(fila.pacienteNombre || '—')}</td>
            <td>${this.esc(fila.nombre)}</td>
            <td style="text-align: right;">${this.esc(fila.cantidad)}</td>
          </tr>
        `)
        .join('')
      : `
        <tr>
          <td colspan="4" class="empty">No hay servicios médicos registrados en tu turno actual.</td>
        </tr>
      `;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Servicios realizados</title>
  <style>
    @page { size: letter portrait; margin: 0; }
    body {
      margin: 12mm;
      font-family: Arial, sans-serif;
      color: #111;
      font-size: 12px;
      line-height: 1.35;
    }
    .sheet {
      width: 100%;
      box-sizing: border-box;
    }
    .header {
      margin-bottom: 10px;
    }
    .doctor {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .date {
      margin-bottom: 6px;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      border: 1px solid #777;
      padding: 6px 8px;
      vertical-align: top;
    }
    th {
      background: #f5f5f5;
      text-align: left;
    }
    .empty {
      text-align: center;
      color: #555;
      padding: 14px 8px;
    }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="header">
      <div class="doctor">${this.esc(medicoNombre)}</div>
      <div class="date"><b>Fecha:</b> ${this.esc(fechaTexto)}</div>
      <div class="title">Servicios realizados</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 16%;">Ficha</th>
          <th style="width: 24%;">Paciente</th>
          <th>Nombre</th>
          <th style="width: 14%; text-align: right;">Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${filasHtml}
      </tbody>
    </table>
  </main>

  <script>
    window.onload = () => setTimeout(() => window.print(), 120);
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) {
      Swal.fire('Atención', 'No se pudo abrir la ventana de impresión. Revisa el bloqueador de ventanas emergentes.', 'warning');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  private normalizarFilaMiTrabajo(fila: any): MiTrabajoFila | null {
    const ficha = String(
      fila?.ficha ||
      formatearTurnoConsultorioVisual(fila?.turnoFecha, fila?.turnoConsecutivo) ||
      ''
    ).trim();

    const nombre = this.repararMojibake(String(fila?.nombre || '').trim());
    const pacienteNombre =
      this.repararMojibake(String(fila?.pacienteNombre || '').trim()) || '—';
    const cantidadNum = Number(fila?.cantidad ?? 0);
    const cantidad = Number.isFinite(cantidadNum) ? Math.trunc(cantidadNum) : 0;

    if (!ficha || !nombre || cantidad <= 0) return null;

    return {
      ficha,
      pacienteNombre,
      nombre,
      cantidad,
      fichaId: String(fila?.fichaId || '').trim() || undefined,
    };
  }

  formatearFechaMiTrabajo(turnoFecha: string): string {
    const iso = String(turnoFecha || '').trim();
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return new Date().toLocaleDateString('es-MX');
  }

  private calcEdad(pac: any): string {
    const parts = this.getDateParts(pac?.datosGenerales?.fechaNacimiento);
    if (!parts) return '?';

    const hoy = new Date();
    let meses = ((hoy.getFullYear() - parts.year) * 12) + ((hoy.getMonth() + 1) - parts.month);

    if (hoy.getDate() < parts.day) {
      meses--;
    }

    if (meses < 0) return '?';

    if (meses < 12) {
      return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    }

    const anios = Math.floor(meses / 12);
    return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  }


  debeAbrirArriba(i: number): boolean {
    // Solo cuando ese índice está activo.
    if (this.buscandoMedIdx !== i) return false;

    const el = document.getElementById(`med-input-${i}`);
    if (!el) return false;

    const r = el.getBoundingClientRect();
    const espacioAbajo = Math.max(0, window.innerHeight - r.bottom);
    const espacioArriba = Math.max(0, r.top);

    // Solo abrir hacia arriba si realmente no cabe abajo y arriba sí hay mejor espacio.
    const altoPanelObjetivo = 320;
    const margen = 24;

    const noCabeAbajo = espacioAbajo < (altoPanelObjetivo - 40);
    const cabeArriba = espacioArriba >= (altoPanelObjetivo - 80);
    const arribaEsMejor = espacioArriba > espacioAbajo + margen;

    return noCabeAbajo && cabeArriba && arribaEsMejor;
  }


}


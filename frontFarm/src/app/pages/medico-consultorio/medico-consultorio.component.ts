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

type ServicioMedico = { _id: string; nombre: string; precioVenta?: number };

type ServicioUI = {
  productoId: string;
  cantidad: number;
  notas?: string;

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

declare const bootstrap: any;
@Component({
  selector: 'app-medico-consultorio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './medico-consultorio.component.html',
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

  // edición
  notasMedico = '';
  motivoEditable = '';
  servicios: ServicioUI[] = [];

  guardando = false;

  private timers = new Map<number, any>();

  private tick: any;
  colaExpandida = true;
  // colapsables (ATENCIÓN)
  svExpandida = true;
  expExpandida = true;
  rxExpandida = true;
  servExpandida = true;

  toggleSV() { this.svExpandida = !this.svExpandida; }
  toggleExp() { this.expExpandida = !this.expExpandida; }
  toggleRX() { this.rxExpandida = !this.rxExpandida; }
  toggleServ() { this.servExpandida = !this.servExpandida; }

  paciente: any = null;
  expediente: any = null; // signosVitalesRecientes, ultimasRecetas, etc.

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
    motivoConsulta: '',
    diagnosticosTexto: '',
    observaciones: '',
    indicacionesGenerales: '',
    citaSeguimiento: '', // input date -> string
    medicamentos: [] as MedicamentoUI[],
  };

  generandoReceta = false;

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

    notas: '',
  };

  guardandoSignos = false;

  private joinLista(arr: any): string {
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr
      .map(x => String(x ?? '').trim())
      .filter(Boolean)
      .join('\n'); // 👈 uno por renglón para editar fácil
  }

  private prefillAntecedentesFormDesdePaciente() {
    const ant = this.paciente?.antecedentes || null;

    // Si no hay paciente o no hay antecedentes, deja en blanco pero conserva selects por default
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
      .split(/\r?\n|,/g)          // por renglón o comas
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

    await this.cargarCola();

    this.tick = setInterval(() => { }, 60000); // fuerza change detection indirecta por bindings
  }


  ngOnDestroy() {
    if (this.tick) clearInterval(this.tick);
  }


  async cargarCola() {
    try {
      const resp = await firstValueFrom(this.fichasService.obtenerColaMedico());
      this.cola = resp?.fichas ?? [];
      this.colaExpandida = true;
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

  esMia(f: any): boolean {
    const miId = this.miUsuarioId;
    return !!miId && !!f?.medicoId && String(f.medicoId) === String(miId);
  }

  async reanudar(f: any) {
    try {
      const resp = await firstValueFrom(this.fichasService.reanudarFicha(f._id));
      this.fichaActual = resp?.ficha;

      this.colapsarColaSiHayAtencion();
      this.abrirSeccionesAtencion();
      this.resetAtencionUI();

      // ✅ IMPORTANTE: aquí ya no hay nada en memoria porque refrescaste,
      // así que reseteas UI como cuando llamas:
      this.notasMedico = '';
      this.motivoEditable = this.fichaActual?.motivo || '';
      this.servicios = [this.nuevoRenglonServicio()];

      await this.cargarExpedienteSiHayPaciente();

      this.colapsarColaSiHayAtencion();
      await this.cargarCola();
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
      query: '',
      sugerencias: [],
      buscando: false,
    };
  }

  get medicoOcupado(): boolean {
    // 1) si en UI ya estás atendiendo una ficha
    if (this.fichaActual?.estado === 'EN_ATENCION') return true;

    // 2) si no hay fichaActual (por refresh), pero la cola trae una EN_ATENCION mía
    return (this.cola || []).some(f => f?.estado === 'EN_ATENCION' && this.esMia(f));
  }

  async llamar(f: any) {
    try {

      if (this.medicoOcupado) {
        Swal.fire('Ocupado', 'Ya estás atendiendo a un paciente. Reanuda o finaliza antes de llamar a otro.', 'info');
        return;
      }

      const resp = await firstValueFrom(this.fichasService.llamarFicha(f._id));
      this.fichaActual = resp?.ficha;

      this.abrirSeccionesAtencion();
      this.resetAtencionUI();

      // UI atención
      this.notasMedico = '';
      this.motivoEditable = this.fichaActual?.motivo || '';
      this.servicios = [this.nuevoRenglonServicio()];

      // ✅ cargar expediente si hay pacienteId
      await this.cargarExpedienteSiHayPaciente();

      if (!this.fichaActual?.pacienteId) {
        Swal.fire({
          icon: 'info',
          title: 'Paciente sin expediente',
          text: 'Esta ficha no está vinculada a un paciente. Vincúlalo para ver antecedentes, signos vitales y generar receta.',
          timer: 2500,
          showConfirmButton: false
        });
      }

      // UX
      this.colapsarColaSiHayAtencion();
      await this.cargarCola();
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo llamar', e?.error?.msg || 'Error', 'error');
    }
  }

  async regresarACola() {
    if (!this.fichaActual?._id) return;

    const nombre = this.fichaActual?.pacienteNombre || 'el paciente';

    const r = await Swal.fire({
      icon: 'warning',
      title: '¿Regresar a lista de espera?',
      html: `Se regresará <b>${nombre}</b> a la cola y se perderán los servicios capturados en esta pantalla.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, regresar',
      cancelButtonText: 'No',
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: true,
    });

    if (!r.isConfirmed) return;

    try {
      await firstValueFrom(this.fichasService.regresarAListaDeEspera(this.fichaActual._id));
      await this.cargarCola();
      this.cancelarAtencion();
      Swal.fire({ icon: 'success', title: 'Listo', timer: 900, showConfirmButton: false });
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo regresar a lista de espera', e?.error?.msg || 'Error', 'error');
    }
  }

  cancelarAtencion() {
    this.fichaActual = null;

    this.servicios = [];
    this.notasMedico = '';
    this.motivoEditable = '';

    this.paciente = null;
    this.expediente = null;

    this.limpiarSignos();

    this.receta = {
      motivoConsulta: '',
      diagnosticosTexto: '',
      observaciones: '',
      indicacionesGenerales: '',
      citaSeguimiento: '',
      medicamentos: [],
    };

    this.antForm = {
      alergiasTxt: '',
      enfermedadesCronicasTxt: '',
      medicamentosActualesTxt: '',
      cirugiasPreviasTxt: '',
      antecedentesFamiliaresTxt: '',
      tabaquismo: 'No',
      alcohol: 'No',
    };

    this.expedienteTab = 'ANT';
    this.colaExpandida = true;
  }


  agregarRenglonServicio() {
    this.servicios.push(this.nuevoRenglonServicio());
  }

  quitarServicio(i: number) {
    this.servicios.splice(i, 1);
  }


  onInputServicio(i: number) {
    const row = this.servicios[i];
    if (!row) return;

    const q = (row.query || '').trim();

    // limpia si está vacío
    if (!q) {
      row.sugerencias = [];
      row.productoId = '';
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
    if (!row) return;

    row.productoId = p._id;
    row.query = p.nombre;
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
      s.glucosaCapilar != null ||
      !!String(s.notas || '').trim()
    );
  }

  private buildPayloadRecetaFinal() {
    const payload = this.buildPayloadReceta();

    const motivo = (payload.motivoConsulta || '').trim();

    const diagnosticos = Array.isArray(payload.diagnosticos)
      ? payload.diagnosticos.map(d => (d || '').trim()).filter(Boolean)
      : [];

    const meds = Array.isArray(payload.medicamentos)
      ? payload.medicamentos
      : [];

    payload.diagnosticos = diagnosticos;

    const diagnosticosOk = diagnosticos.length > 0;
    const medsOk = meds.length > 0;

    const hayAlgo =
      !!motivo ||
      diagnosticosOk ||
      medsOk ||
      !!(payload.observaciones || '').trim() ||
      !!(payload.indicacionesGenerales || '').trim();

    // 🔥 NUEVA REGLA:
    // mínima válida = al menos 1 medicamento
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

    // -------------------------
    // 1) Servicios (si hay)
    // -------------------------
    const serviciosOk = (this.servicios || [])
      .map(s => ({ ...s, productoId: (s.productoId || '').trim() }))
      .filter(s => !!s.productoId)
      .map(s => ({
        productoId: s.productoId,
        cantidad: s.cantidad,
        notas: (s.notas || '').trim(),
      }));

    const hayServicios = serviciosOk.length > 0;

    // -------------------------
    // 2) Notas médico
    // -------------------------
    const hayNotasMedico = !!(this.notasMedico || '').trim();

    // -------------------------
    // 3) Signos vitales (solo si hay paciente)
    // -------------------------
    const haySignosCapturados = this.hayAlgoEnSignos();
    const signosSeGuardaran = haySignosCapturados && tienePaciente;

    // -------------------------
    // 4) Receta (solo si hay paciente y está completa mínimo)
    // -------------------------
    const rxInfo = this.buildPayloadRecetaFinal();
    const hayRecetaValida = rxInfo.tieneMedicamentos;
    const recetaPacienteDePaso = !tienePaciente && hayRecetaValida;
    const recetaIncompleta = rxInfo.hayAlgo && !rxInfo.tieneMedicamentos;
    // -------------------------
    // 5) Checklist de "no capturado"
    // -------------------------
    const faltantes: string[] = [];
    const antInfo = this.buildAntecedentesPayload();
    const pacInfo = this.buildPacienteUpdatePayload();
    const antecedentesSeGuardaran = tienePaciente && antInfo.hayAlgo;

    if (tienePaciente) {
      if (!haySignosCapturados) faltantes.push("Signos vitales");
      if (!rxInfo.hayAlgo) faltantes.push("Receta médica");
      if (!antInfo.hayAlgo) faltantes.push("Antecedentes");
      if (!pacInfo.hayAlgo) faltantes.push("Datos del paciente");
      if (!hayNotasMedico) faltantes.push("Notas del médico");
      if (!hayServicios) faltantes.push('Servicios médicos — "No recibirá usted honorarios por esta consulta"');
    }

    // Avisos especiales
    const avisos: string[] = [];

    if (haySignosCapturados && !tienePaciente) {
      avisos.push("Capturaste signos vitales, pero el paciente NO está vinculado. No se podrán guardar.");
    }
    if (rxInfo.hayAlgo && !tienePaciente && !hayRecetaValida) {
      avisos.push("La receta del paciente de paso está incompleta.");
    }

    if (recetaPacienteDePaso) {
      avisos.push("Se imprimirá una receta de paciente de paso, pero no se guardará en historial clínico.");
    }
    if (recetaIncompleta) {
      avisos.push("La receta está INCOMPLETA (falta motivo, diagnósticos ó medicamentos)");
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

    const pacienteInfoSeGuardara = tienePaciente && pacInfo.hayAlgo;
    // -------------------------
    // 6) Payload final al backend
    // -------------------------
    const payloadFinal: any = {
      motivo: (this.motivoEditable || '').trim(),
      notasMedico: (this.notasMedico || '').trim(),
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
        notas: (this.signos.notas || '').trim(),
      } : null,
      antecedentes: antecedentesSeGuardaran ? antInfo.payload : null,
      receta: hayRecetaValida ? rxInfo.payload : null,
      paciente: pacienteInfoSeGuardara ? pacInfo.payload : null,
    };

    this.guardando = true;
    try {
      const resp = await firstValueFrom(this.fichasService.finalizarConsulta(this.fichaActual._id, payloadFinal));

      const estadoFinal = resp?.estadoFinal;
      const recetaId = resp?.recetaId;
      const recetaPaso = resp?.recetaPaso || null;

      // 7) Si hay receta, pedir impresora e imprimir
      if (recetaId || recetaPaso) {
        const rPrint = await Swal.fire({
          icon: 'info',
          title: 'Imprimir receta',
          text: 'Por favor, prepare la impresora para imprimir la receta.',
          confirmButtonText: 'Imprimir',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });

        if (rPrint.isConfirmed) {
          if (recetaId) {
            await this.imprimirReceta(recetaId);
          } else if (recetaPaso) {
            await this.imprimirRecetaPaso(recetaPaso);
          }
        }
      }
      // 8) Mensaje final al médico
      const msgs: string[] = [];

      if (estadoFinal === "LISTA_PARA_COBRO") {
        msgs.push("Indique al paciente que pase a pagar a caja.");
      } else {
        msgs.push("El paciente fue atendido.");
        if (!recetaId && !hayServicios) {
          msgs.push("No tuvo receta ni servicios médicos.");
        }
      }

      if (recetaId || recetaPaso) {
        msgs.push("Si gusta, puede pasar a caja a surtir su receta.");
      }

      await Swal.fire({
        icon: 'success',
        title: 'Listo',
        html: `<div style="text-align:left"><ul>${msgs.map(m => `<li>${m}</li>`).join('')}</ul></div>`,
        confirmButtonText: 'Aceptar',
        allowOutsideClick: false,
      });

      // limpiar pantalla y recargar cola
      this.cancelarAtencion();
      await this.cargarCola();

    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo finalizar la consulta', 'error');
    } finally {
      this.guardando = false;
    }
  }

  private pad2(n: number) { return String(n).padStart(2, '0'); }

  tiempoEnEspera(f: any): string {
    // ✅ si está en atención, no mostramos tiempo de espera
    if (f?.estado === 'EN_ATENCION') return 'En atención';

    const t = f?.llegadaAt ? new Date(f.llegadaAt).getTime() : null;
    if (!t || Number.isNaN(t)) return '—';

    const diff = Date.now() - t;
    if (diff < 0) return '—';

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

  private buildPacienteUpdatePayload() {
    const f = this.pacForm;

    const nombre = (f.nombre || '').trim();
    const apPaterno = (f.apPaterno || '').trim();
    const apMaterno = (f.apMaterno || '').trim();

    const contacto = {
      telefono: (f.telefono || '').trim(),
      email: (f.email || '').trim(),
      direccion: (f.direccion || '').trim(),
      emergencia: {
        nombre: (f.emergenciaNombre || '').trim(),
        telefono: (f.emergenciaTelefono || '').trim(),
        parentesco: (f.emergenciaParentesco || '').trim(),
      }
    };

    const datosGenerales = {
      fechaNacimiento: f.fechaNacimiento ? new Date(f.fechaNacimiento).toISOString() : null,
      sexo: (f.sexo || 'NoEspecifica'),
      curp: (f.curp || '').trim().toUpperCase(),
      entidadNacimiento: (f.entidadNacimiento || '').trim().toUpperCase(),
      ocupacion: (f.ocupacion || '').trim(),
      escolaridad: (f.escolaridad || '').trim(),
    };

    const hayNombre = !!(nombre || apPaterno || apMaterno);

    const hayEmergencia =
      !!(contacto.emergencia.nombre || contacto.emergencia.telefono || contacto.emergencia.parentesco);

    const hayAlgoContacto =
      !!(contacto.telefono || contacto.email || contacto.direccion || hayEmergencia);

    const hayAlgoDG =
      !!(
        datosGenerales.fechaNacimiento ||
        datosGenerales.curp ||
        datosGenerales.entidadNacimiento ||
        datosGenerales.ocupacion ||
        datosGenerales.escolaridad ||
        (datosGenerales.sexo && datosGenerales.sexo !== 'NoEspecifica')
      );

    const hayAlgo = hayNombre || hayAlgoContacto || hayAlgoDG;

    const payload: any = {};

    if (hayNombre) {
      payload.nombre = nombre || undefined;
      payload.apPaterno = apPaterno || undefined;
      payload.apMaterno = apMaterno || undefined;
    }

    if (hayAlgoContacto) {
      payload.contacto = {
        telefono: contacto.telefono || undefined,
        email: contacto.email || undefined,
        direccion: contacto.direccion || undefined,
        emergencia: hayEmergencia ? {
          nombre: contacto.emergencia.nombre || undefined,
          telefono: contacto.emergencia.telefono || undefined,
          parentesco: contacto.emergencia.parentesco || undefined,
        } : undefined,
      };
    }

    if (hayAlgoDG) {
      payload.datosGenerales = {
        fechaNacimiento: datosGenerales.fechaNacimiento || undefined,
        sexo: datosGenerales.sexo || undefined,
        curp: datosGenerales.curp || undefined,
        entidadNacimiento: datosGenerales.entidadNacimiento || undefined,
        ocupacion: datosGenerales.ocupacion || undefined,
        escolaridad: datosGenerales.escolaridad || undefined,
      };
    }

    return { hayAlgo, payload };
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

  private toDateInputValue(d: any): string {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async cargarExpedienteSiHayPaciente() {
    const pid = this.fichaActual?.pacienteId;
    if (!pid) {
      this.paciente = null;
      this.expediente = null;
      this.prefillAntecedentesFormDesdePaciente();
      return;
    }

    try {
      const resp: any = await firstValueFrom(this.pacientesService.getExpediente(pid));
      this.paciente = resp?.paciente ?? null;
      this.expediente = resp ?? null;
      this.prefillAntecedentesFormDesdePaciente();
    } catch (e) {
      console.error(e);
      // no detengas la atención si falla expediente
      this.paciente = null;
      this.expediente = null;
      this.prefillAntecedentesFormDesdePaciente();
    }
  }

  async vincularPacientePorId(pacienteId: string) {
    if (!this.fichaActual?._id) return;

    try {
      const resp = await firstValueFrom(this.fichasService.vincularPaciente(this.fichaActual._id, pacienteId));
      this.fichaActual = resp?.ficha;

      await this.cargarExpedienteSiHayPaciente();

      Swal.fire({ icon: 'success', title: 'Paciente vinculado', timer: 900, showConfirmButton: false });
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo vincular paciente', e?.error?.msg || 'Error', 'error');
    }
  }

  async abrirVincularPaciente() {
    if (!this.fichaActual?._id) return;

    const r = await Swal.fire({
      title: 'Vincular paciente',
      input: 'text',
      inputLabel: 'Busca por CURP o por nombre completo',
      inputPlaceholder: 'Ej. ABCD900101HMCLRN00 o Juan Pérez López',
      showCancelButton: true,
      confirmButtonText: 'Buscar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      preConfirm: (value) => {
        const q = (value || '').trim();
        if (!q) {
          Swal.showValidationMessage('Escribe algo para buscar');
          return false as any;
        }
        return q;
      }
    });

    if (!r.isConfirmed) return;

    const q = r.value as string;

    try {
      const resp: any = await firstValueFrom(this.pacientesService.buscar(q));

      if (resp?.paciente?._id) {
        await this.vincularPacientePorId(resp.paciente._id);
        return;
      }

      const lista = resp?.pacientes ?? [];

      if (lista.length > 0) {
        const html = `
        <div style="text-align:left; max-height:320px; overflow:auto;">
          ${lista.map((p: any, idx: number) => `
            <div style="padding:10px; border:1px solid #eee; border-radius:10px; margin-bottom:8px;">
              <div><b>${p.nombre || ''} ${p.apPaterno || ''} ${p.apMaterno || ''}</b></div>
              <div style="color:#666; font-size:12px;">
                Tel: ${p?.contacto?.telefono || '-'} &nbsp; | &nbsp; CURP: ${p?.datosGenerales?.curp || '-'}
              </div>
              <button id="sel_${idx}" class="swal2-confirm swal2-styled" style="margin-top:8px;">Seleccionar</button>
            </div>
          `).join('')}
        </div>
      `;

        await Swal.fire({
          title: 'Selecciona un paciente',
          html,
          showConfirmButton: false,
          showCancelButton: true,
          cancelButtonText: 'Cancelar',
          didOpen: () => {
            lista.forEach((p: any, idx: number) => {
              const btn = document.getElementById(`sel_${idx}`);
              if (btn) {
                btn.addEventListener('click', async () => {
                  Swal.close();
                  await this.vincularPacientePorId(p._id);
                });
              }
            });
          }
        });

        return;
      }

      const r2 = await Swal.fire({
        icon: 'info',
        title: 'Sin resultados',
        text: 'No encontré pacientes. ¿Deseas darlo de alta para abrir expediente?',
        showCancelButton: true,
        confirmButtonText: 'Sí, crear',
        cancelButtonText: 'No',
        allowOutsideClick: false
      });

      if (!r2.isConfirmed) return;

      const nombreBase = this.fichaActual?.pacienteNombre || '';
      const apPatBase = this.fichaActual?.pacienteAPaterno || '';
      const apMatBase = this.fichaActual?.pacienteAMaterno || '';
      const telBase = this.fichaActual?.pacienteTelefono || '';

      const r3 = await Swal.fire({
        title: 'Alta de paciente',
        html: `
        <input id="p_nombre" class="swal2-input" placeholder="Nombre(s)" value="${nombreBase}">
        <input id="p_apPaterno" class="swal2-input" placeholder="Apellido paterno" value="${apPatBase}">
        <input id="p_apMaterno" class="swal2-input" placeholder="Apellido materno" value="${apMatBase}">
        <input id="p_tel" class="swal2-input" placeholder="Teléfono" value="${telBase}">
        <input id="p_fechaNac" class="swal2-input" type="date" placeholder="Fecha de nacimiento">
        <select id="p_sexo" class="swal2-input">
          <option value="">Sexo</option>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
        <input id="p_entidad" class="swal2-input" placeholder="Entidad de nacimiento (ej. MEXICO, JALISCO)">
        <input id="p_curp" class="swal2-input" placeholder="CURP (opcional, si no la tienes se genera provisional)">
      `,
        showCancelButton: true,
        confirmButtonText: 'Crear y vincular',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
          const nombre = (document.getElementById('p_nombre') as HTMLInputElement)?.value?.trim();
          const apPaterno = (document.getElementById('p_apPaterno') as HTMLInputElement)?.value?.trim();
          const apMaterno = (document.getElementById('p_apMaterno') as HTMLInputElement)?.value?.trim();
          const telefono = (document.getElementById('p_tel') as HTMLInputElement)?.value?.trim();
          const fechaNacimiento = (document.getElementById('p_fechaNac') as HTMLInputElement)?.value?.trim();
          const sexo = (document.getElementById('p_sexo') as HTMLSelectElement)?.value?.trim();
          const entidadNacimiento = (document.getElementById('p_entidad') as HTMLInputElement)?.value?.trim();
          const curp = (document.getElementById('p_curp') as HTMLInputElement)?.value?.trim();

          if (!nombre) {
            Swal.showValidationMessage('Nombre(s) es requerido');
            return false as any;
          }

          if (!apPaterno) {
            Swal.showValidationMessage('Apellido paterno es requerido');
            return false as any;
          }

          if (!curp) {
            if (!fechaNacimiento) {
              Swal.showValidationMessage('Fecha de nacimiento es requerida si no capturas CURP');
              return false as any;
            }
            if (!sexo) {
              Swal.showValidationMessage('Sexo es requerido si no capturas CURP');
              return false as any;
            }
            if (!entidadNacimiento) {
              Swal.showValidationMessage('Entidad de nacimiento es requerida si no capturas CURP');
              return false as any;
            }
          }

          return {
            nombre,
            apPaterno,
            apMaterno,
            telefono,
            fechaNacimiento,
            sexo,
            entidadNacimiento,
            curp,
            generarCurp: !curp
          };
        }
      });

      if (!r3.isConfirmed) return;

      const nuevo = await firstValueFrom(this.pacientesService.crearConsultorio(r3.value));
      const pacienteId = nuevo?.paciente?._id;
      if (!pacienteId) throw new Error('No se pudo crear paciente');

      await this.vincularPacientePorId(pacienteId);
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo buscar/crear/vincular paciente', 'error');
    }
  }

  expedienteTab: 'PAC' | 'ANT' | 'SV' | 'RX' = 'ANT';

  setExpedienteTab(tab: 'PAC' | 'ANT' | 'SV' | 'RX') {
    this.expedienteTab = tab;
    if (tab === 'PAC') this.fillPacienteFormFromPaciente();
  }

  nombrePacienteExpediente(): string {
    const p = this.paciente;
    if (!p) return this.fichaActual?.pacienteNombre || '';
    return `${p?.nombre || ''} ${p?.apPaterno || ''} ${p?.apMaterno || ''}`.trim();
  }

  fmtLista(arr: any[] | undefined): string {
    if (!Array.isArray(arr) || arr.length === 0) return '—';
    return arr.filter(Boolean).join(', ');
  }

  fmtTA(sv: any): string {
    const sis = sv?.presionSis;
    const dia = sv?.presionDia;
    if (sis == null && dia == null) return '—';
    return `${sis ?? '—'}/${dia ?? '—'}`;
  }

  nuevoMedicamento(): MedicamentoUI {
    return {
      // ✅ requerido
      modo: 'CATALOGO',

      // buscador
      q: '',
      resultados: [],

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

  private buildPayloadReceta() {
    const medicamentosOk = (this.receta.medicamentos || [])
      .map(m => {
        const esCat = m.modo === 'CATALOGO' && !!m.productoId;
        const esOtro = m.modo === 'OTRO';

        const productoId = esCat ? m.productoId : undefined;

        // ✅ OTRO => nombreLibre obligatorio
        // ✅ CATALOGO => NO mandes nombreLibre (evita basura)
        const nombreLibre = esOtro ? (m.nombreLibre || '').trim() : undefined;

        const via = (m.via || '').trim();
        const viaOtra = via === 'OTRA' ? (m.viaOtra || '').trim() : undefined;

        const cantidadRaw = (m as any).cantidad; // por si viene string desde el input
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
        // ✅ válido si: (productoId) o (nombreLibre)
        (!!m.productoId || !!m.nombreLibre) &&
        !!m.via &&
        (m.via !== 'OTRA' || !!m.viaOtra)
      );

    const diagnosticos = this.parseDiagnosticos(this.receta.diagnosticosTexto);

    return {
      motivoConsulta: (this.receta.motivoConsulta || this.motivoEditable || '').trim(),
      diagnosticos,
      observaciones: (this.receta.observaciones || '').trim(),
      medicamentos: medicamentosOk,
      indicacionesGenerales: (this.receta.indicacionesGenerales || '').trim(),
      citaSeguimiento: this.receta.citaSeguimiento ? new Date(this.receta.citaSeguimiento) : null,
    };
  }

  async generarReceta() {
    if (!this.fichaActual?.pacienteId) {
      Swal.fire('Falta paciente', 'Primero vincula un paciente para poder generar receta.', 'warning');
      return;
    }

    const payload = this.buildPayloadReceta();

    if (!payload.motivoConsulta) {
      Swal.fire('Falta motivo', 'Captura el motivo de consulta.', 'warning');
      return;
    }

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
      title: '¿Generar receta?',
      text: 'Se guardará la receta en el expediente del paciente.',
      showCancelButton: true,
      confirmButtonText: 'Sí, generar',
      cancelButtonText: 'No',
      allowOutsideClick: false,
      reverseButtons: true,
    });

    if (!r.isConfirmed) return;

    this.generandoReceta = true;
    try {
      const resp = await firstValueFrom(this.recetasService.crear(payload));

      Swal.fire('Listo', 'Receta generada correctamente.', 'success');

      // refresca expediente para que aparezca en últimas recetas
      await this.cargarExpedienteSiHayPaciente();

      // colapsar receta una vez grabada
      this.rxExpandida = false;

      // opcional: limpiar solo receta (sin borrar atención)
      /* this.receta = {
        motivoConsulta: this.motivoEditable || '',
        diagnosticosTexto: '',
        observaciones: '',
        indicacionesGenerales: '',
        citaSeguimiento: '',
        medicamentos: [this.nuevoMedicamento()],
      }; */
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo generar receta', 'error');
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
      if (m) m.resultados = [];
      if (this.buscandoMedIdx === i) this.buscandoMedIdx = null;
    }, 150);
  }

  async buscarMedicamentos(i: number) {
    const m = this.receta.medicamentos[i];
    if (!m || m.modo !== 'CATALOGO') return;

    const q = (m.q || '').trim();
    if (q.length < 2) {
      m.resultados = [];
      return;
    }

    // debounce
    clearTimeout(this.medSearchTimer);
    this.medSearchTimer = setTimeout(async () => {
      try {
        const resp = await firstValueFrom(this.productosService.buscarMedicamentosReceta(q));
        m.resultados = resp?.productos ?? [];
      } catch (e) {
        console.error(e);
        m.resultados = [];
      }
    }, 250);
  }

  seleccionarMedicamento(i: number, p: any) {
    const m = this.receta.medicamentos[i];
    if (!m) return;

    m.productoId = p?._id || null;
    m.nombreLibre = p?.nombre || '';
    m.ingreActivo = p?.ingreActivo || '';
    m.codigoBarras = p?.codigoBarras || '';

    /* m.q = `${m.nombreLibre}${m.ingreActivo ? ' — ' + m.ingreActivo : ''}`; */
    m.q = `${m.ingreActivo}`
    m.resultados = [];
  }

  usarOtro(i: number) {
    const m = this.receta.medicamentos[i];
    if (!m) return;
    m.modo = 'OTRO';
    m.productoId = null;
    m.q = '';
    m.resultados = [];
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
      notas: '',
    };
  }

  async guardarSignosVitales() {
    const pacienteId = this.fichaActual?.pacienteId;
    if (!pacienteId) {
      Swal.fire('Falta paciente', 'Primero vincula el paciente.', 'warning');
      return;
    }

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
      this.signos.glucosaCapilar != null ||
      (this.signos.notas || '').trim();

    if (!hayAlgo) {
      Swal.fire('Sin datos', 'Captura al menos un signo vital.', 'warning');
      return;
    }

    // confirmar
    const r = await Swal.fire({
      icon: 'question',
      title: '¿Guardar signos vitales?',
      text: 'Se agregará un registro al expediente del paciente.',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
    });

    if (!r.isConfirmed) return;

    this.guardandoSignos = true;
    try {
      // recalcula imc por si acaso
      this.recalcularIMC();

      const payload = {
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
        notas: (this.signos.notas || '').trim(),
      };

      await firstValueFrom(this.pacientesService.guardarSignosVitales(pacienteId, payload));

      Swal.fire('Listo', 'Signos vitales guardados.', 'success');

      await this.cargarExpedienteSiHayPaciente();

      // ✅ brincar a la pestaña de Signos Vitales del expediente
      this.expedienteTab = 'SV';

      setTimeout(() => {
        document.getElementById('expediente')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);

      // colapsar la cola si quieres dar espacio
      this.colapsarColaSiHayAtencion?.();

      // limpiar al guardar
      this.limpiarSignos();

      // colapsar signos vitales una vez capturados
      this.svExpandida = false;

    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudieron guardar los signos vitales', 'error');
    } finally {
      this.guardandoSignos = false;
    }
  }

  private abrirSeccionesAtencion() {
    this.svExpandida = true;
    this.expExpandida = true;
    this.rxExpandida = true;
    this.servExpandida = true;
  }

  async imprimirReceta(recetaId: string) {
    const resp = await firstValueFrom(this.recetasService.obtenerPorId(recetaId));
    const rx = resp?.receta;
    const extra = resp?.extraPaciente || {};
    if (!rx) throw new Error('No llegó la receta');

    const farm = rx.farmaciaId || {};
    const pac = rx.pacienteId || {};
    const med = rx.medicoId || {};

    const pacienteNombre = `${pac.nombre || ''} ${pac.apPaterno || ''} ${pac.apMaterno || ''}`.trim() || '—';
    const medicoNombre = `${med.nombre || ''} ${med.apellidos || ''}`.trim() || '—';
    const cedula = (med?.cedula || med?.profesional || '').toString().trim();

    const edad = this.calcEdad(pac);
    const fecha = new Date(rx.fecha || Date.now()).toLocaleDateString('es-MX');

    const alergias = Array.isArray(extra?.alergias) && extra.alergias.length
      ? extra.alergias.join(', ')
      : '—';

    const sv = extra?.ultimoSV || null;

    const diagnostico = Array.isArray(rx.diagnosticos) && rx.diagnosticos.length
      ? rx.diagnosticos.join(', ')
      : '—';

    const recomendaciones =
      (rx.indicacionesGenerales || '').trim() ||
      (rx.observaciones || '').trim() ||
      '';

    const direccion = (farm?.direccion || '').trim();
    const telefono = (farm?.telefono || '').trim();

    const rowsMeds = (rx.medicamentos || []).map((m: any, i: number) => {
      const nombre = (m.nombreLibre || m.productoId?.nombre || '').trim();
      const via = m.via === 'OTRA' ? `OTRA: ${m.viaOtra || ''}` : (m.via || '');
      return `
      <tr>
        <td class="n">${i + 1}</td>
        <td class="med">${this.esc(nombre)}</td>
        <td>${this.esc(m.dosis || '')}</td>
        <td>${this.esc(via || '')}</td>
        <td>${this.esc(m.frecuencia || '')}</td>
        <td>${this.esc(m.duracion || '')}</td>
      </tr>
    `;
    }).join('');

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receta</title>
  <style>
    /* Papel CARTA, tú vas a usar solo la mitad superior */
    @page { size: letter; margin: 10mm; }

    html, body { margin:0; padding:0; }
    body { font-family: Arial, sans-serif; color:#111; }

    /* ✅ Contenedor: solo media hoja (alto 5.5in) con ancho completo */
    .half-sheet{
      height: 5.5in;
      overflow: hidden;      /* oculta todo lo que se salga */
      position: relative;
      box-sizing: border-box;
    }

    /* Contenido con margen interno (para que no quede pegado) */
    .wrap{
      padding: 0 6mm;
      box-sizing: border-box;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .top { text-align:center; margin-top: 1.5mm; }
    .titulo { font-size: 17pt; font-weight: 800; line-height: 1.05; }
    .sub { margin-top: 1mm; font-size: 10pt; letter-spacing: 0.3px; line-height: 1.15; }

    .line { border-top: 2px solid #d38ab7; margin: 2.2mm 0 2.2mm; }

    /* watermark */
    .wm {
      position:absolute;
      right: 6mm;
      top: 35mm;
      width: 60mm;
      height: 60mm;
      opacity: .10;
      pointer-events:none;
    }

    /* INFO */
    .info { font-size: 10.2pt; }
    .info-row{
      display:flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6mm;
      margin: 1.0mm 0;
    }
    .info-left{ flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .info-right{ flex: 0 0 auto; white-space: nowrap; }

    .lbl { color:#c54b9a; font-weight:800; }
    .val-sm { font-size: 8.6pt; font-weight: 400; margin-left: 1.2mm; }
    .val-sm.one-line{
      display:inline-block;
      max-width: 120mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: bottom;
    }

    /* SV + MEDS */
    .sv-meds { display:flex; gap: 4mm; align-items:flex-start; margin-top: 2mm; }

    /* SV mínimos */
    .sv { flex: 0 0 26mm; font-size: 8.0pt; }
    .sv-title{ color:#c54b9a; font-weight:800; font-size: 8.6pt; margin: 0 0 1mm; }
    .sv-grid{
      display:grid;
      grid-template-columns: 10mm auto;
      column-gap: 0.5mm;
      row-gap: 0.55mm;
      align-items: end;
    }
    .sv-k { color:#c54b9a; font-weight:800; white-space: nowrap; }
    .sv-v{
      display:inline-block;
      width: 12mm;
      border-bottom: 1.3px solid #d38ab7;
      height: 9px;
      line-height: 9px;
      padding-left: 0.5mm;
      box-sizing: border-box;
    }

    table { width:100%; border-collapse: collapse; font-size: 8.8pt; }
    thead th { text-align:left; border-bottom: 2px solid #444; padding: 1.2mm 0.6mm; }
    tbody td { border-bottom: 1px solid #ddd; padding: 1.2mm 0.6mm; vertical-align: top; }
    .n { width: 6mm; text-align:center; }
    .med { font-weight: 700; }

    /* footer dentro de media hoja */
    .footer{
      margin-top: auto;         /* lo manda al fondo de la media hoja */
      padding-top: 2.5mm;
      border-top: 2px solid #d38ab7;
      display:flex;
      justify-content: space-between;
      gap: 6mm;
      font-size: 8.6pt;
      color:#444;
    }
  </style>
</head>
<body>
  <div class="half-sheet">

    <svg class="wm" viewBox="0 0 200 200">
      <path d="M100 20c-10 0-18 8-18 18s8 18 18 18 18-8 18-18-8-18-18-18zm0 40v120" stroke="#999" stroke-width="8" fill="none"/>
      <path d="M40 80c30 10 50 10 60 0" stroke="#999" stroke-width="8" fill="none"/>
      <path d="M160 80c-30 10-50 10-60 0" stroke="#999" stroke-width="8" fill="none"/>
    </svg>

    <div class="wrap">
      <div class="top">
        <div class="titulo">${this.esc(medicoNombre)}</div>
        <div class="sub">
          MÉDICO ESPECIALISTA EN MEDICINA FAMILIAR
          ${cedula ? ` &nbsp; - &nbsp; CÉDULA PROFESIONAL ${this.esc(cedula)}` : ``}
        </div>
      </div>

      <div class="line"></div>

      <div class="info">
        <div class="info-row">
          <div class="info-left">
            <span class="lbl">Paciente:</span>
            <span class="val-sm one-line">${this.esc(pacienteNombre)}</span>
          </div>
          <div class="info-right">
            <span class="lbl">Fecha:</span>
            <span>${this.esc(fecha)}</span>
          </div>
        </div>

        <div class="info-row">
          <div class="info-left">
            <span class="lbl">Diagnóstico:</span>
            <span class="val-sm one-line">${this.esc(diagnostico)}</span>
          </div>
          <div class="info-right">
            <span class="lbl">Edad:</span>
            <span>${this.esc(edad)}</span>
          </div>
        </div>

        <div class="info-row">
          <div class="info-left" style="flex:1 1 100%;">
            <span class="lbl">Alergías:</span>
            <span class="val-sm one-line">${this.esc(alergias)}</span>
          </div>
        </div>
      </div>

      <div class="sv-meds">
        <div class="sv">
          <div class="sv-title">Signos vitales</div>
          <div class="sv-grid">
            <div class="sv-k">Peso:</div>  <div class="sv-v">${sv?.pesoKg ?? '—'}</div>
            <div class="sv-k">Talla:</div> <div class="sv-v">${sv?.tallaCm ?? '—'}</div>
            <div class="sv-k">T/A:</div>   <div class="sv-v">${this.fmtTA(sv)}</div>
            <div class="sv-k">F.C.:</div>  <div class="sv-v">${sv?.fc ?? '—'}</div>
            <div class="sv-k">F.R.:</div>  <div class="sv-v">${sv?.fr ?? '—'}</div>
            <div class="sv-k">Temp:</div>  <div class="sv-v">${sv?.temperatura ?? '—'}</div>
            <div class="sv-k">SpO2:</div>  <div class="sv-v">${sv?.spo2 ?? '—'}</div>
          </div>
        </div>

        <div style="flex:1 1 auto; min-width:0;">
          <table>
            <thead>
              <tr>
                <th class="n">#</th>
                <th>Medicamento</th>
                <th>Dosis</th>
                <th>Vía</th>
                <th>Frecuencia</th>
                <th>Duración</th>
              </tr>
            </thead>
            <tbody>
              ${rowsMeds || `<tr><td colspan="6" style="text-align:center;color:#666;padding:6mm;">— Sin medicamentos —</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      ${recomendaciones ? `
        <div style="margin-top:3mm;">
          <div style="color:#c54b9a;font-weight:800;font-size:9pt;">Recomendaciones:</div>
          <div style="border-top:2px solid #d38ab7;min-height:12mm;padding-top:1.2mm;font-size:8.6pt;white-space:pre-wrap;">
            ${this.esc(recomendaciones)}
          </div>
        </div>
      ` : ``}

      <div class="footer">
        <div>¡Tu salud, nuestra prioridad!</div>
        <div style="text-align:right;">
          ${this.esc(direccion || '—')}
          ${telefono ? ` · Tel: ${this.esc(telefono)}` : ``}
        </div>
      </div>
    </div>
  </div>

  <script>
    window.onload = () => setTimeout(() => window.print(), 150);
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) throw new Error('No se pudo abrir ventana de impresión (popup bloqueado)');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async imprimirRecetaPaso(receta: any) {
    const rx = receta || {};
    const farmRaw = localStorage.getItem('user_farmacia');
    const farm = farmRaw ? JSON.parse(farmRaw) : {};

    const pacienteNombre = this.fichaActual?.pacienteNombre || 'Paciente de paso';
    const medicoRaw = localStorage.getItem('auth_user');
    let medico: any = {};
    try {
      medico = medicoRaw ? JSON.parse(medicoRaw) : {};
    } catch { }

    const medicoNombre = `${medico?.nombre || ''} ${medico?.apellidos || ''}`.trim() || '—';
    const cedula = (medico?.cedula || '').toString().trim();
    const fecha = new Date().toLocaleDateString('es-MX');

    const diagnostico = Array.isArray(rx.diagnosticos) && rx.diagnosticos.length
      ? rx.diagnosticos.join(', ')
      : '—';

    const rowsMeds = (rx.medicamentos || []).map((m: any, i: number) => {
      const nombre = (m.nombreLibre || '').trim();
      const via = m.via === 'OTRA' ? `OTRA: ${m.viaOtra || ''}` : (m.via || '');
      return `
      <tr>
        <td class="n">${i + 1}</td>
        <td class="med">${this.esc(nombre)}</td>
        <td>${this.esc(m.dosis || '')}</td>
        <td>${this.esc(via || '')}</td>
        <td>${this.esc(m.frecuencia || '')}</td>
        <td>${this.esc(m.duracion || '')}</td>
      </tr>
    `;
    }).join('');

    const recomendaciones =
      (rx.indicacionesGenerales || '').trim() ||
      (rx.observaciones || '').trim() ||
      '';

    const direccion = (farm?.direccion || '').trim();
    const telefono = (farm?.telefono || '').trim();

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receta</title>
  <style>
    @page { size: letter; margin: 10mm; }
    html, body { margin:0; padding:0; }
    body { font-family: Arial, sans-serif; color:#111; }

    .half-sheet{
      height: 5.5in;
      overflow: hidden;
      position: relative;
      box-sizing: border-box;
    }

    .wrap{
      padding: 0 6mm;
      box-sizing: border-box;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .top { text-align:center; margin-top: 1.5mm; }
    .titulo { font-size: 17pt; font-weight: 800; line-height: 1.05; }
    .sub { margin-top: 1mm; font-size: 10pt; letter-spacing: 0.3px; line-height: 1.15; }

    .line { border-top: 2px solid #d38ab7; margin: 2.2mm 0 2.2mm; }

    .info { font-size: 10.2pt; }
    .info-row{
      display:flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6mm;
      margin: 1.0mm 0;
    }
    .info-left{ flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .info-right{ flex: 0 0 auto; white-space: nowrap; }

    .lbl { color:#c54b9a; font-weight:800; }
    .val-sm { font-size: 8.6pt; font-weight: 400; margin-left: 1.2mm; }
    .val-sm.one-line{
      display:inline-block;
      max-width: 120mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: bottom;
    }

    table { width:100%; border-collapse: collapse; font-size: 8.8pt; margin-top: 3mm; }
    thead th { text-align:left; border-bottom: 2px solid #444; padding: 1.2mm 0.6mm; }
    tbody td { border-bottom: 1px solid #ddd; padding: 1.2mm 0.6mm; vertical-align: top; }
    .n { width: 6mm; text-align:center; }
    .med { font-weight: 700; }

    .footer{
      margin-top: auto;
      padding-top: 2.5mm;
      border-top: 2px solid #d38ab7;
      display:flex;
      justify-content: space-between;
      gap: 6mm;
      font-size: 8.6pt;
      color:#444;
    }
  </style>
</head>
<body>
  <div class="half-sheet">
    <div class="wrap">
      <div class="top">
        <div class="titulo">${this.esc(medicoNombre)}</div>
        <div class="sub">
          RECETA MÉDICA
          ${cedula ? ` &nbsp; - &nbsp; CÉDULA PROFESIONAL ${this.esc(cedula)}` : ``}
        </div>
      </div>

      <div class="line"></div>

      <div class="info">
        <div class="info-row">
          <div class="info-left">
            <span class="lbl">Paciente:</span>
            <span class="val-sm one-line">${this.esc(pacienteNombre)}</span>
          </div>
          <div class="info-right">
            <span class="lbl">Fecha:</span>
            <span>${this.esc(fecha)}</span>
          </div>
        </div>

        <div class="info-row">
          <div class="info-left">
            <span class="lbl">Diagnóstico:</span>
            <span class="val-sm one-line">${this.esc(diagnostico)}</span>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="n">#</th>
            <th>Medicamento</th>
            <th>Dosis</th>
            <th>Vía</th>
            <th>Frecuencia</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMeds || `<tr><td colspan="6" style="text-align:center;color:#666;padding:6mm;">— Sin medicamentos —</td></tr>`}
        </tbody>
      </table>

      ${recomendaciones ? `
        <div style="margin-top:3mm;">
          <div style="color:#c54b9a;font-weight:800;font-size:9pt;">Recomendaciones:</div>
          <div style="border-top:2px solid #d38ab7;min-height:12mm;padding-top:1.2mm;font-size:8.6pt;white-space:pre-wrap;">
            ${this.esc(recomendaciones)}
          </div>
        </div>
      ` : ``}

      <div class="footer">
        <div>¡Tu salud, nuestra prioridad!</div>
        <div style="text-align:right;">
          ${this.esc(direccion || '—')}
          ${telefono ? ` · Tel: ${this.esc(telefono)}` : ``}
        </div>
      </div>
    </div>
  </div>

  <script>
    window.onload = () => setTimeout(() => window.print(), 150);
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) throw new Error('No se pudo abrir ventana de impresión (popup bloqueado)');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  private esc(v: any) {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }


  private resetAtencionUI() {
    // ======= Atención básica =======
    this.notasMedico = '';
    this.motivoEditable = '';
    this.servicios = [this.nuevoRenglonServicio()];

    // ======= Antecedentes (form capturable) =======
    this.antForm = {
      alergiasTxt: '',
      enfermedadesCronicasTxt: '',
      medicamentosActualesTxt: '',
      cirugiasPreviasTxt: '',
      antecedentesFamiliaresTxt: '',
      tabaquismo: 'No',
      alcohol: 'No',
    };

    // ======= Signos vitales =======
    this.limpiarSignos();

    // ======= Receta =======
    this.receta = {
      motivoConsulta: '',
      diagnosticosTexto: '',
      observaciones: '',
      indicacionesGenerales: '',
      citaSeguimiento: '',
      medicamentos: [this.nuevoMedicamento()], // 👈 clave
    };

    // ======= Expediente =======
    this.paciente = null;
    this.expediente = null;
    this.expedienteTab = 'ANT';

    // ======= UI colapsables (como cuando inicia) =======
    this.abrirSeccionesAtencion();

    // ======= buscadores =======
    this.buscandoMedIdx = null;
    // opcional: limpia resultados de meds si hubiera
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
      Swal.fire('Error', e?.error?.msg || 'No se pudo cargar la receta', 'error');
    } finally {
      this.cargandoReceta = false;
    }
  }

  private calcEdad(pac: any): string {
    const fn = pac?.datosGenerales?.fechaNacimiento;
    if (!fn) return '—';
    const d = new Date(fn);
    if (isNaN(d.getTime())) return '—';

    const hoy = new Date();
    let e = hoy.getFullYear() - d.getFullYear();
    const m = hoy.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
    return String(e);
  }


  debeAbrirArriba(i: number): boolean {
    // Solo cuando ese índice está “activo”
    if (this.buscandoMedIdx !== i) return false;

    const el = document.getElementById(`med-input-${i}`);
    if (!el) return false;

    const r = el.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - r.bottom;

    // 260px dropdown + margen/colchón
    return espacioAbajo < 300;
  }


}

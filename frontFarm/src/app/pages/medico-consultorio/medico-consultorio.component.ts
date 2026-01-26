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
import { faL } from '@fortawesome/free-solid-svg-icons';

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

@Component({
  selector: 'app-medico-consultorio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './medico-consultorio.component.html',
})


export class MedicoConsultorioComponent implements OnInit {

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
      const resp = await firstValueFrom(this.fichasService.obtenerCola('EN_ESPERA'));
      this.cola = resp?.fichas ?? [];
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo cargar la cola', 'error');
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

  async llamar(f: any) {
    try {
      const resp = await firstValueFrom(this.fichasService.llamarFicha(f._id));
      this.fichaActual = resp?.ficha;

      this.abrirSeccionesAtencion();

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

  async guardarYEnviarACaja() {
    if (!this.fichaActual?._id) return;
    const serviciosOk = this.servicios
      .map(s => ({ ...s, productoId: (s.productoId || '').trim() }))
      .filter(s => s.productoId);

    if (serviciosOk.length === 0) {
      Swal.fire('Faltan servicios', 'Agrega al menos un servicio médico.', 'warning');
      return;
    }

    const nombre = this.fichaActual?.pacienteNombre || 'el paciente';

    const r = await Swal.fire({
      icon: 'question',
      title: '¿Finalizar atención?',
      html: `Se enviará la ficha de <b>${nombre}</b> a caja para cobro.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar a caja',
      cancelButtonText: 'No',
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: true,
    });

    if (!r.isConfirmed) return;

    this.guardando = true;
    try {
      const payload = {
        servicios: serviciosOk.map(s => ({
          productoId: s.productoId,
          cantidad: s.cantidad,
          notas: (s.notas || '').trim(),
        })),
        notasMedico: (this.notasMedico || '').trim(),
        motivo: (this.motivoEditable || '').trim(),
      };

      await firstValueFrom(this.fichasService.actualizarServicios(this.fichaActual._id, payload));

      Swal.fire('Listo', 'Ficha enviada a caja para cobro.', 'success');

      this.cancelarAtencion();
      await this.cargarCola();
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo guardar', 'error');
    } finally {
      this.guardando = false;
    }
  }

  private pad2(n: number) { return String(n).padStart(2, '0'); }

  tiempoEnEspera(f: any): string {
    const t = f?.llegadaAt ? new Date(f.llegadaAt).getTime() : null;
    if (!t || Number.isNaN(t)) return '—';
    const diff = Date.now() - t;
    if (diff < 0) return '—';
    const totalMin = Math.floor(diff / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${this.pad2(m)}m` : `${m}m`;
  }

  get medicoOcupado(): boolean {
    return !!this.fichaActual && this.fichaActual?.estado === 'EN_ATENCION';
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


  async cargarExpedienteSiHayPaciente() {
    const pid = this.fichaActual?.pacienteId;
    if (!pid) {
      this.paciente = null;
      this.expediente = null;
      return;
    }

    try {
      const resp: any = await firstValueFrom(this.pacientesService.getExpediente(pid));
      this.paciente = resp?.paciente ?? null;
      this.expediente = resp ?? null;
    } catch (e) {
      console.error(e);
      // no detengas la atención si falla expediente
      this.paciente = null;
      this.expediente = null;
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
      inputLabel: 'Busca por CURP, teléfono o nombre',
      inputPlaceholder: 'Ej: ROAA900101HDFXXX09 o 5512345678 o Juan Pérez',
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

      // Caso 1: exacto (por CURP) -> viene paciente
      if (resp?.paciente?._id) {
        await this.vincularPacientePorId(resp.paciente._id);
        return;
      }

      const lista = resp?.pacientes ?? [];

      // Caso 2: hay lista para elegir
      if (lista.length > 0) {
        const html = `
        <div style="text-align:left; max-height:320px; overflow:auto;">
          ${lista.map((p: any, idx: number) => `
            <div style="padding:10px; border:1px solid #eee; border-radius:10px; margin-bottom:8px;">
              <div><b>${p.nombre || ''} ${p.apellidos || ''}</b></div>
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

      // Caso 3: no hay resultados -> ofrecer crear rápido
      const r2 = await Swal.fire({
        icon: 'info',
        title: 'Sin resultados',
        text: 'No encontré pacientes con esa búsqueda. ¿Deseas darlo de alta rápido?',
        showCancelButton: true,
        confirmButtonText: 'Sí, dar de alta',
        cancelButtonText: 'No',
        allowOutsideClick: false
      });

      if (!r2.isConfirmed) return;

      // Crear rápido: prefilla nombre/tel si quieres
      const r3 = await Swal.fire({
        title: 'Alta rápida de paciente',
        html: `
        <input id="p_nombre" class="swal2-input" placeholder="Nombre(s)" value="${(this.fichaActual?.pacienteNombre || '').split(' ')[0] || ''}">
        <input id="p_apellidos" class="swal2-input" placeholder="Apellidos" value="">
        <input id="p_tel" class="swal2-input" placeholder="Teléfono" value="${this.fichaActual?.pacienteTelefono || ''}">
        <input id="p_curp" class="swal2-input" placeholder="CURP (opcional)" value="">
      `,
        showCancelButton: true,
        confirmButtonText: 'Crear y vincular',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
          const nombre = (document.getElementById('p_nombre') as HTMLInputElement)?.value?.trim();
          const apellidos = (document.getElementById('p_apellidos') as HTMLInputElement)?.value?.trim();
          const telefono = (document.getElementById('p_tel') as HTMLInputElement)?.value?.trim();
          const curp = (document.getElementById('p_curp') as HTMLInputElement)?.value?.trim();

          if (!nombre) {
            Swal.showValidationMessage('Nombre(s) es requerido');
            return false as any;
          }
          return { nombre, apellidos, telefono, curp };
        }
      });

      if (!r3.isConfirmed) return;

      const nuevo = await firstValueFrom(this.pacientesService.crearBasico(r3.value));
      const pacienteId = nuevo?.paciente?._id;
      if (!pacienteId) throw new Error('No se pudo crear paciente');

      await this.vincularPacientePorId(pacienteId);
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo buscar/crear/vincular paciente', 'error');
    }
  }

  expedienteTab: 'ANT' | 'SV' | 'RX' = 'ANT';

  nombrePacienteExpediente(): string {
    const p = this.paciente;
    if (!p) return this.fichaActual?.pacienteNombre || '';
    return `${p?.nombre || ''} ${p?.apellidos || ''}`.trim();
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

        return {
          productoId: esCat ? m.productoId : undefined,
          nombreLibre: (m.nombreLibre || '').trim() || (esCat ? (m.nombreLibre || '').trim() : ''),

          dosis: (m.dosis || '').trim(),
          via: m.via,
          viaOtra: (m.via === 'OTRA' ? (m.viaOtra || '').trim() : undefined),
          frecuencia: (m.frecuencia || '').trim(),
          duracion: (m.duracion || '').trim(),
          cantidad: (m.cantidad ?? null) === null ? undefined : Number(m.cantidad),
          indicaciones: (m.indicaciones || '').trim(),
          esControlado: !!m.esControlado,
        };
      })
      .filter(m =>
        // válido si: (productoId) o (nombreLibre)
        (!!m.productoId || !!m.nombreLibre) &&
        !!m.via &&
        (m.via !== 'OTRA' || !!m.viaOtra)
      );

    const diagnosticos = this.parseDiagnosticos(this.receta.diagnosticosTexto);

    return {
      pacienteId: this.fichaActual?.pacienteId,
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

    m.q = `${m.nombreLibre}${m.ingreActivo ? ' — ' + m.ingreActivo : ''}`;
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

}

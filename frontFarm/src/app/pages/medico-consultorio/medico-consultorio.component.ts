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
      const resp = await firstValueFrom(this.fichasService.obtenerCola(true));
      this.cola = resp?.fichas ?? [];
      this.colaExpandida = true;

    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo cargar la cola', 'error');
    }
  }


  private get miUsuarioId(): string {
    // usa lo que ya tengas; ejemplo típico:
    const u = localStorage.getItem('auth_user');
    try { return u ? JSON.parse(u)?._id : ''; } catch { return ''; }
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
    const meds = Array.isArray(payload.medicamentos) ? payload.medicamentos : [];

    payload.diagnosticos = diagnosticos;

    const diagnosticosOk = diagnosticos.length > 0;
    const medsOk = meds.length > 0;

    const hayAlgo =
      !!motivo ||
      diagnosticosOk ||
      medsOk ||
      !!(payload.observaciones || '').trim() ||
      !!(payload.indicacionesGenerales || '').trim();

    const completaMin = !!motivo && diagnosticosOk && medsOk;

    return { hayAlgo, completaMin, payload };
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
    const recetaSeGuardara = tienePaciente && rxInfo.completaMin;
    const recetaIncompleta = rxInfo.hayAlgo && !rxInfo.completaMin;

    // -------------------------
    // 5) Checklist de "no capturado"
    // -------------------------
    const faltantes: string[] = [];

    if (tienePaciente) {
      if (!haySignosCapturados) faltantes.push("Signos vitales");
      if (!rxInfo.hayAlgo) faltantes.push("Receta médica");
    } else {
      if (!hayNotasMedico) faltantes.push("Notas del médico");
      if (!hayServicios) faltantes.push('Servicios médicos — "No recibirá usted honorarios por esta consulta"');
    }

    // Avisos especiales
    const avisos: string[] = [];

    if (haySignosCapturados && !tienePaciente) {
      avisos.push("Capturaste signos vitales, pero el paciente NO está vinculado. No se podrán guardar.");
    }
    if (rxInfo.hayAlgo && !tienePaciente) {
      avisos.push("Capturaste receta, pero el paciente NO está vinculado. No se podrá guardar ni imprimir.");
    }
    if (recetaIncompleta) {
      avisos.push("La receta está INCOMPLETA (falta motivo/diagnósticos/medicamentos). No se guardará ni se imprimirá.");
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
      allowOutsideClick: false,
      allowEscapeKey: true,
    });

    if (!r.isConfirmed) return;

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
      receta: recetaSeGuardara ? rxInfo.payload : null,
    };

    this.guardando = true;
    try {
      const resp = await firstValueFrom(this.fichasService.finalizarConsulta(this.fichaActual._id, payloadFinal));

      const estadoFinal = resp?.estadoFinal;
      const recetaId = resp?.recetaId;

      // 7) Si hay receta, pedir impresora e imprimir
      if (recetaId) {
        const rPrint = await Swal.fire({
          icon: 'info',
          title: 'Imprimir receta',
          text: 'Por favor, prepare la impresora para imprimir la receta.',
          confirmButtonText: 'Imprimir',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });

        if (rPrint.isConfirmed) {
          // 👇 Aquí conectamos tu impresión real
          await this.imprimirReceta(recetaId);
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

      if (recetaId) {
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


  private escapeHtml(v: any): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatFecha(d: any): string {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '';
      return dt.toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  async imprimirReceta(recetaId: string) {
    const resp = await firstValueFrom(this.recetasService.obtenerPorId(recetaId));
    const rx = resp?.receta;
    if (!rx) throw new Error('No llegó la receta');

    const farm = rx.farmaciaId || {};
    const pac = rx.pacienteId || {};
    const med = rx.medicoId || {};

    const pacienteNombre = `${pac.nombre || ''} ${pac.apellidos || ''}`.trim();
    const medicoNombre = `${med.nombre || ''} ${med.apellidos || ''}`.trim();

    const medicamentosHtml = (rx.medicamentos || []).map((m: any, i: number) => {
      const nombreMed = (m.productoId?.nombre || m.nombreLibre || '').trim();
      const via = m.via === 'OTRA' ? `OTRA: ${m.viaOtra || ''}` : m.via;
      const indic = (m.indicaciones || '').trim();

      return `
      <div class="item">
        <div class="n"><b>${i + 1}.</b> ${this.esc(nombreMed)}</div>
        <div class="d">
          <span><b>Dosis:</b> ${this.esc(m.dosis || '')}</span>
          <span><b>Vía:</b> ${this.esc(via || '')}</span>
        </div>
        <div class="d">
          <span><b>Frecuencia:</b> ${this.esc(m.frecuencia || '')}</span>
          <span><b>Duración:</b> ${this.esc(m.duracion || '')}</span>
          ${m.cantidad != null ? `<span><b>Cant:</b> ${m.cantidad}</span>` : ``}
        </div>
        ${indic ? `<div class="ind"><b>Indicaciones:</b> ${this.esc(indic)}</div>` : ``}
      </div>
    `;
    }).join('');

    const diagnosticos = Array.isArray(rx.diagnosticos) ? rx.diagnosticos.filter(Boolean) : [];
    const diagHtml = diagnosticos.length
      ? `<div class="box"><b>Diagnóstico(s):</b> ${this.esc(diagnosticos.join(', '))}</div>`
      : ``;

    const obs = (rx.observaciones || '').trim();
    const indGen = (rx.indicacionesGenerales || '').trim();

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receta</title>
  <style>
    @page { size: 5.5in 8.5in; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; color:#111; }
    .header { text-align:center; margin-bottom: 8px; }
    .h1 { font-size: 14pt; font-weight: 700; }
    .h2 { font-size: 12pt; font-weight: 700; margin-top: 2px; }
    .muted { font-size: 10pt; color:#444; }
    .row { display:flex; justify-content:space-between; gap: 10px; }
    .box { border:1px solid #ddd; border-radius: 8px; padding: 8px; margin: 6px 0; }
    .item { border-bottom: 1px dashed #ddd; padding: 6px 0; }
    .item:last-child { border-bottom: none; }
    .n { font-size: 12pt; }
    .d { display:flex; flex-wrap:wrap; gap: 10px; margin-top: 2px; }
    .ind { margin-top: 2px; }
    .sign { margin-top: 18px; display:flex; justify-content:space-between; gap:10px; }
    .line { width: 60%; border-top:1px solid #111; margin-top: 22px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="h1">${this.esc(farm.titulo1 || farm.nombre || 'Farmacia')}</div>
    ${farm.titulo2 ? `<div class="h2">${this.esc(farm.titulo2)}</div>` : ``}
    <div class="muted">Fecha: ${new Date(rx.fecha).toLocaleString('es-MX')}</div>
  </div>

  <div class="box">
    <div><b>Paciente:</b> ${this.esc(pacienteNombre || '—')}</div>
    ${pac?.contacto?.telefono ? `<div><b>Tel:</b> ${this.esc(pac.contacto.telefono)}</div>` : ``}
    ${rx.motivoConsulta ? `<div><b>Motivo:</b> ${this.esc(rx.motivoConsulta)}</div>` : ``}
  </div>

  ${diagHtml}

  <div class="box">
    <b>Tratamiento:</b>
    ${medicamentosHtml || '<div class="muted">—</div>'}
  </div>

  ${indGen ? `<div class="box"><b>Indicaciones generales:</b> ${this.esc(indGen)}</div>` : ``}
  ${obs ? `<div class="box"><b>Observaciones:</b> ${this.esc(obs)}</div>` : ``}

  <div class="sign">
    <div style="width:60%">
      <div class="line"></div>
      <div class="muted">${this.esc(medicoNombre || 'Médico')}</div>
    </div>
    <div style="width:40%; text-align:right" class="muted">
      Folio: ${this.esc(rx.folio || rx._id || '')}
    </div>
  </div>

  <script>
    window.onload = () => {
      setTimeout(() => window.print(), 150);
    };
    window.onafterprint = () => window.close();
  </script>
</body>
</html>
`;

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


  private buildRecetaHtmlMediaCarta(receta: any): string {
    const farmacia = receta?.farmacia || receta?.farmaciaSnapshot || {};
    const medico = receta?.medico || receta?.medicoSnapshot || {};
    const paciente = receta?.paciente || receta?.pacienteSnapshot || {};

    const meds = Array.isArray(receta?.medicamentos) ? receta.medicamentos : [];
    const dx = Array.isArray(receta?.diagnosticos) ? receta.diagnosticos : [];

    const rowsMeds = meds.map((m: any, i: number) => {
      const nombre = this.escapeHtml(m.nombreLibre || m.nombre || '');
      const ingre = this.escapeHtml(m.ingreActivo || '');
      const dosis = this.escapeHtml(m.dosis || '');
      const via = this.escapeHtml(m.viaOtra ? `${m.via} (${m.viaOtra})` : (m.via || ''));
      const frec = this.escapeHtml(m.frecuencia || '');
      const dur = this.escapeHtml(m.duracion || '');
      const cant = (m.cantidad ?? '') !== '' ? this.escapeHtml(m.cantidad) : '';
      const ind = this.escapeHtml(m.indicaciones || '');

      return `
      <tr>
        <td class="n">${i + 1}</td>
        <td>
          <div class="med-nombre">${nombre}</div>
          ${ingre ? `<div class="med-sub">Ingrediente activo: ${ingre}</div>` : ''}
          ${ind ? `<div class="med-sub">Indicaciones: ${ind}</div>` : ''}
        </td>
        <td class="c">${dosis}</td>
        <td class="c">${via}</td>
        <td class="c">${frec}</td>
        <td class="c">${dur}</td>
        <td class="c">${cant}</td>
      </tr>
    `;
    }).join('');

    const folio = this.escapeHtml(receta?.folio || receta?._id || '');
    const fecha = this.escapeHtml(this.formatFecha(receta?.fecha || receta?.createdAt));

    const motivo = this.escapeHtml(receta?.motivoConsulta || '');
    const obs = this.escapeHtml(receta?.observaciones || '');
    const indGen = this.escapeHtml(receta?.indicacionesGenerales || '');

    const pacienteNombre = this.escapeHtml(
      receta?.pacienteNombre ||
      paciente?.nombreCompleto ||
      `${paciente?.nombre ?? ''} ${paciente?.apellidos ?? ''}`.trim()
    );

    const pacienteTel = this.escapeHtml(paciente?.contacto?.telefono || receta?.pacienteTelefono || '');
    const pacienteEdad = this.escapeHtml(receta?.pacienteEdad || '');
    const pacienteSexo = this.escapeHtml(receta?.pacienteSexo || paciente?.datosGenerales?.sexo || '');

    const medicoNombre = this.escapeHtml(medico?.nombre || receta?.medicoNombre || '');
    const medicoCedula = this.escapeHtml(receta?.cedula || medico?.cedula || '');

    const farmaciaNombre = this.escapeHtml(farmacia?.nombre || receta?.farmaciaNombre || '');
    const farmaciaTitulo1 = this.escapeHtml(farmacia?.titulo1 || '');
    const farmaciaTitulo2 = this.escapeHtml(farmacia?.titulo2 || '');

    const dxHtml = dx.length
      ? `<ul class="dx">${dx.map((d: string) => `<li>${this.escapeHtml(d)}</li>`).join('')}</ul>`
      : `<div class="muted">—</div>`;

    return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Receta</title>
  <style>
    /* Media carta (US Half Letter): 5.5in x 8.5in */
    @page { size: 5.5in 8.5in; margin: 10mm; }
    html, body { padding: 0; margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .page { width: 100%; box-sizing: border-box; }

    .top {
      display: flex;
      justify-content: space-between;
      gap: 10mm;
      align-items: flex-start;
      border-bottom: 1px solid #bbb;
      padding-bottom: 6mm;
      margin-bottom: 6mm;
    }
    .h-left { flex: 1; }
    .h-right { width: 45%; text-align: right; }

    .titulo { font-size: 13pt; font-weight: 700; line-height: 1.2; }
    .subtitulo { font-size: 10pt; margin-top: 2mm; }
    .muted { color: #666; }

    .kv { font-size: 9.5pt; line-height: 1.35; }
    .kv b { font-weight: 700; }

    .section { margin: 4mm 0; }
    .label { font-size: 9.5pt; font-weight: 700; margin-bottom: 1.5mm; }
    .box {
      border: 1px solid #bbb;
      border-radius: 6px;
      padding: 3mm;
      font-size: 9.5pt;
      min-height: 10mm;
    }

    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th, td { border: 1px solid #bbb; padding: 2mm; vertical-align: top; }
    th { background: #f2f2f2; font-weight: 700; text-align: left; }
    .n { width: 6mm; text-align: center; }
    .c { width: 16mm; }
    .med-nombre { font-weight: 700; }
    .med-sub { margin-top: 1mm; font-size: 8.6pt; color: #333; }

    .dx { margin: 0; padding-left: 16px; }
    .footer {
      margin-top: 6mm;
      border-top: 1px solid #bbb;
      padding-top: 5mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 10mm;
      font-size: 9pt;
    }
    .firma {
      width: 55%;
      text-align: center;
    }
    .linea {
      border-top: 1px solid #111;
      margin-top: 14mm;
    }

    /* Evita que se rompan filas grandes */
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="page">

    <div class="top">
      <div class="h-left">
        <div class="titulo">${farmaciaTitulo1 || farmaciaNombre || 'Farmacia'}</div>
        ${farmaciaTitulo2 ? `<div class="titulo">${farmaciaTitulo2}</div>` : ''}
        ${farmaciaNombre && (farmaciaTitulo1 || farmaciaTitulo2) ? `<div class="subtitulo">${farmaciaNombre}</div>` : ''}
        <div class="subtitulo muted">RECETA MÉDICA</div>
      </div>

      <div class="h-right kv">
        <div><b>Folio:</b> ${folio}</div>
        <div><b>Fecha:</b> ${fecha}</div>
        <div style="margin-top:2mm;"><b>Médico:</b> ${medicoNombre || '—'}</div>
        ${medicoCedula ? `<div><b>Cédula:</b> ${medicoCedula}</div>` : ''}
      </div>
    </div>

    <div class="section kv">
      <div><b>Paciente:</b> ${pacienteNombre || '—'}</div>
      <div style="display:flex; gap:8mm; flex-wrap:wrap; margin-top:1mm;">
        <div><b>Tel:</b> ${pacienteTel || '—'}</div>
        <div><b>Edad:</b> ${pacienteEdad || '—'}</div>
        <div><b>Sexo:</b> ${pacienteSexo || '—'}</div>
      </div>
    </div>

    <div class="section">
      <div class="label">Motivo de consulta</div>
      <div class="box">${motivo || '<span class="muted">—</span>'}</div>
    </div>

    <div class="section">
      <div class="label">Diagnósticos</div>
      <div class="box">${dxHtml}</div>
    </div>

    <div class="section">
      <div class="label">Medicamentos</div>
      <table>
        <thead>
          <tr>
            <th class="n">#</th>
            <th>Medicamento</th>
            <th class="c">Dosis</th>
            <th class="c">Vía</th>
            <th class="c">Frecuencia</th>
            <th class="c">Duración</th>
            <th class="c">Cant.</th>
          </tr>
        </thead>
        <tbody>
          ${rowsMeds || `<tr><td colspan="7" class="muted">—</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="label">Indicaciones generales</div>
      <div class="box">${indGen || '<span class="muted">—</span>'}</div>
    </div>

    <div class="section">
      <div class="label">Observaciones</div>
      <div class="box">${obs || '<span class="muted">—</span>'}</div>
    </div>

    <div class="footer">
      <div class="kv muted">
        Documento generado en sistema.
      </div>
      <div class="firma">
        <div class="linea"></div>
        <div>Firma y sello</div>
      </div>
    </div>

  </div>
</body>
</html>
  `;
  }


}

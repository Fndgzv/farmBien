import { Component, ElementRef, ViewChild, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

import { Farmacia, FarmaciaService } from '../../services/farmacia.service';
import {
  PantallaTurnosResumenResponse,
  PantallaTurnosService,
  TurnoPantallaItem
} from '../../services/pantalla-turnos.service';
import { formatearTurnoConsultorioVisual } from '../../shared/utils/turno-visual';

@Component({
  selector: 'app-pantalla-turnos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pantalla-turnos.component.html',
  styleUrls: ['./pantalla-turnos.component.css']
})
export class PantallaTurnosComponent implements OnInit, OnDestroy {
  rolActual = '';
  esAdmin = false;
  esTurnos = false;

  farmacias: Farmacia[] = [];
  farmaciaTrabajoId = '';
  farmaciaSeleccionadaId = '';
  farmaciaSeleccionadaNombre = '';

  cargando = false;
  guardandoVideo = false;
  errorCarga = '';

  turnoEnAtencion: TurnoPantallaItem | null = null;
  siguientesTurnos: TurnoPantallaItem[] = [];
  pendientesTotales = 0;
  actualizadoEn = '';

  videos: string[] = [];
  indiceVideo = 0;
  youtubeId = '';
  youtubeAudioBloqueado = false;
  private youtubePlayer: any;
  private destruido = false;
  @ViewChild('youtubeHost') set youtubeHost(host: ElementRef | undefined) {
    if (host) void this.iniciarYoutube(host.nativeElement);
  }
  private async iniciarYoutube(host: HTMLElement): Promise<void> {
    try {
      if (!(window as any).YT?.Player) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://www.youtube.com/iframe_api';
          const timeout = setTimeout(() => { clearInterval(check); reject(); }, 15000);
          const check = setInterval(() => {
            if ((window as any).YT?.Player) { clearInterval(check); clearTimeout(timeout); resolve(); }
          }, 100);
          document.head.appendChild(script);
        });
      }
      if (this.destruido || !host.isConnected || !this.youtubeId) return;
      this.youtubePlayer = new (window as any).YT.Player(host, {
        videoId: this.youtubeId, width: '100%', height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (e: any) => { e.target.unMute(); e.target.setVolume(100); e.target.playVideo(); },
          onAutoplayBlocked: () => this.zone.run(() => { this.youtubeAudioBloqueado = true; }),
          onStateChange: (e: any) => { if (e.data === 0) this.zone.run(() => this.siguienteVideo()); },
          onError: () => this.zone.run(() => { this.videoError = 'YouTube no permite reproducir este video. Puedes avanzar al siguiente.'; })
        }
      });
    } catch { this.zone.run(() => { this.videoError = 'No se pudo cargar el reproductor de YouTube.'; }); }
  }
  private obtenerYoutubeId(raw: string): string {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      let id = '';
      if (host === 'youtu.be') id = url.pathname.slice(1);
      if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
        id = url.searchParams.get('v') || (/^\/(embed|shorts|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '');
      }
      return /^[\w-]{11}$/.test(id) ? id : '';
    } catch { return ''; }
  }
  activarAudioYoutube(): void {
    if (!this.youtubePlayer?.unMute) return;
    this.youtubePlayer.unMute();
    this.youtubePlayer.setVolume(100);
    this.youtubePlayer.playVideo();
    this.youtubeAudioBloqueado = false;
  }
  siguienteVideo(): void {
    if (!this.videos.length) return;
    this.indiceVideo = (this.indiceVideo + 1) % this.videos.length;
    this.aplicarVideoUrl(this.videos[this.indiceVideo]);
  }
  private aplicarLista(resp: any): void {
    const lista: string[] = resp.videoPromocionalUrls ?? (resp.videoPromocionalUrl ? [resp.videoPromocionalUrl] : []);
    if (JSON.stringify(lista) === JSON.stringify(this.videos)) return;
    this.videos = lista;
    this.indiceVideo = 0;
    this.aplicarVideoUrl(lista[0] || '');
  }
  private listaDraft(): string[] { return this.videoDraft.split(/\r?\n/).map(v => v.trim()).filter(Boolean); }
  videoPromocionalUrl = '';
  videoMimeType = 'video/mp4';
  usaVideoDefault = false;
  videoDraft = '';
  videoDraftDirty = false;
  videoEstado = '';
  videoError = '';

  readonly formatosVideoAceptados = '.mp4 (recomendado), .webm, .ogg/.ogv y .mov';
  private ultimaUrlValidada = '';
  private pollingRef: any = null;

  private audioCtx: AudioContext | null = null;
  private audioCompressor: DynamicsCompressorNode | null = null;
  private audioMaster: GainNode | null = null;
  private eventosAudioInstalados = false;
  private alertaSonoraPendiente = false;

  private resumenInicializado = false;
  private ultimoEventoLlamado = '';

  private readonly onInteraccionUsuario = () => {
    void this.intentarDesbloquearAudio();
  };

  constructor(
    private pantallaTurnosService: PantallaTurnosService,
    private zone: NgZone,
    private farmaciaService: FarmaciaService
  ) {}

  async ngOnInit(): Promise<void> {
    this.iniciarEstrategiaAudio();
    this.cargarRolActual();
    this.farmaciaTrabajoId = this.getFarmaciaTrabajoId();
    await this.cargarFarmacias();
    await this.refrescarResumen(true);

    this.pollingRef = setInterval(() => {
      this.refrescarResumen(false);
    }, 8000);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.youtubePlayer?.destroy();
    if (this.pollingRef) {
      clearInterval(this.pollingRef);
      this.pollingRef = null;
    }

    this.removerEventosDesbloqueoAudio();

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
      this.audioCompressor = null;
      this.audioMaster = null;
    }
  }

  get turnoActualLabel(): string {
    return this.formatearTurno(this.turnoEnAtencion, '--');
  }

  get turnoSiguienteInmediato(): TurnoPantallaItem | null {
    return this.siguientesTurnos.length ? this.siguientesTurnos[0] : null;
  }

  get turnosPosteriores(): TurnoPantallaItem[] {
    return this.siguientesTurnos.slice(1, 3);
  }

  get videoDraftValido(): boolean {
    return this.listaDraft().every(v => this.esVideoUrlValida(v));
  }

  onFarmaciaSeleccionadaChange(): void {
    if (!this.esAdmin) return;
    this.videoDraftDirty = false;
    this.actualizarNombreFarmacia();
    this.resetDeteccionLlamado();
    this.refrescarResumen(true);
  }

  onVideoDraftInput(): void {
    this.videoDraftDirty = true;
  }

  onVideoLoadedData(): void {
    if (!this.videoPromocionalUrl) return;
    this.videoError = '';
    if (!this.videoEstado) {
      this.videoEstado = 'Video cargado correctamente.';
    }
  }

  onVideoError(event: Event): void {
    const mediaError = (event.target as HTMLVideoElement | null)?.error;
    const codigo = Number(mediaError?.code || 0);

    let detalle = 'No se pudo reproducir el video configurado.';
    if (codigo === 2) detalle = 'Error de red al cargar el video.';
    if (codigo === 3) detalle = 'El archivo existe, pero el formato o codec no es compatible con el navegador.';
    if (codigo === 4) detalle = 'La ruta no existe o el formato no es soportado por el navegador.';

    if (/^\/assets\//i.test(this.videoPromocionalUrl)) {
      detalle += ' Verifica que el archivo este dentro de frontFarm/src/assets y que la ruta sea exacta.';
    } else if (/^\/uploads\//i.test(this.videoPromocionalUrl)) {
      detalle += ' Verifica que el archivo exista en backBien/uploads y que el servidor lo sirva en /uploads.';
    } else if (/^https?:\/\//i.test(this.videoPromocionalUrl)) {
      detalle += ' Si es URL externa, valida CORS y permisos de acceso del origen.';
    }

    this.videoEstado = '';
    this.videoError = `${detalle} Ruta: ${this.videoPromocionalUrl || '(vacia)'}`;
  }

  async refrescarResumen(mostrarLoader: boolean): Promise<void> {
    if (!this.farmaciaSeleccionadaId) {
      this.errorCarga = 'No hay farmacia asociada para mostrar turnos.';
      if (mostrarLoader) {
        await Swal.fire('Falta farmacia', this.errorCarga, 'warning');
      }
      return;
    }

    if (mostrarLoader) {
      this.cargando = true;
    }

    try {
      const resp = await firstValueFrom(
        this.pantallaTurnosService.obtenerResumen(this.farmaciaSeleccionadaId)
      );

      this.aplicarResumen(resp);
      this.errorCarga = '';
    } catch (err: any) {
      this.errorCarga = err?.error?.msg || 'No se pudo cargar PantallaTurnos.';
      if (mostrarLoader) {
        await Swal.fire('Error', this.errorCarga, 'error');
      }
    } finally {
      if (mostrarLoader) {
        this.cargando = false;
      }
    }
  }

  async guardarVideoPromocional(): Promise<void> {
    if (!this.esAdmin) {
      return;
    }

    if (!this.farmaciaSeleccionadaId) {
      await Swal.fire('Falta farmacia', 'Selecciona una farmacia.', 'warning');
      return;
    }

    if (!this.videoDraftValido) {
      await Swal.fire(
        'Ruta de video invalida',
        'Usa una URL http(s) o una ruta local /assets/... o /uploads/...',
        'warning'
      );
      return;
    }

    this.guardandoVideo = true;
    try {
      const resp = await firstValueFrom(
        this.pantallaTurnosService.actualizarVideoPromocional(
          this.farmaciaSeleccionadaId,
          this.listaDraft()
        )
      );

      this.aplicarLista(resp);
      this.usaVideoDefault = !!resp?.usaVideoDefault;
      this.videoDraft = this.videos.join('\n');
      this.videoDraftDirty = false;

      await Swal.fire('Listo', resp?.msg || 'Video actualizado.', 'success');
    } catch (err: any) {
      await Swal.fire(
        'Error',
        err?.error?.msg || 'No se pudo actualizar el video.',
        'error'
      );
    } finally {
      this.guardandoVideo = false;
    }
  }

  formatearTurno(turno: TurnoPantallaItem | null | undefined, fallback = '-'): string {
    if (!turno) return fallback;
    const turnoVisual = formatearTurnoConsultorioVisual(
      turno.turnoFecha,
      turno.turnoConsecutivo,
      { prefijo: 'TC', timeZone: 'America/Mexico_City' }
    );
    if (turnoVisual) {
      return turnoVisual;
    }

    const folio = String(turno.folio || '').trim();
    return folio || fallback;
  }

  private iniciarEstrategiaAudio(): void {
    this.instalarEventosDesbloqueoAudio();
    void this.intentarDesbloquearAudio();
  }

  private instalarEventosDesbloqueoAudio(): void {
    if (this.eventosAudioInstalados) return;

    const eventos = ['pointerdown', 'click', 'keydown', 'touchstart'];
    for (const evento of eventos) {
      window.addEventListener(evento, this.onInteraccionUsuario, { capture: true, passive: true });
    }

    this.eventosAudioInstalados = true;
  }

  private removerEventosDesbloqueoAudio(): void {
    if (!this.eventosAudioInstalados) return;

    const eventos = ['pointerdown', 'click', 'keydown', 'touchstart'];
    for (const evento of eventos) {
      window.removeEventListener(evento, this.onInteraccionUsuario, true);
    }

    this.eventosAudioInstalados = false;
  }

  private async intentarDesbloquearAudio(): Promise<void> {
    try {
      await this.ensureAudioContext();
      this.reproducirPulsoSilencioso();

      if (this.alertaSonoraPendiente) {
        this.alertaSonoraPendiente = false;
        this.reproducirTonoLlamado(0.02);
      }
    } catch {
      // Fallback silencioso: mantenemos listeners globales para reintentar tras interacción.
    }
  }

  private async ensureAudioContext(): Promise<void> {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) {
      throw new Error('AudioContext no soportado');
    }

    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
    }

    const audioCtx = this.audioCtx;
    if (!audioCtx) {
      throw new Error('No se pudo inicializar el contexto de audio');
    }

    if (!this.audioCompressor || !this.audioMaster) {
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 22;
      compressor.ratio.value = 9;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.24;

      const master = audioCtx.createGain();
      master.gain.value = 0.92;

      compressor.connect(master);
      master.connect(audioCtx.destination);

      this.audioCompressor = compressor;
      this.audioMaster = master;
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
  }

  private reproducirPulsoSilencioso(): void {
    const audioCtx = this.audioCtx;
    const target = this.audioCompressor || this.audioMaster;
    if (!audioCtx || !target) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    const start = audioCtx.currentTime + 0.01;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.0001, start + 0.04);

    osc.connect(gain);
    gain.connect(target);

    osc.start(start);
    osc.stop(start + 0.05);
  }

  private reproducirTonoLlamado(offsetSeconds = 0): void {
    const audioCtx = this.audioCtx;
    if (!audioCtx) return;

    const start = audioCtx.currentTime + offsetSeconds;
    const patron = [
      { freq: 1420, dur: 0.17, gain: 0.42 },
      { freq: 970, dur: 0.19, gain: 0.44 },
      { freq: 1560, dur: 0.21, gain: 0.46 },
    ];

    let cursor = start;
    for (const tono of patron) {
      this.emitirPulsoEstridente(cursor, tono.freq, tono.dur, tono.gain);
      cursor += tono.dur + 0.05;
    }
  }

  private emitirPulsoEstridente(startAt: number, frequency: number, duration: number, gainValue: number): void {
    const audioCtx = this.audioCtx;
    const target = this.audioCompressor || this.audioMaster;
    if (!audioCtx || !target) return;

    const oscA = audioCtx.createOscillator();
    const oscB = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscA.type = 'square';
    oscA.frequency.setValueAtTime(frequency, startAt);

    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(frequency * 1.5, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(target);

    oscA.start(startAt);
    oscB.start(startAt);
    oscA.stop(startAt + duration + 0.03);
    oscB.stop(startAt + duration + 0.03);
  }

  private dispararAlertaLlamado(): void {
    const audioCtx = this.audioCtx;
    if (!audioCtx || audioCtx.state !== 'running') {
      this.alertaSonoraPendiente = true;
      void this.intentarDesbloquearAudio();
      return;
    }

    this.alertaSonoraPendiente = false;
    this.reproducirTonoLlamado();
  }

  private async cargarFarmacias(): Promise<void> {
    if (this.esTurnos) {
      const farmaciaTrabajo = this.getFarmaciaTrabajo();
      this.farmacias = farmaciaTrabajo ? [farmaciaTrabajo] : [];
      this.farmaciaSeleccionadaId = farmaciaTrabajo?._id || this.farmaciaTrabajoId || '';
      this.actualizarNombreFarmacia();
      this.resetDeteccionLlamado();
      return;
    }

    try {
      const data = await firstValueFrom(this.farmaciaService.obtenerFarmacias());
      this.farmacias = Array.isArray(data) ? data : [];

      const existeTrabajo = this.farmacias.some((f) => f._id === this.farmaciaTrabajoId);
      if (existeTrabajo) {
        this.farmaciaSeleccionadaId = this.farmaciaTrabajoId;
      } else if (this.farmacias[0]?._id) {
        this.farmaciaSeleccionadaId = String(this.farmacias[0]._id);
      }

      this.actualizarNombreFarmacia();
      this.resetDeteccionLlamado();
    } catch {
      this.farmacias = [];
      this.farmaciaSeleccionadaId = this.farmaciaTrabajoId || '';
      this.actualizarNombreFarmacia();
      this.resetDeteccionLlamado();
    }
  }

  private cargarRolActual(): void {
    const raw = localStorage.getItem('usuario');
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      this.rolActual = String(parsed?.rol || '').trim();
    } catch {
      this.rolActual = '';
    }

    this.esAdmin = this.rolActual === 'admin';
    this.esTurnos = this.rolActual === 'turnos';
  }

  private aplicarResumen(resp: PantallaTurnosResumenResponse): void {
    const turnoEnAtencion = resp?.turnoEnAtencion || null;
    this.notificarSiNuevoLlamado(turnoEnAtencion);

    this.turnoEnAtencion = turnoEnAtencion;
    this.siguientesTurnos = Array.isArray(resp?.siguientesTurnos)
      ? resp.siguientesTurnos.slice(0, 3)
      : [];
    this.pendientesTotales = Number(resp?.pendientesTotales || 0);
    this.actualizadoEn = String(resp?.actualizadoEn || '');
    this.usaVideoDefault = !!resp?.usaVideoDefault;

    this.aplicarLista(resp);
    if (!this.videoDraftDirty) {
      this.videoDraft = this.videos.join('\n');
    }
  }

  private notificarSiNuevoLlamado(turnoEnAtencion: TurnoPantallaItem | null): void {
    const nuevoEvento = this.buildEventoLlamado(turnoEnAtencion);

    if (!this.resumenInicializado) {
      this.ultimoEventoLlamado = nuevoEvento;
      this.resumenInicializado = true;
      return;
    }

    const cambioReal = !!nuevoEvento && nuevoEvento !== this.ultimoEventoLlamado;
    this.ultimoEventoLlamado = nuevoEvento;

    if (!cambioReal) {
      return;
    }

    this.dispararAlertaLlamado();
  }

  private buildEventoLlamado(turno: TurnoPantallaItem | null): string {
    if (!turno?._id) return '';
    const llamadoAt = String(turno.llamadoAt || '').trim();
    const inicioAtencionAt = String(turno.inicioAtencionAt || '').trim();
    return `${turno._id}|${llamadoAt}|${inicioAtencionAt}`;
  }

  private resetDeteccionLlamado(): void {
    this.resumenInicializado = false;
    this.ultimoEventoLlamado = '';
  }

  private aplicarVideoUrl(urlRaw: string): void {
    const videoUrl = this.normalizarVideoUrl(urlRaw);
    this.youtubeId = this.obtenerYoutubeId(videoUrl);
    this.youtubeAudioBloqueado = false;
    if (this.youtubeId && this.youtubePlayer) {
      this.youtubePlayer.unMute();
      this.youtubePlayer.setVolume(100);
      this.youtubePlayer.loadVideoById(this.youtubeId);
    }
    if (!this.youtubeId && this.youtubePlayer) { this.youtubePlayer.destroy(); this.youtubePlayer = null; }
    this.videoPromocionalUrl = videoUrl;
    this.videoMimeType = this.obtenerVideoMimeType(videoUrl);
    this.videoError = '';
    this.videoEstado = '';

    if (!videoUrl) {
      this.ultimaUrlValidada = '';
      return;
    }

    if (videoUrl === this.ultimaUrlValidada) {
      return;
    }

    this.ultimaUrlValidada = videoUrl;
    if (!this.youtubeId) void this.validarRutaVideo(videoUrl);
  }

  private normalizarVideoUrl(urlRaw: string): string {
    let url = String(urlRaw || '').trim();
    if (!url) return '';

    if (url.startsWith('./')) {
      url = url.slice(2);
    }

    if (url.startsWith('assets/')) url = `/${url}`;
    if (url.startsWith('uploads/')) url = `/${url}`;

    return url;
  }

  private esVideoUrlValida(urlRaw: string): boolean {
    const url = String(urlRaw || '').trim();
    if (!url) return true;
    if (/^https?:\/\//i.test(url)) return true;
    if (/^\/?(assets|uploads)\//i.test(url)) return true;
    return false;
  }

  private obtenerVideoMimeType(videoUrl: string): string {
    const clean = String(videoUrl || '').split('#')[0].split('?')[0].toLowerCase();
    if (clean.endsWith('.webm')) return 'video/webm';
    if (clean.endsWith('.ogg') || clean.endsWith('.ogv')) return 'video/ogg';
    if (clean.endsWith('.mov')) return 'video/quicktime';
    return 'video/mp4';
  }

  private async validarRutaVideo(videoUrl: string): Promise<void> {
    if (!videoUrl) return;

    if (/^https?:\/\//i.test(videoUrl)) {
      this.videoEstado = 'URL externa configurada. Si no reproduce, valida permisos CORS del origen.';
      return;
    }

    if (!/^\/(assets|uploads)\//i.test(videoUrl)) {
      this.videoError = 'Ruta no soportada. Usa http(s), /assets/... o /uploads/...';
      return;
    }

    try {
      const response = await fetch(videoUrl, { method: 'HEAD', cache: 'no-store' });

      if (videoUrl !== this.videoPromocionalUrl) return;

      if (response.status === 405) {
        this.videoEstado = `La ruta ${videoUrl} no permite validacion HEAD. Intenta reproducir para confirmar.`;
        return;
      }

      if (!response.ok) {
        this.videoError = `No se encontro el archivo en ${videoUrl} (HTTP ${response.status}).`;
        return;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('video/')) {
        this.videoError = `La ruta ${videoUrl} responde "${contentType}". Debe responder un archivo de video.`;
        return;
      }

      this.videoEstado = `Ruta valida detectada: ${videoUrl}`;
    } catch {
      if (videoUrl !== this.videoPromocionalUrl) return;
      this.videoEstado = `No fue posible validar por red la ruta ${videoUrl}. Intenta abrirla directamente en otra pestana.`;
    }
  }

  private actualizarNombreFarmacia(): void {
    const farmacia = this.farmacias.find((f) => f._id === this.farmaciaSeleccionadaId);
    this.farmaciaSeleccionadaNombre = farmacia?.nombre || '';
  }

  private getFarmaciaTrabajoId(): string {
    const farmaciaActiva = localStorage.getItem('farmaciaActivaId');
    if (farmaciaActiva) {
      return farmaciaActiva;
    }

    const raw = localStorage.getItem('user_farmacia');
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?._id || '';
    } catch {
      return '';
    }
  }

  private getFarmaciaTrabajo(): Farmacia | null {
    const raw = localStorage.getItem('user_farmacia');
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed?._id) return null;
      return {
        _id: parsed._id,
        nombre: parsed.nombre || '',
        direccion: parsed.direccion || '',
        telefono: parsed.telefono || '',
        titulo1: parsed.titulo1 || '',
        titulo2: parsed.titulo2 || '',
        imagen: parsed.imagen || '',
        imagen2: parsed.imagen2 || ''
      };
    } catch {
      return null;
    }
  }
}

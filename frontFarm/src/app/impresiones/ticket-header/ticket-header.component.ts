import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-ticket-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-header.component.html',
  styleUrls: ['./ticket-header.component.css']
})
export class TicketHeaderComponent implements OnChanges {
  @Input() nombreFarmacia!: string;
  @Input() titulo1!: string;
  @Input() titulo2!: string;
  @Input() direccion!: string;
  @Input() telefono?: string;
  @Input() imagen?: string;

  // avisa cuando cargó
  @Output() logoReady = new EventEmitter<void>();

  /** Esta es la que usa el HTML */
  safeLogoSrc = '';
  ngOnChanges(changes: SimpleChanges) {
    if (changes['imagen']) {
      this.safeLogoSrc = this.resolveLogo(this.imagen);

      // cache-bust solo si es http(s) o ruta absoluta, NO si es data: o blob:
      const isHttp = /^https?:\/\//i.test(this.safeLogoSrc) || this.safeLogoSrc.startsWith('/');
      const isDataLike = this.safeLogoSrc.startsWith('data:') || this.safeLogoSrc.startsWith('blob:');
      if (isHttp && !isDataLike) {
        const sep = this.safeLogoSrc.includes('?') ? '&' : '?';
        this.safeLogoSrc += `${sep}v=${Date.now()}`;
      }

      // Si ya está en caché, dispara ready sin bloquear
      setTimeout(() => {
        const test = new Image();
        test.onload = () => this.logoReady.emit();
        test.onerror = () => { this.logoReady.emit(); }; // no bloquees la impresión
        test.src = this.safeLogoSrc;
      }, 0);
    }
  }


  private assetsBase(): string {
    return typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '';
  }

  private resolveLogo(img?: string): string {
    const base = this.assetsBase();
    if (!img || !img.trim()) return `${base}/assets/images/farmBienIcon.png`;

    if (/^(data:|blob:)/i.test(img)) return img;

    // http(s) absoluto
    if (/^https?:\/\//i.test(img)) return img;

    // rutas absolutas del mismo host (/assets/…)
    if (img.startsWith('/')) return `${base}${img}`;

    // rutas relativas típicas del build (assets/…)
    if (img.startsWith('assets/')) return `${base}/${img}`;

    // por compatibilidad con paths emitidos por el back
    if (img.startsWith('browser/assets/')) return `${base}/${img.replace(/^browser\//, '')}`;

    // último recurso: asume que es un nombre dentro de assets/images
    return `${base}/assets/images/${img}`;
  }


  onLogoError(e: Event) {
    const el = e.target as HTMLImageElement;
    const fallback = `${this.assetsBase()}/assets/images/farmBienIcon.png`;
    if (el.src !== fallback) el.src = fallback;
    // aunque falle, emitimos para que no bloquee la impresión
    this.logoReady.emit();
  }

  onLogoLoad() {
    this.logoReady.emit();
  }
}

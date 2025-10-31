import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-ticket-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-header.component.html',
  styleUrl: './ticket-header.component.css'
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
      // pequeño cache-bust para evitar “ghost cache”
      if (/^https?:\/\//i.test(this.safeLogoSrc) || this.safeLogoSrc.startsWith('/')) {
        const sep = this.safeLogoSrc.includes('?') ? '&' : '?';
        this.safeLogoSrc += `${sep}v=${Date.now()}`;
      }
      // Si la imagen ya estuviera en caché completa, dispara el ready
      setTimeout(() => {
        const test = new Image();
        test.onload = () => this.logoReady.emit();
        test.onerror = () => { }; // no bloqueamos
        test.src = this.safeLogoSrc;
      }, 0);
    }
  }

  private assetsBase(): string {
    const base = (environment as any).assetsBase || (typeof window !== 'undefined' ? window.location.origin : '');
    return String(base).replace(/\/+$/, '');
  }
  private resolveLogo(img?: string): string {
    const base = this.assetsBase();
    if (!img || !img.trim()) return `${base}/assets/images/farmBienIcon.png`;
    if (/^https?:\/\//i.test(img)) return img;
    const clean = img.replace(/^\/+/, '');
    if (clean.startsWith('assets/')) return `${base}/${clean}`;
    if (clean.startsWith('browser/assets/')) return `${base}/${clean.replace(/^browser\//, '')}`;
    return `${base}/assets/images/${clean}`;
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

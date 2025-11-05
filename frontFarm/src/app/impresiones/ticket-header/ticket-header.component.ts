import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-header.component.html',
  styleUrls: ['./ticket-header.component.css'],
})
export class TicketHeaderComponent implements OnChanges {
  @Input() farmacia?: {
    nombre?: string;
    direccion?: string;
    telefono?: string;
    titulo1?: string;
    titulo2?: string;
    imagen?: string;   // **DataURL o URL absoluta**
  };

  @Input() nombreFarmacia = '';
  @Input() titulo1 = '';
  @Input() titulo2 = '';
  @Input() direccion = '';
  @Input() telefono = '';
  @Input() imagen = '';

  @Output() logoReady = new EventEmitter<void>();

  safeLogoSrc = '';

  ngOnChanges(_: SimpleChanges) {
    const f = this.farmacia ?? {};
    this.nombreFarmacia = f.nombre ?? this.nombreFarmacia ?? '';
    this.direccion      = f.direccion ?? this.direccion ?? '';
    this.telefono       = f.telefono ?? this.telefono ?? '';
    this.titulo1        = f.titulo1 ?? this.titulo1 ?? '';
    this.titulo2        = f.titulo2 ?? this.titulo2 ?? '';

    // **si viene dataURL, úsalo; si no hay nada, usa fallback**
    this.safeLogoSrc = (f.imagen || this.imagen || this.defaultLogo());

    // ping no bloqueante
    setTimeout(() => {
      const test = new Image();
      test.onload = () => this.logoReady.emit();
      test.onerror = () => this.logoReady.emit();
      test.src = this.safeLogoSrc;
    }, 0);
  }

  private defaultLogo(): string {
    const base = typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '';
    return `${base}/assets/images/farmBienIcon.png`;
  }

  onLogoError(ev: Event) {
    const el = ev.target as HTMLImageElement;
    const fallback = this.defaultLogo();
    if (el.src !== fallback) el.src = fallback;
    this.logoReady.emit();
  }

  onLogoLoad() {
    this.logoReady.emit();
  }
}

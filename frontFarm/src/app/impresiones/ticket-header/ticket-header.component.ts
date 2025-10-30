// ticket-header.component.ts
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-ticket-header',
  standalone: true,
  templateUrl: './ticket-header.component.html',
  styleUrl: './ticket-header.component.css',
  imports: [ CommonModule]
})
export class TicketHeaderComponent implements OnChanges {
  @Input() nombreFarmacia!: string;
  @Input() titulo1!: string;
  @Input() titulo2!: string;
  @Input() direccion!: string;
  @Input() telefono!: string;
  @Input() imagen!: string;   // p.ej. 'assets/images/logo-santo-remedio.png'

  safeLogoSrc: SafeUrl = '';
  private readonly fallback = 'assets/images/farmBienIcon.png';

  constructor(private san: DomSanitizer) {}

  async ngOnChanges(c: SimpleChanges) {
    if (!c['imagen']) return;

    const url = await this.toDataURLSafe(this.imagen).catch(() => '');
    const finalUrl = url || (await this.toDataURLSafe(this.fallback).catch(() => this.fallback));
    this.safeLogoSrc = this.san.bypassSecurityTrustUrl(finalUrl);
  }

  private async toDataURLSafe(path: string): Promise<string> {
    const abs = new URL(
      path.replace(/^\/+/, '').startsWith('assets/') ? path.replace(/^\/+/, '') : `assets/${path.replace(/^\/+/, '')}`,
      document.baseURI
    ).toString();
    const r = await fetch(abs, { cache: 'force-cache' });
    if (!r.ok) throw new Error('fetch fail');
    const b = await r.blob();
    const dataUrl = await new Promise<string>(res => {
      const rd = new FileReader();
      rd.onloadend = () => res(String(rd.result || ''));
      rd.readAsDataURL(b);
    });
    return dataUrl;
  }
}

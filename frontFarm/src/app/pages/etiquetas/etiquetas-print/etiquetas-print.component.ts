import { Component, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatTooltipModule } from '@angular/material/tooltip';
import JsBarcode from 'jsbarcode';

import { LabelDesign, LabelElement } from '../../../core/models/label-design.model';
import { LabelDesignsService } from '../../../core/services/label-designs.service';
import { LabelsProductsService } from '../../../core/services/labels-products.service';
import { Farmacia, FarmaciaService } from '../../../services/farmacia.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-etiquetas-print',
  templateUrl: './etiquetas-print.component.html',
  styleUrls: ['./etiquetas-print.component.css'],
  standalone: true,
  imports: [FormsModule, CommonModule, DragDropModule, MatTooltipModule]
})


export class EtiquetasPrintComponent {

  constructor(
    private designsSvc: LabelDesignsService,
    private prodSvc: LabelsProductsService,
    private farmacia: FarmaciaService,
    private cdr: ChangeDetectorRef
  ) { }

  // ===== Compat con tu plantilla =====
  mostrarPrint = false;                 // tu overlay (no lo uso para imprimir, pero lo dejo)
  itemsParaImprimir: any[] = [];        // usado por el *ngFor del overlay

  get seleccionados() {                 // checkbox de la tabla
    return this.productos.filter(p => p._checked);
  }

  trackById = (_: number, p: any) => p?._id;  // trackBy del *ngFor

  // alias para los nombres que espera tu HTML
  get lblW() { return this.lblWmm; }
  get lblH() { return this.lblHmm; }
  get pad() { return this.padMm; }

  // estilo de texto que esperaba tu plantilla
  styleTexto(el: LabelElement) {
    return {
      position: 'absolute',
      'font-weight': el.bold ? '700' : '400',
      'font-size.px': (el.fontSize || 10),
      'text-align': el.align || 'left',
      overflow: 'hidden',
      display: 'flex',
      'align-items': 'center',
      'justify-content': el.align === 'center'
        ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start'),
      'white-space': 'nowrap',
      'min-height.px': 1
    };
  }


  // ====== Estado ======
  isPrinting = false;

  disenos: LabelDesign[] = [];
  designId: string | null = null;
  design: LabelDesign | null = null;

  fNombre = '';
  fCategoria = '';
  productos: any[] = [];
  allChecked = false;

  farmacias: Farmacia[] = [];
  farmaciaId: string = '';

  @ViewChild('printHost') printHost!: ElementRef<HTMLElement>;

  // selección global
  selectedIds = new Set<string>();
  selectedItems = new Map<string, any>();
  get totalSeleccionados() { return this.selectedIds.size; }

  page = 1; limit = 20; totalFiltrado = 0; totalPages = 1;
  sortBy: 'nombre' | 'categoria' = 'nombre';
  sortDir: 'asc' | 'desc' = 'asc';

  private lastQuerySig = '';

  // ====== Geometría del diseño ======
  get lblWmm() { return 62; } // Brother QL: 62mm
  get lblHmm() { return this.design?.heightMm ?? 30; }
  get padMm() { return this.design?.marginMm ?? 0; }

  private formatMoneyNoCents(n: number): string {
    // Sólo separadores de miles, sin símbolo
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(Number(n) || 0));
  }

  ngOnInit() {
    this.designsSvc.list().subscribe(d => {
      this.disenos = d;
      if (d.length) { this.designId = d[0]._id!; this.loadDesign(); }
    });
    const last = localStorage.getItem('farmaciaId_print') || '';
    this.farmaciaId = last;
    this.cargarFarmacias();
  }

  private normalizeDesign(raw: any): LabelDesign & any {
    const size = raw?.size || {};
    const layout = raw?.layout || {};
    return {
      ...raw,
      widthMm: size.widthMm ?? raw.widthMm ?? 0,
      heightMm: size.heightMm ?? raw.heightMm ?? 0,
      marginMm: size.marginMm ?? raw.marginMm ?? 0,
      pageWidthMm: layout.pageWidthMm ?? raw.pageWidthMm ?? 210,
      pageHeightMm: layout.pageHeightMm ?? raw.pageHeightMm ?? 297,
      cols: layout.columns ?? raw.cols ?? 1,
      rows: layout.rows ?? raw.rows ?? 1,
      gapXmm: layout.gapXmm ?? raw.gapXmm ?? 0,
      gapYmm: layout.gapYmm ?? raw.gapYmm ?? 0,
      elements: raw.elements ?? []
    };
  }

  loadDesign() {
    if (!this.designId) return;
    this.designsSvc.get(this.designId).subscribe(d => this.design = this.normalizeDesign(d));
  }

  cargarFarmacias() {
    this.farmacia.obtenerFarmacias().subscribe({
      next: (resp) => {
        this.farmacias = resp || [];

        if (this.farmacias.length) {
          const existe = this.farmacias.some(f => f._id === this.farmaciaId);
          if (!this.farmaciaId || !existe) {
            this.farmaciaId = this.farmacias[0]._id!;
            localStorage.setItem('farmaciaId_print', this.farmaciaId);
          }
          this.buscar();
        }
      },
      error: () => { this.farmacias = []; }
    });
  }


  private makeQuerySig(fid: string, nombre: string, categoria: string): string {
    const norm = (s: string) => (s || '').trim().toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
    return `${fid}|${norm(nombre)}|${norm(categoria)}`;
  }

  buscar() {
    const fid = this.farmaciaId?.trim();
    if (!fid) {
      Swal.fire({ icon: 'info', title: 'Aviso', text: 'Debes seleccionar una farmacia.', timer: 1500, showConfirmButton: false });
      return;
    }
    const sig = this.makeQuerySig(fid, this.fNombre, this.fCategoria);
    if (sig !== this.lastQuerySig) {
      this.selectedIds.clear(); this.selectedItems.clear(); this.page = 1; this.lastQuerySig = sig;
    }
    this.prodSvc.search({
      farmaciaId: fid,
      nombre: (this.fNombre || '').trim(),
      categoria: (this.fCategoria || '').trim(),
      page: this.page, limit: this.limit, sortBy: this.sortBy, sortDir: this.sortDir
    }).subscribe(r => {
      this.productos = (r.rows || []).map((x: any) => {
        const id = String(x._id);
        return { ...x, _id: id, _checked: this.selectedIds.has(id) };
      });
      this.allChecked = this.productos.length > 0 && this.productos.every(p => p._checked);
      this.totalFiltrado = r?.paginacion?.total ?? this.productos.length;
      this.totalPages = r?.paginacion?.totalPages ?? 1;
      this.page = r?.paginacion?.page ?? 1;
      this.limit = r?.paginacion?.limit ?? this.limit;
    });
  }

  onToggleRow(p: any) {
    const id = String(p._id);
    if (p._checked) { this.selectedIds.add(id); this.selectedItems.set(id, p); }
    else { this.selectedIds.delete(id); this.selectedItems.delete(id); }
    this.allChecked = this.productos.length > 0 && this.productos.every(x => this.selectedIds.has(String(x._id)));
  }

  toggleAll(ev: any) {
    this.allChecked = ev.target.checked;
    for (const p of this.productos) {
      const id = String(p._id);
      p._checked = this.allChecked;
      if (this.allChecked) { this.selectedIds.add(id); this.selectedItems.set(id, p); }
      else { this.selectedIds.delete(id); this.selectedItems.delete(id); }
    }
  }

  onFarmaciaChange() { localStorage.setItem('farmaciaId_print', this.farmaciaId); this.selectedIds.clear(); this.selectedItems.clear(); this.page = 1; this.buscar(); }
  limpiar() { this.fCategoria = ''; this.fNombre = ''; this.selectedIds.clear(); this.selectedItems.clear(); this.page = 1; this.lastQuerySig = this.makeQuerySig(this.farmaciaId?.trim() || '', '', ''); this.buscar(); }
  irPrimera() { if (this.page !== 1) { this.page = 1; this.buscar(); } }
  irAnterior() { if (this.page > 1) { this.page--; this.buscar(); } }
  irSiguiente() { if (this.page < this.totalPages) { this.page++; this.buscar(); } }
  irUltima() { if (this.page !== this.totalPages) { this.page = this.totalPages; this.buscar(); } }
  cambiarLimit(n: number) { this.limit = Number(n) || 20; this.page = 1; this.buscar(); }

  // ====== Utils de datos/formatos ======
  private nb = '\u00A0';
  private safe(v: any) { return (v === null || v === undefined) ? '' : String(v); }

  valorCampo(item: any, el: LabelElement) {
    const map: Record<string, any> = {
      nombre: this.safe(item?.nombre),
      renglon1: this.safe(item?.renglon1),
      renglon2: this.safe(item?.renglon2),
      codigoBarras: this.safe(item?.codigoBarras),
      precioVenta: this.safe(item?.precioVenta),
    };
    let v = el.field ? (map[el.field] ?? '') : (el.text ?? '');
    if (el.uppercase && typeof v === 'string') v = v.toUpperCase();
    const out = `${el.prefix || ''}${v}${el.suffix || ''}`;
    return out.trim() === '' ? this.nb : out;
  }

  valorPrecio(item: any, el: LabelElement) {
    const raw = item?.precioVenta;
    if (raw === null || raw === undefined || raw === '') return '';
    const n = Number(raw); if (!Number.isFinite(n)) return '';
    const body = this.formatMoneyNoCents(n);
    const txt = `${el.prefix || '$'}${body}${el.suffix || ''}`;
    return el.uppercase ? txt.toUpperCase() : txt;
  }


  // ====== Impresión 100% aislada (sin overlay, sin depender del DOM del app) ======

  /** Genera un SVG (texto) del código de barras (CODE128 por defecto). */
  private makeBarcodeSVG(value: string, opts: { format?: string; width?: number; height?: number; displayValue?: boolean } = {}): string {
    const v = (value || '').trim();
    if (!v) return '<svg width="1" height="1"></svg>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    try {
      JsBarcode(svg as any, v, {
        format: (opts.format as any) || 'CODE128',
        width: opts.width || 1,
        height: opts.height || 5,
        displayValue: !!opts.displayValue,
        margin: 0
      });
    } catch { }
    return svg.outerHTML;
  }

  private cssFont(el: LabelElement): string {
    const family = (el.fontFamily || 'system-ui, Arial, sans-serif').trim();
    const letter = (el.letterSpacing ?? 0);
    return `font-family:${family};line-height:1;letter-spacing:${letter}px;`;
  }

  private elToHtml(item: any, el: LabelElement): string {
    const base = `position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;`;

    // tipografía 100% inline
    const fam = (el.fontFamily || 'system-ui, Arial, sans-serif').replace(/"/g, "'");
    const font =
      `font-weight:${el.bold ? 700 : 400};` +
      `font-size:${el.fontSize || 10}px;` +
      `font-family:${fam};` +
      `letter-spacing:${(el.letterSpacing ?? 0)}px;` +
      // maquetación
      `display:flex;align-items:center;` +
      `justify-content:${el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start')};` +
      `white-space:nowrap;overflow:hidden;line-height:1;`;

    if (el.type === 'text') {
      const v = this.valorCampo(item, el);
      return `<div class="el text" style="${base}${font}">${v}</div>`;
    }
    if (el.type === 'price') {
      const v = this.valorPrecio(item, el);
      return `<div class="el price" style="${base}${font}">${v}</div>`;
    }
    if (el.type === 'barcode') {
      const valor = this.valorCampo(item, { ...el, field: 'codigoBarras' } as any).trim();
      const svg = this.makeBarcodeSVG(valor, {
        format: el.barcode?.symbology,
        width: el.barcode?.width,
        height: el.barcode?.height,
        displayValue: el.barcode?.displayValue
      });
      return `<div class="el barcode" style="${base}">${svg}</div>`;
    }
    return '';
  }


  /** Una etiqueta (UNA hoja) → HTML. */
  private labelToHtml(item: any): string {
    const pad = this.padMm;
    const inner = (this.design?.elements || []).map(el => this.elToHtml(item, el)).join('');
    return `
<section class="sheet">
  <div class="label-inner" style="position:relative;width:100%;height:100%;padding:${pad}mm">
    ${inner}
  </div>
</section>`;
  }


  // Orden
  toggleSort(field: 'nombre' | 'categoria') {
    if (this.sortBy === field) this.sortDir = (this.sortDir === 'asc') ? 'desc' : 'asc';
    else { this.sortBy = field; this.sortDir = 'asc'; }
    this.page = 1; this.buscar();
  }


  /** Normaliza los items antes de pintar (NBSP para vacíos y precio numérico). */
  private sanitizeItemsForDesign(items: any[]): any[] {
    const nb = '\u00A0';
    const clean = (v: any) => {
      const s = (v === null || v === undefined) ? '' : String(v);
      return s.trim() === '' ? nb : s;
    };

    return (items || []).map(it => ({
      ...it,
      // campos de texto que pueden venir vacíos
      nombre: clean(it?.nombre),
      renglon1: clean(it?.renglon1),
      renglon2: clean(it?.renglon2),

      // código de barras en limpio (si viene vacío, lo dejamos vacío;
      // JsBarcode se encarga; el NBSP sólo es para textos visibles)
      codigoBarras: (it?.codigoBarras ?? '').toString().trim(),

      // precio a número o null (para que valorPrecio oculte cuando no aplica)
      precioVenta:
        (it?.precioVenta === '' || it?.precioVenta === null || it?.precioVenta === undefined)
          ? null
          : (Number.isFinite(Number(it?.precioVenta)) ? Number(it?.precioVenta) : null),
    }));
  }

  private async printViaIframeStrict(html: string): Promise<void> {
    const isEdge = navigator.userAgent.toLowerCase().includes('edg/');

    if (isEdge) {
      // 1) documento completo con script de auto-print
      const doc = this.wrapForAutoPrint(html);

      // 2) mejor que about:blank → usa un blob: URL (Edge lo renderiza más estable)
      const blob = new Blob([doc], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      // 3) abre la pestaña por el gesto del usuario (ya estás en handler de botón)
      const win = window.open(url, '_blank'); // sin noopener para mantener mismo origin
      if (!win) {
        alert('Edge bloqueó la ventana emergente. Permite popups para este sitio.');
        return;
      }

      // 4) seguridad: limpia el blob cuando cierre
      const revoke = () => { try { URL.revokeObjectURL(url); } catch { } };
      try { win.addEventListener('unload', revoke, { once: true }); } catch { }
      return;
    }

    // ---- Chrome: iframe oculto (igual que ya tenías)
    const ID = 'label-print-frame';
    document.getElementById(ID)?.remove();
    const frame = document.createElement('iframe');
    frame.id = ID;
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin allow-scripts');
    frame.srcdoc = html;
    document.body.appendChild(frame);

    await new Promise<void>((resolve) => {
      const ready = () => resolve();
      frame.addEventListener('load', ready, { once: true });
      setTimeout(ready, 500);
    });

    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }
    const cleanup = () => { try { frame.remove(); } catch { } };
    try { win.addEventListener('afterprint', () => setTimeout(cleanup, 50), { once: true }); } catch { }
    try {
      const mm = win.matchMedia && win.matchMedia('print');
      mm?.addEventListener?.('change', e => { if (!e.matches) setTimeout(cleanup, 50); });
    } catch { }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { win.focus(); } catch { }
  }

  private buildPrintHTML(content: string, wmm: number, hmm: number, padmm: number): string {
    const W = Number(wmm) || 62;
    const H = Number(hmm) || 30;
    const P = Number(padmm) || 0;
    const SAFE_TOP_MM = 2;
    const SAFE_BOTTOM_MM = 2;

    const fontImports = this.collectFontImports();

    const css = `
      <style>
        @page { size: ${W}mm ${H}mm; margin: 0; }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${W}mm !important;
          height: auto !important;            /* que el body no imponga alto */
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background: #fff;
        }

        /* Cada etiqueta = 1 página */
        .sheet {
          width: ${W}mm;
          height: 100vh;                       /* === exactamente el alto de página */
          min-height: 100vh;
          max-height: 100vh;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid-page;            /* evita que se parta */
          -webkit-region-break-inside: avoid;  /* WebKit legacy */
          margin: 0; padding: 0; overflow: hidden; position: relative;
          background: #fff;
        }
        .sheet:last-child { page-break-after: auto; break-after: auto; }

        .label-inner {
          position: relative;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: calc(${P}mm + ${SAFE_TOP_MM}mm) ${P}mm calc(${P}mm + ${SAFE_BOTTOM_MM}mm) ${P}mm;

        .el { position:absolute; overflow:hidden; }
        .el.barcode svg { display:block; width:100%; height:100%; }
        .el.text, .el.price { line-height:1; white-space:nowrap; }
      </style>`;


    const js = `
      <script>
      (async function(){
        try{ if (document.fonts && document.fonts.ready) { await document.fonts.ready; } }catch(e){}
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          try{ window.focus(); }catch(e){}
          try{ window.print(); }catch(e){}
        }));
        try{
          window.addEventListener('afterprint', ()=>{ setTimeout(()=>{ try{ window.close(); }catch(e){} }, 100); }, {once:true});
        }catch(e){}
      })();
      </script>`;

    return `<!doctype html><html><head><meta charset="utf-8">${fontImports}${css}</head><body>${content}${js}</body></html>`;
  }


  async testQL() {
    const wmm = 62;
    const hmm = 20;
    const pad = 2;

    const content = `
    <section class="sheet">
      <div class="label-inner" style="position:relative;width:100%;height:100%;padding:${pad}mm">
        <div class="el" style="position:absolute;left:5%;top:20%;font-size:12px;">TEST 62×20</div>
      </div>
    </section>`;

    const html = `
  <!doctype html><html><head><meta charset="utf-8">
    <style>
      @page { size: ${wmm}mm ${hmm}mm; margin:0; }
      html,body { margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .sheet { width:${wmm}mm; height:${hmm}mm; margin:0; padding:0; overflow:hidden;
               position:relative; page-break-after:always; break-after:page; }
      .label-inner { width:100%; height:100%; position:relative; }
      .el { position:absolute; }
    </style>
  </head><body>${content}</body></html>`;

    // iframe estricto
    await new Promise<void>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
      document.body.appendChild(iframe);

      const cleanup = () => setTimeout(() => { try { iframe.remove(); } catch { } resolve(); }, 300);

      iframe.onload = async () => {
        const win = iframe.contentWindow!;
        let done = false;
        const safeDone = () => { if (!done) { done = true; cleanup(); } };
        win.addEventListener('afterprint', safeDone, { once: true });
        setTimeout(safeDone, 6000);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        try { win.focus(); } catch { }
        win.print();
      };

      iframe.srcdoc = html; // ← **NO** imprime la ruta del app
    });
  }


  private wrapForAutoPrint(htmlInner: string): string {
    return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
${htmlInner}
<script>
(function () {
  function go(){ try{ window.focus(); }catch(e){}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ try{ window.print(); }catch(e){} }));
  }
  function bye(){ setTimeout(()=>{ try{ window.close(); }catch(e){} }, 120); }
  try{ window.addEventListener('afterprint', bye, {once:true}); }catch(e){}
  try{
    var mm = window.matchMedia && window.matchMedia('print');
    if (mm && mm.addEventListener) mm.addEventListener('change', e=>{ if(!e.matches) bye(); });
  }catch(e){}
  if (document.readyState === 'complete' || document.readyState === 'interactive') go();
  else window.addEventListener('DOMContentLoaded', go, {once:true});
})();
</script>
</body></html>`;
  }


  async previsualizar() {
    if (!this.design || this.selectedIds.size === 0 || this.isPrinting) return;
    this.isPrinting = true;
    try {
      const uniq = new Map<string, any>();
      for (const it of this.selectedItems.values()) uniq.set(String(it._id), it);
      const items = this.sanitizeItemsForDesign(Array.from(uniq.values()));

      const isEdge = navigator.userAgent.toLowerCase().includes('edg/');

      if (isEdge) {
        await Swal.fire({
          icon: 'warning',
          title: 'Usa Chrome para imprimir etiquetas',
          html: `
      La impresión de etiquetas no es estable en Microsoft Edge en este equipo.<br>
      Por favor abre este módulo en <b>Google Chrome</b> y vuelve a intentarlo.
    `,
          confirmButtonText: 'Entendido'
        });
        return;
      }

      // ===== CHROME (tu flujo existente con iframe) =====
      const content = items.map(it => this.labelToHtml(it)).join('');
      const html = this.buildPrintHTML(content, this.lblWmm, this.lblHmm, this.padMm);
      await this.printViaIframeStrict(html);

    } finally {
      this.isPrinting = false;
      this.cdr.detectChanges();
    }
  }

  private collectFontImports(): string {
    const used = new Set<string>();
    (this.design?.elements || []).forEach(el => {
      const fam = (el.fontFamily || '').toLowerCase();
      if (fam.includes('inter')) used.add('Inter:wght@400;700');
      if (fam.includes('roboto')) used.add('Roboto:wght@400;700');
      if (fam.includes('lato')) used.add('Lato:wght@400;700');
      if (fam.includes('montserrat')) used.add('Montserrat:wght@400;700');
      if (fam.includes('open sans')) used.add('Open+Sans:wght@400;700');
      if (fam.includes('poppins')) used.add('Poppins:wght@400;700');
      if (fam.includes('merriweather')) used.add('Merriweather:wght@400;700');
      if (fam.includes('playfair')) used.add('Playfair+Display:wght@400;700');
      if (fam.includes('noto sans')) used.add('Noto+Sans:wght@400;700');
      if (fam.includes('noto serif')) used.add('Noto+Serif:wght@400;700');
    });
    if (!used.size) return '';
    const families = Array.from(used).join('&family=');
    return [
      `<link rel="preconnect" href="https://fonts.googleapis.com">`,
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${families}&display=swap">`
    ].join('');
  }


}
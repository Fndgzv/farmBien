import { Component, ElementRef, QueryList, ViewChild, ViewChildren, ChangeDetectorRef, AfterViewInit, NgZone } from '@angular/core';
import { LabelDesign, LabelElement } from '../../../core/models/label-design.model';
import { LabelDesignsService } from '../../../core/services/label-designs.service';
import { LabelsProductsService } from '../../../core/services/labels-products.service';
import JsBarcode from 'jsbarcode';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { Farmacia, FarmaciaService } from '../../../services/farmacia.service'
import Swal from 'sweetalert2';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-etiquetas-print',
  templateUrl: './etiquetas-print.component.html',
  styleUrls: ['./etiquetas-print.component.css'],
  standalone: true,
  imports: [FormsModule, CommonModule, DragDropModule, MatTooltipModule]
})

export class EtiquetasPrintComponent {

  isPrinting = false;

  // firma de la última búsqueda (para decidir si limpiar selección)
  private lastQuerySig = '';

  private _barcodeCache = new Map<string, string>(); // valor→dataURL
  private _transparentPx =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axu8J8AAAAASUVORK5CYII=';

  /** Espera a que todas las <img> dentro de host estén decodificadas.
   *  Chrome/Edge respetan mucho mejor decode() que sólo 'complete' + RAFs.
   */
  private async waitImagesDecoded(host: HTMLElement) {
    const imgs = Array.from(host.querySelectorAll('img')) as HTMLImageElement[];
    if (!imgs.length) return;

    // Forzamos eager + decoding sincronizado
    for (const img of imgs) {
      img.loading = 'eager';
      // @ts-ignore
      img.decoding = 'sync';
    }

    // decode() funciona muy bien con data: URLs
    await Promise.all(
      imgs.map(i => typeof i.decode === 'function' ? i.decode().catch(() => { }) : Promise.resolve())
    );
  }


  private buildBarcodeDataURL(
    value: string,
    opts: { format?: string; width?: number; height?: number; displayValue?: boolean } = {}
  ): string {
    const v = (value || '').trim();
    if (!v) return this._transparentPx;

    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, v, {
        format: (opts.format as any) || 'CODE128',
        width: opts.width || 1,
        height: opts.height || 30,
        displayValue: !!opts.displayValue,
        margin: 0
      });
      return canvas.toDataURL('image/png');
    } catch {
      // valor no compatible con el symbology, etc.
      return this._transparentPx;
    }
  }



  forceRollPreview = true;
  get lblW() { return this.design?.widthMm ?? 60; }
  get lblH() { return this.design?.heightMm ?? 30; }
  get gapX() { return this.design?.gapXmm ?? 0; }
  get gapY() { return this.design?.gapYmm ?? 0; }
  get pad() { return this.design?.marginMm ?? 0; }

  // alto total de la tira (en mm) para N etiquetas
  calcRollHeightMm(n: number) {
    if (!n) return this.lblH + 2 * this.pad;
    const total = (n * this.lblH) + ((n - 1) * this.gapY) + 2 * this.pad;
    return Math.max(total, this.lblH + 2 * this.pad);
  }

  disenos: LabelDesign[] = [];
  designId: string | null = null;
  design: LabelDesign | null = null;

  fNombre = '';
  fCategoria = '';
  productos: any[] = [];
  allChecked = false;

  mostrarPrint = false;
  itemsParaImprimir: any[] = []; // productos seleccionados (se puede multiplicar si quieres varias copias)
  farmacias: Farmacia[] = [];
  farmaciaId: string = '';


  @ViewChild('printHost') printHost!: ElementRef<HTMLElement>;
  @ViewChildren('printBarcode') printBarcodes!: QueryList<ElementRef<HTMLCanvasElement>>;

  get seleccionados() { return this.productos.filter(p => p._checked); }
  page = 1;
  limit = 20;
  totalFiltrado = 0;
  totalPages = 1;

  // Estado global de selección (todas las páginas)
  selectedIds = new Set<string>();
  selectedItems = new Map<string, any>(); // guarda el producto seleccionado tal cual llegó

  get totalSeleccionados() { return this.selectedIds.size; }

  private makeQuerySig(fid: string, nombre: string, categoria: string): string {
    const norm = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
    return `${fid}|${norm(nombre)}|${norm(categoria)}`;
  }

  private clearSelection() {
    this.selectedIds.clear();
    this.selectedItems.clear();
    this.allChecked = false;
  }


  constructor(
    private designsSvc: LabelDesignsService,
    private prodSvc: LabelsProductsService,
    private farmacia: FarmaciaService,
    private cdr: ChangeDetectorRef, private zone: NgZone
  ) { }

  ngOnInit() {
    this.designsSvc.list().subscribe(d => {
      this.disenos = d;
      if (d.length) { this.designId = d[0]._id!; this.loadDesign(); }
    });

    const last = localStorage.getItem('farmaciaId_print') || '';
    this.farmaciaId = last;
    this.cargarFarmacias();

    window.addEventListener('afterprint', () => {
      this.mostrarPrint = false;
      this.cdr.detectChanges();
    });

    this.buscar();
  }


  // Renderiza códigos como SVG inline EN EL HOST VISIBLE (sin <img>, sin dataURL)
  private renderBarcodesInline(host: HTMLElement) {
    const imgs = Array.from(host.querySelectorAll('img.barcode')) as HTMLImageElement[];
    let idx = 0;

    for (const item of this.itemsParaImprimir) {
      for (const el of this.design?.elements || []) {
        if (el.type !== 'barcode') continue;

        const img = imgs[idx++];
        if (!img) continue;

        const valor = (this.valorCampo(item, { ...el, field: 'codigoBarras' } as any) || '').trim();
        let dataUrl = this._transparentPx;

        if ((el.barcode?.symbology || 'CODE128') !== 'QR') {
          dataUrl = this.buildBarcodeDataURL(valor, {
            format: el.barcode?.symbology,
            width: el.barcode?.width,
            height: el.barcode?.height,
            displayValue: el.barcode?.displayValue
          });
        }

        img.setAttribute('loading', 'eager');
        img.setAttribute('decoding', 'sync');
        img.style.width = '100%';
        img.style.height = '100%';
        img.src = dataUrl;   // ✅ siempre algo (pixel si vacío)
        img.alt = '';
      }
    }
  }



  private buildPrintHtml(contentEl: HTMLElement): string {

    // si estamos en modo “rollo”, usamos el alto total calculado
    const pageW = this.forceRollPreview ? this.lblW : (this.design?.pageWidthMm ?? 210);
    const pageH = this.forceRollPreview
      ? this.calcRollHeightMm(this.itemsParaImprimir.length)
      : (this.design?.pageHeightMm ?? 297);

    const styles = `
  <style>
    @page { margin: 0; size: ${pageW}mm ${pageH}mm; }
    html, body { margin: 0; padding: 0; }
    .page { margin: 0 auto; overflow: hidden; }
    .labels-grid { display: grid; }
    .label-box { background:#fff; position: relative; }
    .label-inner { position: relative; width:100%; height:100%; }
    .el { position:absolute; }
    img { max-width: 100%; max-height: 100%; display: block; }
    .barcode-svg { width:100%; height:100%; display:block; }
  </style>`;
    const spacer = `<img src="${this._transparentPx}" alt="" style="width:1px;height:1px;position:absolute;left:-9999px;top:-9999px;">`;
    return `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${contentEl.outerHTML}${spacer}</body></html>`;
  }


  cargarFarmacias() {
    this.farmacia.obtenerFarmacias().subscribe({
      next: (resp) => { this.farmacias = resp || []; },
      error: () => { this.farmacias = []; }
    });
  }

  private normalizeDesign(raw: any): LabelDesign & any {
    const size = raw?.size || {};
    const layout = raw?.layout || {};

    return {
      ...raw,
      // forma plana que el componente ya espera
      widthMm: size.widthMm ?? raw.widthMm ?? 0,
      heightMm: size.heightMm ?? raw.heightMm ?? 0,
      marginMm: size.marginMm ?? raw.marginMm ?? 0,

      pageWidthMm: layout.pageWidthMm ?? raw.pageWidthMm ?? 210,
      pageHeightMm: layout.pageHeightMm ?? raw.pageHeightMm ?? 297,
      cols: layout.columns ?? raw.cols ?? 1,
      rows: layout.rows ?? raw.rows ?? 1,
      gapXmm: layout.gapXmm ?? raw.gapXmm ?? 0,
      gapYmm: layout.gapYmm ?? raw.gapYmm ?? 0,
    };
  }

  loadDesign() {
    if (!this.designId) return;
    this.designsSvc.get(this.designId).subscribe(d => {
      this.design = this.normalizeDesign(d);
    });
  }

  // en tu componente etiquetas-print
  buscar() {
    const fid = this.farmaciaId?.trim();
    if (!fid) {
      Swal.fire({
        icon: 'info',
        title: 'Aviso',
        text: 'Debes de seleccionar una farmacia.',
        timer: 1600,
        timerProgressBar: true,
        allowOutsideClick: false,
        allowEscapeKey: false
      });
      return;
    }

    const nombre = (this.fNombre || '').trim();
    const categoria = (this.fCategoria || '').trim();

    // 👇 si cambió la firma (nuevo filtro), limpiamos selección global
    const sig = this.makeQuerySig(fid, nombre, categoria);
    if (sig !== this.lastQuerySig) {
      this.clearSelection();
      this.page = 1;
      this.lastQuerySig = sig;
    }

    this.prodSvc.search({
      farmaciaId: fid,
      nombre: (this.fNombre || '').trim(),
      categoria: (this.fCategoria || '').trim(),
      page: this.page,
      limit: this.limit,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    })
      .subscribe(r => {
        this.productos = (r.rows || []).map((x: any) => {
          const id = String(x._id);                  // 👈 normaliza a string
          return {
            ...x,
            _id: id,                                 // 👈 asegura string
            _checked: this.selectedIds.has(id)       // 👈 rehidrata check
          };
        });
        // “select all” de la página actual
        this.allChecked = this.productos.length > 0 && this.productos.every(p => p._checked);

        // paginación
        this.totalFiltrado = r?.paginacion?.total ?? this.productos.length;
        this.totalPages = r?.paginacion?.totalPages ?? 1;
        this.page = r?.paginacion?.page ?? 1;
        this.limit = r?.paginacion?.limit ?? this.limit;
      });
  }

  onToggleRow(p: any) {
    const id = String(p._id);
    if (p._checked) {
      this.selectedIds.add(id);
      this.selectedItems.set(id, p);
    } else {
      this.selectedIds.delete(id);
      this.selectedItems.delete(id);
    }
    this.allChecked = this.productos.length > 0 && this.productos.every(x => this.selectedIds.has(String(x._id)));
  }

  toggleAll(ev: any) {
    this.allChecked = ev.target.checked;
    for (const p of this.productos) {
      const id = String(p._id);
      p._checked = this.allChecked;
      if (this.allChecked) {
        this.selectedIds.add(id);
        this.selectedItems.set(id, p);
      } else {
        this.selectedIds.delete(id);
        this.selectedItems.delete(id);
      }
    }
  }

  trackById = (_: number, p: any) => p?._id;

  // Si cambiaste farmacia o hiciste un nuevo filtro manual, resetea selección global
  onFarmaciaChange() {
    localStorage.setItem('farmaciaId_print', this.farmaciaId);
    this.selectedIds.clear();
    this.selectedItems.clear();
    this.page = 1;
    this.buscar();
  }

  limpiar() {
    this.fCategoria = '';
    this.fNombre = '';
    this.clearSelection();
    this.page = 1;
    this.lastQuerySig = this.makeQuerySig(this.farmaciaId?.trim() || '', '', '');
    this.buscar();
  }

  updateChecked() {
    this.seleccionados; // getter calcula
  }
  irPrimera() { if (this.page !== 1) { this.page = 1; this.buscar(); } }
  irAnterior() { if (this.page > 1) { this.page--; this.buscar(); } }
  irSiguiente() { if (this.page < this.totalPages) { this.page++; this.buscar(); } }
  irUltima() { if (this.page !== this.totalPages) { this.page = this.totalPages; this.buscar(); } }

  cambiarLimit(n: number) {
    this.limit = Number(n) || 20;
    this.page = 1;
    this.buscar();
  }

  async previsualizar() {
    if (!this.design || this.selectedIds.size === 0) return;
    if (this.isPrinting) return;
    this.isPrinting = true;

    try {
      // Dedup por _id
      const uniq = new Map<string, any>();
      for (const it of this.selectedItems.values()) uniq.set(String(it._id), it);
      this.itemsParaImprimir = this.sanitizeItemsForDesign(Array.from(uniq.values()));

      // Si todos están “incompletos”, igual seguimos (ya metemos NBSP/pixel)
      this.mostrarPrint = true;

      // deja pintar overlay
      await Promise.resolve();
      this.cdr.detectChanges();

      const host = this.printHost?.nativeElement as HTMLElement | null;
      if (!host) return;

      // 🔹 Pinta CB en el DOM VISIBLE (no clones, no iframes)
      this.renderBarcodesInline(host);

      // 🔹 Espera a que las IMG queden decodificadas + 2 RAF para composición
      await this.waitImagesDecoded(host);
      await new Promise<void>(r => requestAnimationFrame(() =>
        requestAnimationFrame(() => r())
      ));

      // 🔹 Imprime desde el DOM visible
      try { window.focus(); } catch { }

      window.print();

      // 🔹 Cierra el overlay pase lo que pase
      setTimeout(() => {
        if (this.mostrarPrint) {
          this.mostrarPrint = false;
          this.cdr.detectChanges();
        }
      }, 400);
    } finally {
      this.isPrinting = false;
    }
  }


  styleTexto(el: LabelElement) {
    return {
      position: 'absolute',
      'font-weight': el.bold ? '700' : '400',
      'font-size.px': (el.fontSize || 10),
      'text-align': el.align || 'left',
      overflow: 'hidden',
      display: 'flex',
      'align-items': 'center',
      'justify-content': el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start'),
      'white-space': 'nowrap',         // 👈 evita colapso en vacío
      'min-height.px': 1               // 👈 garantiza 1px “pintable”
    };
  }


  valorCampo(item: any, el: LabelElement) {
    const nb = '\u00A0';
    const safe = (v: any) => (v === null || v === undefined) ? '' : String(v);
    const map: Record<string, any> = {
      nombre: safe(item?.nombre),
      renglon1: safe(item?.renglon1),
      renglon2: safe(item?.renglon2),
      codigoBarras: safe(item?.codigoBarras),
      precioVenta: safe(item?.precioVenta)
    };

    let v = el.field ? (map[el.field] ?? '') : (el.text ?? '');
    if (el.uppercase && typeof v === 'string') v = v.toUpperCase();
    const out = `${el.prefix || ''}${v}${el.suffix || ''}`;
    return out.trim() === '' ? nb : out; // ✅ NBSP para Edge
  }

  private sanitizeItemsForDesign(items: any[]): any[] {
    const nb = '\u00A0';
    const cleanText = (v: any) => {
      const s = (v === null || v === undefined) ? '' : String(v);
      return s.trim() === '' ? nb : s;
    };
    return items.map(it => ({
      ...it,
      nombre: cleanText(it?.nombre),
      renglon1: cleanText(it?.renglon1),
      renglon2: cleanText(it?.renglon2),
      precioVenta: (it?.precioVenta === '' || it?.precioVenta === null || it?.precioVenta === undefined)
        ? null
        : (Number.isFinite(Number(it?.precioVenta)) ? Number(it.precioVenta) : null)
    }));
  }


  valorPrecio(item: any, el: LabelElement) {
    const raw = item?.precioVenta;
    if (raw === null || raw === undefined || raw === '') return ''; // ← no mostrar nada si no hay precio
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    const txt = (el.prefix || '$') + n.toFixed(2) + (el.suffix || '');
    return el.uppercase ? txt.toUpperCase() : txt;
  }


  private printViaIframe(html: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const cleanup = () => setTimeout(() => { try { iframe.remove(); } catch { } resolve(); }, 1200);

      const waitForImages = async (doc: Document) => {
        const imgs = Array.from(doc.images) as HTMLImageElement[];
        if (!imgs.length) return;

        // intenta decode() (rápido con dataURL); si falla, sigue con eventos
        const decodes = await Promise.allSettled(imgs.map(img => (img as any).decode?.() ?? Promise.resolve()));
        const someRejected = decodes.some(d => d.status === 'rejected');
        if (!someRejected) return;

        await new Promise<void>((res) => {
          let pending = imgs.length;
          const done = () => { if (--pending <= 0) res(); };
          for (const img of imgs) {
            if (img.complete) done();
            else {
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            }
          }
          // respaldo duro por si algún evento no llega en Edge
          setTimeout(res, 1500);
        });
      };

      const twoRafs = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      // Cargar contenido (evita about:blank popup)
      iframe.srcdoc = html;

      const onLoad = async () => {
        const win = iframe.contentWindow!;
        const doc = iframe.contentDocument!;
        if (doc.readyState !== 'complete') {
          await new Promise<void>(res => (iframe.onload = () => res()));
        }
        await waitForImages(doc);
        await twoRafs();        // asegura composición

        try {
          win.focus();
          win.print();
        } finally {
          cleanup();
        }
      };

      // si ya está listo, imprime; si no, espera load
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') onLoad();
      else iframe.addEventListener('load', onLoad, { once: true });
    });
  }

  // Estado de orden
  sortBy: 'nombre' | 'categoria' = 'nombre';
  sortDir: 'asc' | 'desc' = 'asc';

  // Cambiar orden al clickear el encabezado
  toggleSort(field: 'nombre' | 'categoria') {
    if (this.sortBy === field) {
      this.sortDir = (this.sortDir === 'asc') ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDir = 'asc';      // default al cambiar de campo
    }
    // No limpiamos selección al ordenar (sólo reconsulta)
    this.page = 1;
    this.buscar();
  }

}

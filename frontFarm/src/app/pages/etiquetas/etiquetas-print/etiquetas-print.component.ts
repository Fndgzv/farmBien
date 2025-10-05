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
  }

  private renderBarcodesIn(host: HTMLElement) {
    // Busca las <img class="barcode"> que corresponden a los elementos 'barcode'
    const imgs = Array.from(host.querySelectorAll('img.barcode')) as HTMLImageElement[];
    let idx = 0;

    for (const item of this.itemsParaImprimir) {
      for (const el of this.design?.elements || []) {
        if (el.type !== 'barcode') continue;

        const img = imgs[idx++];
        if (!img) continue;

        const valor = this.valorCampo(item, { ...el, field: 'codigoBarras' } as any) || '';

        // Si algún día soportas QR, cambia aquí por la lib correspondiente
        if ((el.barcode?.symbology || 'CODE128') === 'QR') {
          // img.src = generarQRDataUrl(valor);
          img.src = '';
          continue;
        }

        // JsBarcode soporta <img>: le pone dataURL automático al src
        JsBarcode(img, valor, {
          format: el.barcode?.symbology || 'CODE128',
          width: el.barcode?.width || 1,
          height: el.barcode?.height || 30,
          displayValue: el.barcode?.displayValue || false,
          margin: 0
        });
      }
    }
  }

  private buildPrintHtml(contentEl: HTMLElement): string {
    const styles = `
  <style>
    @page { margin: 0; }
    html, body { margin: 0; padding: 0; }
    .page { margin: 0 auto; overflow: hidden; }
    .labels-grid { display: grid; }
    .label-box { background:#fff; position: relative; }
    .label-inner { position: relative; width:100%; height:100%; }
    .el { position:absolute; }
    img { max-width: 100%; max-height: 100%; display: block; }
  </style>`;
    return `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${contentEl.outerHTML}</body></html>`;
  }

  private printViaNewWindow(html: string) {
    const printWin = window.open('', '_blank', 'width=800,height=600');
    if (!printWin) {
      alert('⚠️ El navegador bloqueó la ventana de impresión. Habilita pop-ups para continuar.');
      return;
    }

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();

    // Esperamos a que el contenido cargue bien antes de imprimir
    printWin.onload = () => {
      // Pequeño delay para asegurar render completo
      setTimeout(() => {
        printWin.focus();
        printWin.print();
        printWin.close();
      }, 300);
    };
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

    this.prodSvc.search({
      farmaciaId: fid,
      nombre: this.fNombre,
      categoria: this.fCategoria,
      page: this.page,
      limit: this.limit
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

  limpiar(){
    this.fCategoria = '';
    this.fNombre = '';
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

  private escapeHtml(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[m]
    );
  }

  private barcodeDataUrl(valor: string, symbology = 'CODE128', width = 1, height = 30, displayValue = false): string {
    const canvas = document.createElement('canvas');
    // Si el valor es vacío, evita que JsBarcode truene
    const safe = valor && String(valor).trim().length ? String(valor) : '000000000000';
    JsBarcode(canvas, safe, {
      format: symbology as any,
      width,
      height,
      displayValue,
      margin: 0
    });
    return canvas.toDataURL('image/png');
  }

  previsualizar() {
    if (!this.design || this.selectedIds.size === 0) return;

    this.itemsParaImprimir = Array.from(this.selectedItems.values());

    this.mostrarPrint = true;

    setTimeout(() => {
      this.cdr.detectChanges();

      const host = this.printHost?.nativeElement as HTMLElement;
      if (!host) return;

      // Clonamos el host visible de impresión
      const clone = host.cloneNode(true) as HTMLElement;

      // 1) Pintar códigos de barras directamente en las <img> del CLON

      console.log(this.itemsParaImprimir[0]);

      this.renderBarcodesIn(clone);

      // 2) Imprimir esperando a que las imágenes estén listas
      const html = this.buildPrintHtml(clone);
      this.printViaNewWindow(html);

      // 3) Cerrar overlay
      setTimeout(() => {
        this.mostrarPrint = false;
        this.cdr.detectChanges();
      }, 300);
    }, 0);
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
      'justify-content': el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start')
    };
  }

  valorCampo(item: any, el: LabelElement) {
    const map: Record<string, any> = {
      nombre: item.nombre,
      renglon1: item.renglon1,
      renglon2: item.renglon2,
      codigoBarras: item.codigoBarras,
      precioVenta: item.precioVenta
    };
    let v = (el.field && map[el.field] != null)
      ? map[el.field]
      : (el.text || ''); if (el.uppercase && typeof v === 'string') v = v.toUpperCase();
    return `${el.prefix || ''}${v}${el.suffix || ''}`;
  }

  valorPrecio(item: any, el: LabelElement) {
    const val = item.precioVenta ?? 0;
    const txt = (el.prefix || '$') + Number(val).toFixed(2) + (el.suffix || '');
    return el.uppercase ? txt.toUpperCase() : txt;
  }

}

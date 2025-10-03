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

@Component({
  selector: 'app-etiquetas-print',
  templateUrl: './etiquetas-print.component.html',
  styleUrls: ['./etiquetas-print.component.css'],
  standalone: true,
  imports: [FormsModule, CommonModule, DragDropModule]
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

  @ViewChildren('printBarcode') printBarcodes!: QueryList<ElementRef<SVGElement>>;
  @ViewChild('printHost') printHost!: ElementRef<HTMLElement>;
  
  constructor(
    private designsSvc: LabelDesignsService,
    private prodSvc: LabelsProductsService,
    private farmacia: FarmaciaService,
    private cdr: ChangeDetectorRef, private zone: NgZone
  ) { }

  ngAfterViewInit() {
    // por si se abre impresión muy rápido; no hace nada si no hay SVGs todavía
    this.renderPrintBarcodes();
  }

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

  private renderPrintBarcodes() {
    const svgs = this.printBarcodes?.toArray() || [];
    let idx = 0;

    for (const item of this.itemsParaImprimir) {
      for (const el of this.design?.elements || []) {
        if (el.type !== 'barcode') continue;
        const svg = svgs[idx++]?.nativeElement;
        if (!svg) continue;

        const valor = this.valorCampo(item, { ...el, field: 'codigoBarras' } as any) || '';
        if ((el.barcode?.symbology || 'CODE128') === 'QR') {
          svg.innerHTML = ''; // (pendiente lib QR)
          continue;
        }

        JsBarcode(svg, valor, {
          format: el.barcode?.symbology || 'CODE128',
          width: el.barcode?.width || 1,
          height: el.barcode?.height || 30,
          displayValue: el.barcode?.displayValue || false,
          margin: 0
        });
      }
    }
  }

private svgToDataUrl(svg: Element): string {
  const xml = new XMLSerializer().serializeToString(svg as SVGElement);
  const encoded = window.btoa(unescape(encodeURIComponent(xml)));
  return `data:image/svg+xml;base64,${encoded}`;
}

  private replaceBarcodesWithImages(host: HTMLElement) {
    const svgs = Array.from(host.querySelectorAll('svg.barcode'));
    for (const svg of svgs) {
      const img = document.createElement('img');
      img.src = this.svgToDataUrl(svg);
      img.style.width = (svg as any).style?.width || '100%';
      img.style.height = (svg as any).style?.height || '100%';
      svg.replaceWith(img);
    }
  }

  private buildPrintHtml(contentEl: HTMLElement): string {
    // incluye estilos mínimos para la página de impresión
    const styles = `
    <style>
      @page { margin: 0; }
      html, body { margin: 0; padding: 0; }
      .page { margin: 0 auto; }
      .labels-grid { display: grid; }
      .label-box { background:#fff; position: relative; }
      .label-inner { position: relative; width:100%; height:100%; }
      .el { position:absolute; }
    </style>
  `;
    return `<!doctype html>
<html>
<head><meta charset="utf-8">${styles}</head>
<body>${contentEl.outerHTML}</body>
</html>`;
  }

  private printViaIframe(html: string) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // espera a que el iframe procese layout
    setTimeout(() => {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      // limpiar
      setTimeout(() => document.body.removeChild(iframe), 500);
    }, 50);
  }

  cargarFarmacias() {
    this.farmacia.obtenerFarmacias().subscribe({
      next: (resp) => { this.farmacias = resp || []; },
      error: () => { this.farmacias = []; }
    });
  }

  onFarmaciaChange() {
    // persistir el idFarmacia para esta pantalla
    localStorage.setItem('farmaciaId_print', this.farmaciaId);
  }

  loadDesign() {
    if (!this.designId) return;
    this.designsSvc.get(this.designId).subscribe(d => this.design = d);
  }

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
    this.prodSvc.search({ farmaciaId: fid, nombre: this.fNombre, categoria: this.fCategoria, limit: 200 })
      .subscribe(r => { this.productos = r.rows.map(x => ({ ...x, _checked: false })); this.allChecked = false; });
  }

  toggleAll(ev: any) {
    this.allChecked = ev.target.checked;
    this.productos.forEach(p => p._checked = this.allChecked);
  }
  updateChecked() {
    this.seleccionados; // getter calcula
  }

  get seleccionados() { return this.productos.filter(p => p._checked); }

  previsualizar() {
    if (!this.design || this.seleccionados.length === 0) return;

    // preparar data…
    this.mostrarPrint = true;

    // Espera a que Angular pinte el overlay
    setTimeout(() => {
      this.cdr.detectChanges();

      // 1) Render barcodes en el DOM de impresión
      this.renderPrintBarcodes();
      this.cdr.detectChanges();

      // 2) Clonar el host, reemplazar SVGs por IMG dataURL, e imprimir en iframe
      const clone = this.printHost.nativeElement.cloneNode(true) as HTMLElement;
      this.replaceBarcodesWithImages(clone);
      const html = this.buildPrintHtml(clone);

      // 3) Imprimir en iframe (sin bloquear la app)
      this.printViaIframe(html);

      // 4) Cerrar overlay al terminar (afterprint del window principal no se dispara para el iframe)
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

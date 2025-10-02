import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { LabelDesign, LabelElement } from '../../../core/models/label-design.model';
import { LabelDesignsService } from '../../../core/services/label-designs.service';
import JsBarcode from 'jsbarcode';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-label-designer',
  templateUrl: './label-designer.component.html',
  styleUrls: ['./label-designer.component.css'],
  standalone: true,
  imports: [ FormsModule, CommonModule, DragDropModule ]
})
export class LabelDesignerComponent {
  design: LabelDesign = this.blank();
  disenos: LabelDesign[] = [];
  selected: LabelElement | null = null;

  @ViewChildren('barcodeSvg') barcodeSvgs!: QueryList<ElementRef<SVGElement>>;

  constructor(private svc: LabelDesignsService) {}

  ngOnInit() { this.refreshList(); }

  blank(): LabelDesign {
    return {
      nombre: 'Nuevo diseño',
      size: { widthMm: 50, heightMm: 30, marginMm: 2 },
      layout: { pageWidthMm: 210, pageHeightMm: 297, columns: 4, rows: 8, gapXmm: 2, gapYmm: 2 },
      elements: []
    };
  }

  refreshList() { this.svc.list().subscribe(d => this.disenos = d); }
  load(d: LabelDesign) { this.design = JSON.parse(JSON.stringify(d)); this.selected = null; setTimeout(()=>this.renderBarcodes(),0); }
  nuevo() { this.design = this.blank(); this.selected = null; }

  addText(field: LabelElement['field']) {
    this.design.elements.push({ type: 'text', field, x: 5, y: 5, w: 60, h: 10, fontSize: 9, align:'left', bold:false, uppercase:false, prefix:'', suffix:'' });
  }
  addPrice() {
    this.design.elements.push({ type: 'price', field: 'precioVenta', x: 5, y: 20, w: 60, h: 15, fontSize: 16, align:'left', bold:true, prefix:'$' });
  }
  addBarcode() {
    this.design.elements.push({ type: 'barcode', field: 'codigoBarras', x: 5, y: 40, w: 80, h: 25, barcode: { symbology:'CODE128', width:1, height:30, displayValue:false } });
    setTimeout(()=>this.renderBarcodes(),0);
  }

  deleteSelected() {
    if (!this.selected) return;
    this.design.elements = this.design.elements.filter(e => e !== this.selected);
    this.selected = null;
  }

  onDragEnd(ev: any, el: LabelElement) {
    // Convertimos px a % respecto al contenedor; más sencillo: usamos boundingClientRect
    const host: HTMLElement = (ev.source.element.nativeElement as HTMLElement).parentElement!;
    const rect = host.getBoundingClientRect();
    const pos = ev.source.getFreeDragPosition();
    el.x = Math.max(0, Math.min(100, (pos.x / rect.width) * 100));
    el.y = Math.max(0, Math.min(100, (pos.y / rect.height) * 100));
  }

  textStyle(el: LabelElement) {
    return {
      'font-weight': el.bold ? '700' : '400',
      'font-size.px': (el.fontSize || 10),
      'text-align': el.align || 'left',
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': el.align === 'center' ? 'center' : (el.align==='right'?'flex-end':'flex-start'),
      'overflow': 'hidden',
      'white-space': 'nowrap'
    };
  }

  sampleValue(el: LabelElement) {
    const map = {
      nombre: 'Paracetamol 500mg 24 tabs',
      renglon1: 'Caja c/24',
      renglon2: 'Lote A123',
      codigoBarras: '7501234567890',
      precioVenta: '123.45',
      custom: el.text || 'Texto fijo'
    } as any;

    let v = map[el.field || 'nombre'] || '';
    if (el.uppercase) v = String(v).toUpperCase();
    return `${el.prefix || ''}${v}${el.suffix || ''}`;
  }

  formatPrice(val: number, el: LabelElement) {
    const v = (el.prefix || '$') + val.toFixed(2);
    return el.uppercase ? v.toUpperCase() : v;
  }

  renderBarcodes() {
    const values = this.barcodeSvgs.toArray();
    this.design.elements.forEach((el, idx) => {
      if (el.type !== 'barcode') return;
      const svg = values.shift()?.nativeElement;
      if (!svg) return;
      const valor = this.sampleValue({ ...el, field: 'codigoBarras' } as any);
      if (el.barcode?.symbology === 'QR') {
        // Para QR, más adelante (otra lib). Nos quedamos con CODE128/EAN para empezar.
        svg.innerHTML = ''; // placeholder
        return;
      }
      JsBarcode(svg, valor, {
        format: el.barcode?.symbology || 'CODE128',
        width: el.barcode?.width || 1,
        height: el.barcode?.height || 30,
        displayValue: el.barcode?.displayValue || false,
        margin: 0
      });
    });
  }

  save() {
    if (this.design._id) {
      this.svc.update(this.design._id, this.design).subscribe(d => { this.design = d; this.refreshList(); });
    } else {
      this.svc.create(this.design).subscribe(d => { this.design = d; this.refreshList(); });
    }
  }

  remove(d: LabelDesign, ev: MouseEvent) {
    ev.stopPropagation();
    if (!confirm(`¿Eliminar diseño "${d.nombre}"?`)) return;
    this.svc.remove(d._id!).subscribe(() => this.refreshList());
  }
}

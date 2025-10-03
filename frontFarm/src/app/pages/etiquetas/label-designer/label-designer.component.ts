import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { LabelDesign, LabelElement } from '../../../core/models/label-design.model';
import { LabelDesignsService } from '../../../core/services/label-designs.service';
import JsBarcode from 'jsbarcode';

@Component({
  selector: 'app-label-designer',
  standalone: true,
  templateUrl: './label-designer.component.html',
  styleUrls: ['./label-designer.component.css'],
  imports: [ FormsModule, CommonModule, DragDropModule ]
})
export class LabelDesignerComponent {
  design: LabelDesign = this.blankDesign();
  disenos: LabelDesign[] = [];
  selected: LabelElement | null = null;

  @ViewChildren('barcodeSvg') barcodeSvgs!: QueryList<ElementRef<SVGElement>>;

  constructor(private svc: LabelDesignsService) {}

  ngOnInit() { this.refreshList(); }

  blankDesign(): LabelDesign {
    return {
      nombre: '',
      widthMm: 50,
      heightMm: 30,
      marginMm: 2,
      gapXmm: 2,
      gapYmm: 2,
      cols: 3,
      rows: 8,
      elements: []
    };
  }

  refreshList() {
    this.svc.list().subscribe(d => this.disenos = d || []);
  }

  load(d: LabelDesign) {
    if (d?._id) {
      this.svc.get(d._id).subscribe(full => this.design = full);
    } else {
      this.design = { ...d }; // fallback
    }
  }

  nuevo() {
    this.design = this.blankDesign();
    this.selected = null;
  }

  addText(field: NonNullable<LabelElement['field']>) {
    this.design.elements.push({
      type: 'text',
      field,
      x: 5, y: 5, w: 60, h: 10,
      fontSize: 9,
      align:'left',
      bold:false,
      uppercase:false,
      prefix:'',
      suffix:''
    });
  }

  addPrice() {
    this.design.elements.push({
      type: 'price',
      field: 'precioVenta',
      x: 5, y: 20, w: 60, h: 15,
      fontSize: 16, align:'left', bold:true, prefix:'$'
    });
  }

  addBarcode() {
    this.design.elements.push({
      type: 'barcode',
      field: 'codigoBarras',
      x: 5, y: 40, w: 80, h: 25,
      barcode: { symbology:'CODE128', width:1, height:30, displayValue:false }
    });
    setTimeout(() => this.renderBarcodes(), 0);
  }

  deleteSelected() {
    if (!this.selected) return;
    this.design.elements = this.design.elements.filter(e => e !== this.selected);
    this.selected = null;
  }

  onDragEnd(ev: any, el: LabelElement) {
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
    const map: any = {
      nombre: 'Ciprofloxacino 3.5 mg / Dexametasona 1 mg / 1 mL SONS C/5 mL Sol Oftalmica',
      renglon1: 'Ciprofloxacino / Dexametasona',
      renglon2: '3.5 mg /1 mg / 1 mL C/5 mL',
      codigoBarras: '7501234567890',
      precioVenta: '123.45',
      custom: el.text || 'Texto fijo'
    };

    const key = el.field || 'nombre';
    let v = map[key] || '';
    if (el.uppercase) v = String(v).toUpperCase();
    return `${el.prefix || ''}${v}${el.suffix || ''}`;
  }

  formatPrice(val: number, el: LabelElement) {
    const v = (el.prefix || '$') + Number(val || 0).toFixed(2);
    return el.uppercase ? v.toUpperCase() : v;
  }

  renderBarcodes() {
    const svgs = this.barcodeSvgs.toArray();
    let idxSvg = 0;
    this.design.elements.forEach((el) => {
      if (el.type !== 'barcode') return;
      const svg = svgs[idxSvg++]?.nativeElement;
      if (!svg) return;

      if (el.barcode?.symbology === 'QR') {
        svg.innerHTML = ''; // placeholder; futuro usar librería QR
        return;
      }

      const valor = this.sampleValue({ ...el, field: 'codigoBarras' });
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
    const d = this.design;
    if (!d || !d.nombre?.trim()) {
      alert('Ponle un nombre al diseño.');
      return;
    }
    if (!d.widthMm || !d.heightMm) {
      alert('Define el tamaño de la etiqueta (ancho/alto en mm).');
      return;
    }
    if (!Array.isArray(d.elements)) d.elements = [];

    const req$ = d._id ? this.svc.update(d._id, d) : this.svc.create(d);
    req$.subscribe({
      next: resp => { this.design = resp; this.refreshList(); },
      error: err => {
        console.error('Error al guardar diseño', err);
        const msg = err?.error?.error || err?.error?.mensaje || err?.message || 'No se pudo guardar el diseño';
        alert(msg);
      }
    });
  }

  remove(d: LabelDesign, ev: MouseEvent) {
    ev.stopPropagation();
    if (!d._id) return;
    if (!confirm(`¿Eliminar diseño "${d.nombre}"?`)) return;
    this.svc.remove(d._id).subscribe(() => this.refreshList());
  }
}

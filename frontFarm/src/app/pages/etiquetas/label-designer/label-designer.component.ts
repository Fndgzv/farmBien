import { Component, ElementRef, QueryList, ViewChildren, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { LabelDesign, LabelElement } from '../../../core/models/label-design.model';
import { LabelDesignsService } from '../../../core/services/label-designs.service';
import JsBarcode from 'jsbarcode';
import Swal from 'sweetalert2';

type ApiDesign = any;

@Component({
  selector: 'app-label-designer',
  standalone: true,
  templateUrl: './label-designer.component.html',
  styleUrls: ['./label-designer.component.css'],
  imports: [FormsModule, CommonModule, DragDropModule]
})
export class LabelDesignerComponent {
  design: LabelDesign = this.blankDesign();
  disenos: LabelDesign[] = [];
  selected: LabelElement | null = null;

  zoom = 2;           // 🔎 escala 200%
  gridStep = 1;       // 🔳 snap a 1% (ajustable)

  @ViewChildren('barcodeSvg') barcodeSvgs!: QueryList<ElementRef<SVGElement>>;

  constructor(private svc: LabelDesignsService) { }

  ngOnInit() { this.refreshList(); }

  private fromApi(doc: ApiDesign): LabelDesign {
    return {
      _id: doc._id,
      nombre: doc.nombre ?? '',
      // etiqueta
      widthMm: doc.size?.widthMm ?? doc.widthMm ?? 50,
      heightMm: doc.size?.heightMm ?? doc.heightMm ?? 30,
      marginMm: doc.size?.marginMm ?? doc.marginMm ?? 2,
      // hoja
      pageWidthMm: doc.layout?.pageWidthMm ?? doc.pageWidthMm ?? 210,
      pageHeightMm: doc.layout?.pageHeightMm ?? doc.pageHeightMm ?? 297,
      cols: doc.layout?.columns ?? doc.cols ?? 4,
      rows: doc.layout?.rows ?? doc.rows ?? 8,
      gapXmm: doc.layout?.gapXmm ?? doc.gapXmm ?? 2,
      gapYmm: doc.layout?.gapYmm ?? doc.gapYmm ?? 2,
      // dos columnas (opcional)
      twoCols: doc.twoCols ?? false,
      splitPct: doc.splitPct ?? 50,
      // elementos
      elements: (doc.elements || []).map((e: any) => ({
        type: e.type,
        field: e.field ?? 'nombre',
        text: e.text ?? '',
        x: e.x ?? 5, y: e.y ?? 5, w: e.w ?? 50, h: e.h ?? 10,
        fontSize: e.fontSize ?? 10,
        bold: !!e.bold,
        align: e.align ?? 'left',
        uppercase: !!e.uppercase,
        prefix: e.prefix ?? '',
        suffix: e.suffix ?? '',
        barcode: e.barcode
          ? {
            symbology: e.barcode.symbology ?? 'CODE128',
            width: e.barcode.width ?? 1,
            height: e.barcode.height ?? 30,
            displayValue: e.barcode.displayValue ?? true
          }
          : { symbology: 'CODE128', width: 1, height: 30, displayValue: true }
      }))
    };
  }


  blankDesign(): LabelDesign {
    return {
      nombre: '',
      widthMm: 50, heightMm: 30, marginMm: 2,
      pageWidthMm: 210, pageHeightMm: 297,
      cols: 4, rows: 8, gapXmm: 2, gapYmm: 2,
      twoCols: false, splitPct: 50,
      mode: 'sheet',     // 👈 default
      rollGapMm: 0,      // 👈 default
      elements: []
    };
  }

  refreshList() {
    this.svc.list().subscribe(docs => {
      const arr = docs || [];
      this.disenos = arr.map(x => this.fromApi(x));
    });
  }

  private normalizeDesign(d: any): LabelDesign {
    return {
      _id: d?._id,
      nombre: d?.nombre ?? '',
      widthMm: d?.widthMm ?? d?.size?.widthMm ?? 50,
      heightMm: d?.heightMm ?? d?.size?.heightMm ?? 30,
      marginMm: d?.marginMm ?? d?.size?.marginMm ?? 2,
      pageWidthMm: d?.pageWidthMm ?? d?.layout?.pageWidthMm ?? 210,
      pageHeightMm: d?.pageHeightMm ?? d?.layout?.pageHeightMm ?? 297,
      cols: d?.cols ?? d?.layout?.columns ?? 3,
      rows: d?.rows ?? d?.layout?.rows ?? 8,
      gapXmm: d?.gapXmm ?? d?.layout?.gapXmm ?? 2,
      gapYmm: d?.gapYmm ?? d?.layout?.gapYmm ?? 2,
      mode: d?.mode ?? 'sheet',
      rollGapMm: d?.rollGapMm ?? 0,
      elements: d?.elements ?? []
    };
  }

  ngAfterViewInit() {
    // Llama una vez cuando ya hay vista
    setTimeout(() => this.renderBarcodes(), 0);

    // Vuelve a renderizar cada vez que cambia la lista de <svg #barcodeSvg>
    this.barcodeSvgs.changes.subscribe(() => {
      this.renderBarcodes();
    });
  }

  load(d: LabelDesign) {
    if (d?._id) {
      this.svc.get(d._id).subscribe(full => {
        this.design = this.normalizeDesign(full);
        // Espera a que el *ngFor pinte los SVG y luego renderiza
        setTimeout(() => this.renderBarcodes(), 0);
      });
    } else {
      this.design = this.normalizeDesign(d);
      setTimeout(() => this.renderBarcodes(), 0);
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
      fontSize: 11, align: 'left', bold: false,
      uppercase: false, prefix: '', suffix: ''
    });
  }

  addPrice() {
    this.design.elements.push({
      type: 'price',
      field: 'precioVenta',
      x: 5, y: 20, w: 60, h: 15,
      fontSize: 16, align: 'left', bold: true, prefix: '$',
      uppercase: false, suffix: ''
    });
  }

  addBarcode() {
    this.design.elements.push({
      type: 'barcode',
      field: 'codigoBarras',
      x: 5, y: 40, w: 80, h: 25,
      barcode: { symbology: 'CODE128', width: 1, height: 30, displayValue: true } // 👈 muestra número
    });
    setTimeout(() => this.renderBarcodes(), 0);
  }

  deleteSelected() {
    if (!this.selected) return;
    this.design.elements = this.design.elements.filter(e => e !== this.selected);
    this.selected = null;
  }

  // drag con límite al contenedor y snap a grilla, usando bounding rect
  onDragEnd(ev: any, el: LabelElement) {
    const elRef = ev.source.element.nativeElement as HTMLElement;
    const container = elRef.closest('.label-inner') as HTMLElement;
    const cRect = container.getBoundingClientRect();
    const eRect = elRef.getBoundingClientRect();

    const leftPx = eRect.left - cRect.left;
    const topPx = eRect.top - cRect.top;

    const pctX = (leftPx / container.clientWidth) * 100;
    const pctY = (topPx / container.clientHeight) * 100;

    // snap
    const snap = (v: number) => Math.round(v / this.gridStep) * this.gridStep;

    el.x = Math.max(0, Math.min(100 - (el.w ?? 0), snap(pctX)));
    el.y = Math.max(0, Math.min(100 - (el.h ?? 0), snap(pctY)));

    // resetea el transform del drag (para que no “salte” en el siguiente drag)
    ev.source.reset();
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
      'justify-content': el.align === 'center' ? 'center' : (el.align === 'right' ? 'flex-end' : 'flex-start'),
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
    const v = (el.prefix || '$') + Number(val || 0).toFixed(2) + (el.suffix || '');
    return el.uppercase ? v.toUpperCase() : v;
  }

  renderBarcodes() {
    const svgs = this.barcodeSvgs?.toArray() || [];
    let idxSvg = 0;
    this.design.elements.forEach((el) => {
      if (el.type !== 'barcode') return;
      const svg = svgs[idxSvg++]?.nativeElement;
      if (!svg) return;

      if (el.barcode?.symbology === 'QR') {
        svg.innerHTML = ''; // futuro: librería QR
        return;
      }
      const valor = this.sampleValue({ ...el, field: 'codigoBarras' });
      JsBarcode(svg, valor, {
        format: el.barcode?.symbology || 'CODE128',
        width: el.barcode?.width || 1,
        height: el.barcode?.height || 30,
        displayValue: el.barcode?.displayValue ?? true,
        margin: 0
      });
    });
  }

  save() {
    const d = this.design;
    if (!d || !d.nombre?.trim()) {
      Swal.fire('Falta nombre', 'Ponle un nombre al diseño.', 'info');
      return;
    }
    if (!d.widthMm || !d.heightMm) {
      Swal.fire('Tamaño incompleto', 'Define ancho/alto de la etiqueta (mm).', 'info');
      return;
    }
    if (!Array.isArray(d.elements)) d.elements = [];

    const payload = {
      ...d,
      size: {
        widthMm: d.widthMm,
        heightMm: d.heightMm,
        marginMm: d.marginMm ?? 0
      },
      layout: {
        pageWidthMm: d.pageWidthMm ?? 210,
        pageHeightMm: d.pageHeightMm ?? 297,
        columns: d.cols ?? 1,
        rows: d.rows ?? 1,
        gapXmm: d.gapXmm ?? 0,
        gapYmm: d.gapYmm ?? 0
      }
    };

    const req$ = d._id ? this.svc.update(d._id, payload) : this.svc.create(payload);

    req$.subscribe({
      next: respApi => {
        this.design = this.fromApi(respApi);
        this.refreshList();
        Swal.fire({ icon: 'success', title: 'Guardado', timer: 1200, showConfirmButton: false });
      },
      error: err => {
        console.error('Error al guardar diseño', err);
        const msg = err?.error?.error || err?.error?.mensaje || err?.message || 'No se pudo guardar el diseño';
        Swal.fire('Error', msg, 'error');
      }
    });
  }

  remove(d: LabelDesign, ev?: MouseEvent) {
    ev?.stopPropagation();
    if (!d?._id) return;

    Swal.fire({
      title: '¿Eliminar diseño?',
      html: `<b>${d.nombre}</b> se eliminará de forma permanente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      focusCancel: true
    }).then(res => {
      if (!res.isConfirmed) return;

      this.svc.remove(d._id!).subscribe({
        next: () => {
          if (this.design?._id === d._id) this.nuevo();
          this.refreshList();
          Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1200, showConfirmButton: false });
        },
        error: (err) => {
          console.error('Error eliminando diseño', err);
          Swal.fire('Error', 'No se pudo eliminar el diseño.', 'error');
        }
      });
    });
  }
}


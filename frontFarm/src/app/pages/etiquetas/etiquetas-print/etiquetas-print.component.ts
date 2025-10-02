import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { LabelDesign, LabelElement } from '../../../core/models/label-design.model';
import { LabelDesignsService } from '../../../core/services/label-designs.service';
import { LabelsProductsService } from '../../../core/services/labels-products.service';
import JsBarcode from 'jsbarcode';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-etiquetas-print',
  templateUrl: './etiquetas-print.component.html',
  styleUrls: ['./etiquetas-print.component.css'],
  standalone: true,
  imports: [ FormsModule, CommonModule, DragDropModule ]
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

  @ViewChildren('printBarcode') printBarcodes!: QueryList<ElementRef<SVGElement>>;

  constructor(
    private designsSvc: LabelDesignsService,
    private prodSvc: LabelsProductsService
  ) {}

  ngOnInit() {
    this.designsSvc.list().subscribe(d => {
      this.disenos = d;
      if (d.length) { this.designId = d[0]._id!; this.loadDesign(); }
    });
  }

  loadDesign() {
    if (!this.designId) return;
    this.designsSvc.get(this.designId).subscribe(d => this.design = d);
  }

  buscar() {
    const farmaciaId = localStorage.getItem('farmaciaId') || ''; // según tu flujo
    this.prodSvc.search({ farmaciaId, nombre: this.fNombre, categoria: this.fCategoria, limit: 200 })
      .subscribe(r => { this.productos = r.rows.map(x => ({...x, _checked:false})); this.allChecked=false; });
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
    this.itemsParaImprimir = [...this.seleccionados]; // aquí podrías replicar por n-copias
    this.mostrarPrint = true;
    setTimeout(()=>{ this.renderBarcodes(); window.print(); this.mostrarPrint=false; }, 50);
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
      'justify-content': el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start')
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
    let v = el.field==='custom' ? (el.text || '') : (map[el.field||'nombre'] ?? '');
    if (el.uppercase && typeof v === 'string') v = v.toUpperCase();
    return `${el.prefix||''}${v}${el.suffix||''}`;
  }

  valorPrecio(item:any, el: LabelElement) {
    const val = item.precioVenta ?? 0;
    const txt = (el.prefix || '$') + Number(val).toFixed(2) + (el.suffix||'');
    return el.uppercase ? txt.toUpperCase() : txt;
  }

  renderBarcodes() {
    if (!this.design) return;
    let idxSvg = 0;
    this.itemsParaImprimir.forEach(item => {
      this.design!.elements.forEach(el => {
        if (el.type !== 'barcode') return;
        const svg = this.printBarcodes.get(idxSvg++)?.nativeElement;
        if (!svg) return;
        const value = String(item.codigoBarras || '');
        if (!value) { svg.innerHTML=''; return; }
        if (el.barcode?.symbology === 'QR') {
          // (opcional) Implementar QR con otra librería
          svg.innerHTML = ''; return;
        }
        JsBarcode(svg, value, {
          format: el.barcode?.symbology || 'CODE128',
          width: el.barcode?.width || 1,
          height: el.barcode?.height || 30,
          displayValue: el.barcode?.displayValue || false,
          margin: 0
        });
      });
    });
  }
}

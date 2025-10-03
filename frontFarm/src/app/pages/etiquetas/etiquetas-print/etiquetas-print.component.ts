import { Component, ElementRef, QueryList, ViewChildren, ChangeDetectorRef, AfterViewInit } from '@angular/core';
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

  constructor(
    private designsSvc: LabelDesignsService,
    private prodSvc: LabelsProductsService,
    private farmacia: FarmaciaService,
    private cdr: ChangeDetectorRef
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

    // recorre tus items y elementos del diseño en el mismo orden que en el template
    for (const item of this.itemsParaImprimir) {
      for (const el of this.design?.elements || []) {
        if (el.type !== 'barcode') continue;
        const svg = svgs[idx++]?.nativeElement;
        if (!svg) continue;

        const valor = this.valorCampo(item, { ...el, field: 'codigoBarras' } as any) || '';
        if ((el.barcode?.symbology || 'CODE128') === 'QR') {
          svg.innerHTML = ''; // (pendiente: lib QR)
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

    // arma itemsParaImprimir como ya lo haces…
    this.mostrarPrint = true;

    // espera a que Angular pinte el overlay
    setTimeout(() => {
      // fuerza un ciclo de CD para que ViewChildren detecte los SVGs
      this.cdr.detectChanges();

      // dibuja los barcodes en la vista de impresión
      this.renderPrintBarcodes();

      // espera un frame y luego dispara la impresión
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.print();
        }, 50);
      });
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

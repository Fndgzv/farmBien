import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Producto, Lote } from '../../../models/producto.model';

@Component({
  selector: 'app-modal-editar-producto',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './modal-editar-producto.component.html',
  styleUrls: ['./modal-editar-producto.component.css']
})
export class ModalEditarProductoComponent implements OnInit {

  formulario!: FormGroup;

  @Output() guardar = new EventEmitter<Producto>();
  @Output() cerrar = new EventEmitter<void>();

  constructor(
    private fb: FormBuilder,
    @Inject('PRODUCTO_DATA') public producto: Producto
  ) {}

ngOnInit(): void {
  this.formulario = this.fb.group({
    nombre: [this.producto.nombre, [Validators.required]],
    precio: [this.producto.precio, [Validators.required, Validators.min(0)]],
    costo: [this.producto.costo, [Validators.required, Validators.min(0)]],
    iva: [this.producto.iva],
    descuentoINAPAM: [this.producto.descuentoINAPAM],
    stockMinimo: [this.producto.stockMinimo, [Validators.required, Validators.min(0)]],
    stockMaximo: [this.producto.stockMaximo, [Validators.required, Validators.min(0)]],
    lotes: this.fb.array(this.producto.lotes.map(l => this.crearLoteForm(l))),
    promosPorDia: this.fb.group(this.inicializarPromosPorDia()),
    promoCantidadRequerida: [this.producto.promoCantidadRequerida],
    inicioPromoCantidad: [this.formatDate(this.producto.inicioPromoCantidad)],
    finPromoCantidad: [this.formatDate(this.producto.finPromoCantidad)],
    promoDeTemporada: this.fb.group({
      porcentaje: [this.producto.promoDeTemporada?.porcentaje, [Validators.min(0), Validators.max(100)]],
      inicio: [this.formatDate(this.producto.promoDeTemporada?.inicio)],
      fin: [this.formatDate(this.producto.promoDeTemporada?.fin)],
      monedero: [this.producto.promoDeTemporada?.monedero]
    })
  }, { validators: this.validarFechasGlobales() });
}

validarFechasGlobales() {
  return (form: FormGroup) => {
    const inicio = new Date(form.get('inicioPromoCantidad')?.value);
    const fin = new Date(form.get('finPromoCantidad')?.value);

    if (inicio && fin && inicio > fin) {
      return { fechasInvalidas: true };
    }
    return null;
  }
}


  inicializarPromosPorDia() {
  const promos: any = {};
  const dias = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

  dias.forEach(dia => {
    const key = `promo${dia}` as keyof Producto;
    const promo = this.producto[key] as any;

    promos[key] = this.fb.group({
      porcentaje: [promo?.porcentaje ?? 0],
      inicio: [this.formatDate(promo?.inicio)],
      fin: [this.formatDate(promo?.fin)],
      monedero: [promo?.monedero ?? false]
    });
  });

  return promos;
}

crearLoteForm(lote: Lote): FormGroup {
  return this.fb.group({
    _id: [lote._id],
    lote: [lote.lote, Validators.required],
    fechaCaducidad: [this.formatDate(lote.fechaCaducidad), Validators.required],
    cantidad: [lote.cantidad, [Validators.required, Validators.min(0)]]
  });
}


  get lotesFormArray(): FormArray {
    return this.formulario.get('lotes') as FormArray;
  }

  agregarLote() {
    const nuevoLote: Lote = {
      lote: '',
      fechaCaducidad: new Date(),
      cantidad: 0
    };
    this.lotesFormArray.push(this.crearLoteForm(nuevoLote));
  }

  eliminarLote(index: number) {
    this.lotesFormArray.removeAt(index);
  }

  guardarProducto() {
    const formValue = this.formulario.value;
    const productoActualizado: Producto = {
      ...this.producto,
      ...formValue,
      lotes: formValue.lotes.map((l: any) => ({
        ...l,
        fechaCaducidad: new Date(l.fechaCaducidad)
      }))
    };
    this.guardar.emit(productoActualizado);
  }

  cerrarModal() {
    this.cerrar.emit();
  }

  private formatDate(fecha: Date): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    return d.toISOString().split('T')[0];
  }
}

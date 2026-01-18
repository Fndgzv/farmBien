import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidatorFn, AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
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
  ) { }

  get utilAbs(): number | null {
    // obtener utilidad en la captura individual
    const c = Number(this.formulario.get('costo')?.value);
    const p = Number(this.formulario.get('precio')?.value);
    if (!isFinite(c) || !isFinite(p)) return null;
    return p - c;
  }

  get utilPct(): number | null {
    // obtener porcentaje de utilidad en la captura individual
    const c = Number(this.formulario.get('costo')?.value);
    const p = Number(this.formulario.get('precio')?.value);

    if (!isFinite(c) || c <= 0 || !isFinite(p)) return null; // evita /0 y NaN
    return ((p - c) / c) * 100;
  }

  get miCategoria(): string | null {
    return this.formulario.get('categoria')?.value;
  }

  get esGenerico(): boolean | null {
    return this.formulario.get('generico')?.value;
  }

  get utilColor(): 'green' | 'orange' | 'red' | null {
    // color de semáforo de acuerdo a la utilidad
    const v = this.utilPct;
    if (v === null) return null;
    if (this.miCategoria === 'Abarrotes' || this.miCategoria === 'ABARROTES' || this.miCategoria === 'abarrotes') {
      if (v > 45) return 'orange';
      if (v >= 18) return 'green';
      return 'red';
    }
    if (this.esGenerico) {
      if (v > 60) return 'orange';
      if (v >= 30) return 'green';
      return 'red';
    }
    if (v > 20) return 'orange';
    if (v >= 10) return 'green';
    return 'red';
  }


  ngOnInit(): void {
    this.formulario = this.fb.group({
      nombre: [this.producto.nombre, [Validators.required]],
      ingreActivo: [this.producto.ingreActivo],
      renglon1: [this.producto.renglon1],
      renglon2: [this.producto.renglon2],
      codigoBarras: [this.producto.codigoBarras, [Validators.required]],
      ubicacion: [this.producto.ubicacion],
      unidad: [this.producto.unidad],
      categoria: [this.producto.categoria],
      precio: [this.producto.precio, [Validators.required, Validators.min(0)]],
      costo: [this.producto.costo, [Validators.required, Validators.min(0)]],
      iva: [this.producto.iva],
      generico: [this.producto.generico],
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

    // 🔧 DESACTIVAR validación de lotes **y limpiar errores residuales**:
    const lotesFA = this.formulario.get('lotes') as FormArray;

    lotesFA.controls.forEach(ctrl => {
      const g = ctrl as FormGroup;

      // 1) limpiar validators y errores de cada control del lote
      Object.values(g.controls).forEach(c => {
        c.clearValidators();
        c.clearAsyncValidators();
        c.setErrors(null);                               // 👈 IMPORTANTE
        c.updateValueAndValidity({ onlySelf: true });    // 👈 recalcular
      });

      // 2) limpiar validators y errores del grupo del lote
      g.setErrors(null);                                  // 👈 IMPORTANTE
      g.updateValueAndValidity({ onlySelf: true });       // 👈 recalcular
    });

    // 3) limpiar validators y errores del FormArray de lotes
    lotesFA.clearValidators();
    lotesFA.clearAsyncValidators();
    lotesFA.setErrors(null);                               // 👈 IMPORTANTE
    lotesFA.updateValueAndValidity();

    lotesFA.controls.forEach(ctrl => {
      const g = ctrl as FormGroup;
      const fc = g.get('fechaCaducidad')!;

      // Inicial: si viene '', pásalo a null
      if (fc.value === '' || fc.value === undefined) {
        fc.setValue(null, { emitEvent: false });
      }

      // En cambios: cada vez que quede '', pásalo a null
      fc.valueChanges.subscribe(v => {
        if (v === '') {
          fc.setValue(null, { emitEvent: false });
          // Forzamos re-evaluación del form
          fc.updateValueAndValidity({ onlySelf: true });
          g.updateValueAndValidity({ onlySelf: true });
          lotesFA.updateValueAndValidity({ onlySelf: true });
          this.formulario.updateValueAndValidity();
        }
      });
    });

    this.formulario.updateValueAndValidity();

  }

  formOkSinLotes(): boolean {
    if (!this.formulario) return false;
    const ctrls = this.formulario.controls as any;
    return Object.keys(ctrls)
      .filter(k => k !== 'lotes')        // <- ignoramos lotes
      .every(k => ctrls[k]?.valid === true);
  }

  private dumpFormErrors(ctrl: AbstractControl, path: string = 'form'): void {
    const isFormGroup = (c: AbstractControl): c is FormGroup => (c as any).controls && !(c as any).length;
    const isFormArray = (c: AbstractControl): c is FormArray => Array.isArray((c as any).controls);

    if (isFormGroup(ctrl)) {
      Object.entries(ctrl.controls).forEach(([key, child]) => {
        this.dumpFormErrors(child, `${path}.${key}`);
      });
    } else if (isFormArray(ctrl)) {
      (ctrl as FormArray).controls.forEach((child, i) => {
        this.dumpFormErrors(child, `${path}[${i}]`);
      });
    } else {
      if (ctrl.errors) {
        console.log(`❌ ${path}:`, ctrl.errors);
      } else {
        // console.log(`✅ ${path}: OK`);
      }
    }
  }

  private validarFechasGlobales(): ValidatorFn {
    return (group: AbstractControl) => {
      const inicio = group.get('inicioPromoCantidad')?.value;
      const fin = group.get('finPromoCantidad')?.value;

      // si falta alguno, no invalida
      if (!inicio || !fin) return null;

      const d1 = new Date(inicio);
      const d2 = new Date(fin);
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

      return d2 >= d1 ? null : { rangoPromoCantidad: true };
    };
  }


  private optionalFutureDate(): ValidatorFn {
    return (control: AbstractControl) => {
      const v = control.value;
      if (v === null || v === undefined || v === '') return null; // vacío = válido
      const d = new Date(v);
      if (isNaN(d.getTime())) return { invalidDate: true };
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      return d >= hoy ? null : { pastDate: true }; // usa > si no quieres permitir hoy
    };
  }

  private optionalMin(min: number): ValidatorFn {
    return (control: AbstractControl) => {
      const v = control.value;
      if (v === null || v === undefined || v === '') return null; // vacío = válido
      const num = Number(v);
      return Number.isFinite(num) && num >= min ? null : { min: { min, actual: v } };
    };
  }

  crearLoteForm(lote: Lote): FormGroup {
    return this.fb.group({
      _id: [lote?._id ?? null],
      // lote opcional
      lote: [lote?.lote ?? null],
      // fecha opcional pero, si existe, válida (>= hoy)
      fechaCaducidad: [this.formatDate(lote?.fechaCaducidad) || null, [this.optionalFutureDate()]],
      // cantidad opcional, si existe debe ser >= 0
      cantidad: [lote?.cantidad ?? null, [this.optionalMin(0)]],
    });
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

  get lotesFormArray(): FormArray {
    return this.formulario.get('lotes') as FormArray;
  }

agregarLote() {

  // Número de lote basado en cuántos existen
  const nextNumber = this.lotesFormArray.length + 1;

  // 2 dígitos → 01, 02, 03...
  const padded = String(nextNumber).padStart(2, '0');

  const nuevoLote: Lote = {
    lote: `LOTE-${padded}`,
    fechaCaducidad: new Date(),
    cantidad: 0
  };

  this.lotesFormArray.push(this.crearLoteForm(nuevoLote));
}


  eliminarLote(index: number) {
    this.lotesFormArray.removeAt(index);
  }

  guardarProducto() {

    if (this.formulario.invalid) {
      console.log('❌ Formulario inválido:', this.formulario.errors);
      Object.entries(this.formulario.controls).forEach(([k, c]) => {
        console.log('Campo:', k, 'Estado:', c.status, 'Errores:', c.errors);
      });
      return; // no continúa si está inválido
    }

    const v = this.formulario.value as any;

    const lotes = (v.lotes || []).map((l: any) => ({
      ...l,
      lote: (l?.lote ?? '').toString().trim() || null,
      fechaCaducidad: l?.fechaCaducidad ? new Date(l.fechaCaducidad) : null,
      cantidad: (l?.cantidad === '' || l?.cantidad === null || l?.cantidad === undefined)
        ? null
        : Number(l.cantidad),
    }))
      // opcional: quita filas totalmente vacías
      .filter((l: any) => l.lote !== null || l.fechaCaducidad !== null || l.cantidad !== null);

    const productoActualizado: Producto = { ...this.producto, ...v, lotes };
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

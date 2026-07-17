import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValidatorFn, AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Producto, Lote } from '../../../models/producto.model';
import { Laboratorio, LaboratoriosService } from '../../../services/laboratorios.service';

type ModalProductoData = {
  producto: Producto;
  proveedores: any[]; // o Proveedor[] si tienes la interfaz
  laboratorios?: Laboratorio[];
};
@Component({
  selector: 'app-modal-editar-producto',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './modal-editar-producto.component.html',
  styleUrls: ['./modal-editar-producto.component.css']
})
export class ModalEditarProductoComponent implements OnInit {

  formulario!: FormGroup;
  proveedores: any[] = [];
  laboratorios: Laboratorio[] = [];
  sintomaInput = '';

  @Output() guardar = new EventEmitter<Producto>();
  @Output() cerrar = new EventEmitter<void>();

  constructor(
    private fb: FormBuilder,
    private laboratoriosService: LaboratoriosService,
    @Inject('PRODUCTO_DATA') public data: ModalProductoData
  ) { }

  get producto(): Producto {
    return this.data.producto;
  }

  private ordenarLaboratorios(data: Laboratorio[] = []): Laboratorio[] {
    return [...data].sort((a, b) =>
      String(a?.laboratorio || '').localeCompare(String(b?.laboratorio || ''), 'es', { sensitivity: 'base' })
    );
  }

  private obtenerLaboratorioId(valor: any): string | null {
    if (!valor) return null;
    if (typeof valor === 'object') {
      return this.obtenerLaboratorioId(valor._id || valor.id || valor.$oid || valor.laboratorio);
    }
    const id = String(valor || '').trim();
    return id || null;
  }

  private cargarLaboratorios(): void {
    this.laboratoriosService.obtenerLaboratorios().subscribe({
      next: (data) => this.laboratorios = this.ordenarLaboratorios(data || []),
      error: (err) => console.error('Error al cargar laboratorios:', err),
    });
  }

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
    this.proveedores = Array.isArray(this.data?.proveedores) ? this.data.proveedores : [];
    this.laboratorios = Array.isArray(this.data?.laboratorios) ? this.ordenarLaboratorios(this.data.laboratorios) : [];
    if (!this.laboratorios.length) this.cargarLaboratorios();

    this.formulario = this.fb.group({
      nombre: [this.producto.nombre, [Validators.required]],
      ingreActivo: [this.producto.ingreActivo],
      renglon1: [this.producto.renglon1],
      renglon2: [this.producto.renglon2],
      descripcionUso: [(this.producto as any).descripcionUso ?? ''],
      sintomas: [this.limpiarSintomas((this.producto as any).sintomas)],
      codigoBarras: [this.producto.codigoBarras, [Validators.required]],
      ubicacion: [this.producto.ubicacion],
      unidad: [this.producto.unidad],
      categoria: [this.producto.categoria],
      precio: [this.producto.precio, [Validators.required, Validators.min(0)]],
      costo: [this.producto.costo, [Validators.required, Validators.min(0)]],
      costoHonorariosMedicos: [(this.producto as any).costoHonorariosMedicos ?? 0, [Validators.min(0)]],
      costoInsumosMedicos: [(this.producto as any).costoInsumosMedicos ?? 0, [Validators.min(0)]],
      iva: [this.producto.iva],
      generico: [this.producto.generico],
      descuentoINAPAM: [this.producto.descuentoINAPAM],
      stockMinimo: [this.producto.stockMinimo, [Validators.required, Validators.min(0)]],
      stockMaximo: [this.producto.stockMaximo, [Validators.required, Validators.min(0)]],
      laboratorio: [this.obtenerLaboratorioId((this.producto as any).laboratorio)],
      ultimoProveedorId: [(this.producto as any).ultimoProveedorId ?? null],
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
    this.formulario.get('categoria')?.valueChanges.subscribe((categoria) => {
      if (!this.esServicioMedicoCategoria(categoria)) {
        this.formulario.patchValue({
          costoHonorariosMedicos: 0,
          costoInsumosMedicos: 0
        }, { emitEvent: false });
      }
      this.actualizarCostoServicioMedico();
    });

    ['costoHonorariosMedicos', 'costoInsumosMedicos'].forEach((campo) => {
      this.formulario.get(campo)?.valueChanges.subscribe(() => {
        this.actualizarCostoServicioMedico();
      });
    });
    this.actualizarCostoServicioMedico();

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
    return this.formulario?.valid === true;
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

  private formatMMAA(fecha: Date): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    const mm = this.pad2(d.getMonth() + 1);
    const aa = this.pad2(d.getFullYear() % 100);
    return `${mm}${aa}`; // MMAA
  }

  crearLoteForm(lote: Lote): FormGroup {
    return this.fb.group({
      _id: [lote?._id ?? null],
      lote: [lote?.lote ?? null],
      fechaCaducidad: [
        lote?.fechaCaducidad ? this.formatMMAA(lote.fechaCaducidad as any) : null,
        [this.mmaaNoPasadoValidator()]
      ],
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

  esServicioMedicoCategoria(categoria: any): boolean {
    return this.normTxt(categoria) === 'servicio medico';
  }

  private actualizarCostoServicioMedico(): void {
    if (!this.esServicioMedicoCategoria(this.formulario?.get('categoria')?.value)) return;

    const costo = this.calcularCostoMedico(
      this.formulario.get('costoHonorariosMedicos')?.value,
      this.formulario.get('costoInsumosMedicos')?.value
    );

    this.formulario.patchValue({ costo }, { emitEvent: false });
  }

  private prepararCostosMedicosPayload(payload: any): void {
    if (!this.esServicioMedicoCategoria(payload?.categoria)) {
      payload.costoHonorariosMedicos = 0;
      payload.costoInsumosMedicos = 0;
      return;
    }

    payload.costoHonorariosMedicos = this.numeroNoNegativo(payload.costoHonorariosMedicos);
    payload.costoInsumosMedicos = this.numeroNoNegativo(payload.costoInsumosMedicos);
    payload.costo = this.calcularCostoMedico(
      payload.costoHonorariosMedicos,
      payload.costoInsumosMedicos
    );
  }

  private numeroNoNegativo(value: any): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  private calcularCostoMedico(honorarios: any, insumos: any): number {
    return this.numeroNoNegativo(honorarios) + this.numeroNoNegativo(insumos);
  }

  private normTxt(v: any): string {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private limpiarSintomas(valor: any): string[] {
    const items = Array.isArray(valor)
      ? valor
      : String(valor ?? '').split(',');
    const vistos = new Set<string>();
    const sintomas: string[] = [];

    for (const item of items) {
      const texto = String(item ?? '').replace(/\s+/g, ' ').trim();
      const clave = this.normTxt(texto);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      sintomas.push(texto);
    }

    return sintomas;
  }

  get sintomasFormulario(): string[] {
    return this.limpiarSintomas(this.formulario?.get('sintomas')?.value);
  }

  agregarSintoma(): void {
    const nuevos = this.limpiarSintomas(this.sintomaInput);
    if (!nuevos.length) return;

    const control = this.formulario.get('sintomas');
    control?.setValue(this.limpiarSintomas([...(control?.value || []), ...nuevos]));
    control?.markAsDirty();
    this.sintomaInput = '';
  }

  quitarSintoma(index: number): void {
    const control = this.formulario.get('sintomas');
    const sintomas = this.sintomasFormulario.filter((_, i) => i !== index);
    control?.setValue(sintomas);
    control?.markAsDirty();
  }

  guardarProducto() {

    if (this.formulario.invalid) {
      console.log('❌ Formulario inválido:', this.formulario.errors);
      Object.entries(this.formulario.controls).forEach(([k, c]) => {
        console.log('Campo:', k, 'Estado:', c.status, 'Errores:', c.errors);
      });
      return; // no continúa si está inválido
    }

    const v = { ...(this.formulario.value as any) };
    v.descripcionUso = String(v.descripcionUso ?? '');
    v.sintomas = this.limpiarSintomas(v.sintomas);
    this.prepararCostosMedicosPayload(v);

    const lotes = (v.lotes || []).map((l: any) => {
      const fecha = this.parseMMAA(l?.fechaCaducidad);

      return {
        ...l,
        lote: (l?.lote ?? '').toString().trim() || null,
        // ✅ ya mandamos Date real al backend (último día del mes)
        fechaCaducidad: fecha,
        cantidad: (l?.cantidad === '' || l?.cantidad === null || l?.cantidad === undefined)
          ? null
          : Number(l.cantidad),
      };
    })
      .filter((l: any) => l.lote !== null || l.fechaCaducidad !== null || l.cantidad !== null);

    const productoActualizado: Producto = {
      ...this.producto,
      ...v,
      lotes,
      // por si v lo trae como '' lo normalizamos a null:
      ultimoProveedorId: v.ultimoProveedorId || null,
      laboratorio: v.laboratorio || null
    } as any;
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

  private pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  private lastDayOfMonth(year: number, month1to12: number): number {
    // día 0 del siguiente mes = último día del mes actual
    return new Date(year, month1to12, 0).getDate();
  }

  private parseMMAA(value: any): Date | null {
    if (value === null || value === undefined) return null;

    // Limpia todo lo que no sea dígito
    const s = String(value).replace(/\D/g, '').slice(0, 4);
    if (s.length !== 4) return null;

    const mm = Number(s.slice(0, 2));
    const aa = Number(s.slice(2, 4));

    if (!Number.isFinite(mm) || mm < 1 || mm > 12) return null;

    // Regla: "28" => 2028. (si algún día quieres ventana 70/30, lo ajustamos)
    const year = 2000 + aa;

    const day = this.lastDayOfMonth(year, mm);

    // Date local (00:00)
    return new Date(year, mm - 1, day);
  }

  private formatDateEs(d: Date): string {
    const dd = this.pad2(d.getDate());
    const mm = this.pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  onCaducidadInput(i: number) {
    const g = this.lotesFormArray.at(i) as FormGroup;
    const ctrl = g.get('fechaCaducidad');
    if (!ctrl) return;

    const cleaned = String(ctrl.value ?? '').replace(/\D/g, '').slice(0, 4);
    if (cleaned !== ctrl.value) ctrl.setValue(cleaned, { emitEvent: false });

    ctrl.markAsTouched();
    ctrl.updateValueAndValidity({ onlySelf: true });
  }


  getCaducidadPreview(i: number): string | null {
    const g = this.lotesFormArray.at(i) as FormGroup;
    const v = g.get('fechaCaducidad')?.value;
    const d = this.parseMMAA(v);
    return d ? this.formatDateEs(d) : null;
  }

  private mmaaNoPasadoValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const raw = control.value;

      // vacío = válido (si quieres que sea obligatorio, quita esto)
      if (raw === null || raw === undefined || raw === '') return null;

      const s = String(raw).replace(/\D/g, '');
      if (s.length !== 4) return { mmaaFormato: true };

      const mm = Number(s.slice(0, 2));
      const aa = Number(s.slice(2, 4));

      if (!Number.isFinite(mm) || mm < 1 || mm > 12) return { mmaaMes: true };

      const year = 2000 + aa;
      const day = this.lastDayOfMonth(year, mm);
      const fechaCad = new Date(year, mm - 1, day);

      if (isNaN(fechaCad.getTime())) return { mmaaInvalida: true };

      // ✅ No aceptar fechas menores a hoy (comparando contra fin de hoy)
      const inicioManana = this.inicioMananaLocal(new Date()); // mañana 00:00 local
      if (fechaCad < inicioManana) return { mmaaPasada: true };

      return null;
    };
  }

  private inicioMananaLocal(d = new Date()): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() + 1); // mañana 00:00 local
    return x;
  }


}

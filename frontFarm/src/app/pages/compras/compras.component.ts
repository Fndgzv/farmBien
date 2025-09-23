import { Component, ElementRef, HostListener, OnInit, Renderer2, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, map, catchError } from 'rxjs';

import { ProveedorService } from '../../services/proveedor.service';
import { ProductoService } from '../../services/producto.service';
import { CompraService } from '../../services/compra.service';
import Swal from 'sweetalert2';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from "@angular/material/icon";
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { faPlus } from '@fortawesome/free-solid-svg-icons';
@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatTooltipModule, MatIconModule, FontAwesomeModule],
  templateUrl: './compras.component.html',
  styleUrls: ['./compras.component.css']
})
export class ComprasComponent implements OnInit {
  @ViewChild('backdrop') backdrop!: ElementRef<HTMLDivElement>;
  @ViewChild('firstInput') firstInput!: ElementRef<HTMLInputElement>;

  headerForm!: FormGroup;
  itemForm!: FormGroup;
  carrito: any[] = [];
  total: number = 0;
  nombreProducto = '';
  codBarras = '';

  cargandoProducto = false;
  productoEncontrado = false;

  cargando = false;
  prodInput$ = new Subject<string>();
  prodOpts: any[] = [];
  subs: Subscription[] = [];
  prodSel: any = null;

  proveedores: any[] = [];
  productos: any[] = [];

  editingPromoIndex: number | null = null;
  editPromos: any = {};

  diasSemana = [
    { name: 'Lunes', prop: 'promoLunes' },
    { name: 'Martes', prop: 'promoMartes' },
    { name: 'Miércoles', prop: 'promoMiercoles' },
    { name: 'Jueves', prop: 'promoJueves' },
    { name: 'Viernes', prop: 'promoViernes' },
    { name: 'Sábado', prop: 'promoSabado' },
    { name: 'Domingo', prop: 'promoDomingo' }
  ];

  mostrarNuevoProducto = false;
  guardandoNuevo = false;
  nuevoProductoForm!: FormGroup;

  faPlus = faPlus;

  constructor(
    private fb: FormBuilder,
    private proveedorService: ProveedorService,
    private productoService: ProductoService,
    private compraService: CompraService,
    library: FaIconLibrary,
    private renderer: Renderer2
  ) { library.addIcons(faPlus); }

  // helpers de fecha local -> 'YYYY-MM-DD'
  private toLocalISODate(d: Date): string {
    const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return x.toISOString().slice(0, 10);
  }

  // hoy en local para poner como [max] y default
  hoyISO = this.toLocalISODate(new Date());

  ngOnInit(): void {
    this.initForms();

    this.itemForm.get('lote')!.valueChanges.subscribe((raw: string) => {
      const up = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (up !== raw) {
        this.itemForm.patchValue({ lote: up }, { emitEvent: false });
      }
    });

    // mmAA -> YYYY-MM-último_día (00-99 => 2000-2099)
    this.itemForm.get('caducidadMMAAAA')!.valueChanges.subscribe((raw: string) => {
      const digits = (raw ?? '').toString().replace(/\D/g, ''); // solo números
      if (digits !== raw) {
        this.itemForm.patchValue({ caducidadMMAAAA: digits }, { emitEvent: false });
      }

      if (digits.length !== 4) {
        this.itemForm.patchValue({ fechaCaducidad: null }, { emitEvent: false });
        return;
      }

      const mm = +digits.slice(0, 2);
      const yy = +digits.slice(2);
      if (mm < 1 || mm > 12) {
        this.itemForm.patchValue({ fechaCaducidad: null }, { emitEvent: false });
        return;
      }

      // Mapea 00..99 -> 2000..2099 (ajusta si necesitas otra regla)
      const yyyy = 2000 + yy;

      // último día del mes
      const last = new Date(yyyy, mm, 0);
      const y = String(last.getFullYear());
      const m = String(last.getMonth() + 1).padStart(2, '0');
      const d = String(last.getDate()).padStart(2, '0');

      this.itemForm.patchValue({ fechaCaducidad: `${y}-${m}-${d}` }, { emitEvent: false });
    });

    this.loadProveedores();
    this.loadProductos();

    this.subs.push(
      this.prodInput$.pipe(
        map(s => (s || '').trim()),
        debounceTime(180),
        distinctUntilChanged(),
        switchMap(q => q.length < 2 ? of([]) : this.compraService.searchProductos(q))
      ).subscribe(list => {
        this.prodOpts = Array.isArray(list) ? list : [];
      })
    );

    // 👇 inicializa form del modal
    this.nuevoProductoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      codigoBarras: ['', Validators.required],
      unidad: ['', Validators.required],
      precio: [null, [Validators.required, Validators.min(0)]],
      costo: [null, [Validators.required, Validators.min(0)]],
      iva: [false],
      stockMinimo: [50, [Validators.required, Validators.min(0)]],
      stockMaximo: [100, [Validators.required, Validators.min(0)]],
      ubicacion: [''],
      categoria: ['', Validators.required],
      generico: [false],
      descuentoINAPAM: [false]
    });

  }

  mmYyValidator(control: AbstractControl) {
    const v = (control.value ?? '').toString().replace(/\D/g, '');
    if (v === '') return null;                    // permite vacío hasta que capturen
    if (!/^\d{4}$/.test(v)) return { mmYy: true }; // mmAA
    const mm = +v.slice(0, 2);
    const yy = +v.slice(2);
    if (mm < 1 || mm > 12) return { mmYy: true };
    // Si quieres bloquear años muy lejanos, aquí podrías validar yy
    return null;
  }


  private initForms(): void {
    this.headerForm = this.fb.group({
      proveedor: [null, Validators.required],
      fechaCompra: [this.hoyISO],
      afectarExistencias: [true]
    });

    this.itemForm = this.fb.group({
      nombre: ['', Validators.required],
      codigoBarras: ['', Validators.required],
      cantidad: [1, [Validators.required, Validators.min(1)]],
      lote: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]*$/)]],
      caducidadMMAAAA: ['', [this.mmYyValidator]],
      fechaCaducidad: [null, Validators.required],
      costoUnitario: [0, [Validators.required, Validators.min(0)]],
      precioUnitario: [0, [Validators.required, Validators.min(0)]],
      stockMinimo: [1, [Validators.required, Validators.min(1)]],
      stockMaximo: [1, [Validators.required, Validators.min(1)]],
      promociones: this.fb.group({
        tipoPromocion: ['ninguna'],
        promoCantidadRequerida: [null],
        inicioPromoCantidad: [null],
        finPromoCantidad: [null],
        promoDeTemporada: this.fb.group({
          porcentaje: [null],
          inicio: [null],
          fin: [null],
          monedero: [false]
        }),
        descuentoINAPAM: [false],
        ...this.getDiasSemanaForm()
      })
    });
  }

  private getDiasSemanaForm() {
    const dias: any = {};
    for (const dia of this.diasSemana) {
      dias[dia.prop] = this.fb.group({
        porcentaje: [null],
        inicio: [null],
        fin: [null],
        monedero: [false]
      });
    }
    return dias;
  }

  private loadProveedores(): void {
    this.proveedorService.obtenerProveedores().subscribe((data: any[]) => {
      this.proveedores = data.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    });
  }

  private loadProductos(): void {
    this.productoService.obtenerProductos().subscribe(data => this.productos = data);
  }

  // Búsqueda producto
  async onBuscarProducto(): Promise<void> {
    const code = this.itemForm.get('codigoBarras')?.value?.trim();
    if (!code) return;

    this.cargandoProducto = true;
    await new Promise(r => setTimeout(r, 50));

    const prod = this.productos.find(p => p.codigoBarras === code);
    if (!prod) {
      await Swal.fire({
        icon: 'warning',
        title: 'No encontrado',
        text: `Producto con código ${code} no existe.`,
        confirmButtonText: 'Aceptar'
      });
      this.limpiarProducto();
      return;
    }

    this.applyProducto(prod);
  }


  private detectarTipoPromocion(prod: any): string {
    if (prod.promoDeTemporada) return 'temporada';
    if (prod.promoCantidadRequerida) return 'cantidad';
    if (this.diasSemana.some(dia => prod[dia.prop] != null)) return 'dia';
    return 'ninguna';
  }

  private mapDiasSemana(prod: any): any {
    const promos: any = {};
    for (const dia of this.diasSemana) {
      promos[dia.prop] = {
        porcentaje: prod[dia.prop]?.porcentaje ?? null,
        inicio: this.toDate(prod[dia.prop]?.inicio),
        fin: this.toDate(prod[dia.prop]?.fin),
        monedero: prod[dia.prop]?.monedero ?? false
      };
    }
    return promos;
  }

  limpiarProducto(): void {
    this.nombreProducto = '';
    this.productoEncontrado = false;
    this.itemForm.reset();
    this.itemForm.get('codigoBarras')?.enable();
  }

  onAgregarItem(): void {
    if (this.itemForm.invalid) {
      Swal.fire('Formulario incompleto', 'Por favor llena todos los campos.', 'warning');
      return;
    }
    const vals = this.itemForm.value;
    const item = {
      nombre: vals.nombre,
      codigoBarras: this.codBarras,
      cantidad: vals.cantidad,
      lote: vals.lote,
      fechaCaducidad: vals.fechaCaducidad,
      costoUnitario: vals.costoUnitario,
      precioUnitario: vals.precioUnitario,
      stockMinimo: vals.stockMinimo,
      stockMaximo: vals.stockMaximo,
      promociones: vals.promociones
    };

    this.carrito.push(item);
    this.calcularTotal();
    this.limpiarProducto();
  }

  calcularTotal(): void {
    this.total = this.carrito.reduce((sum, item) => sum + item.costoUnitario * item.cantidad, 0);
  }

  onEliminarItem(i: number): void {
    this.carrito.splice(i, 1);
    this.calcularTotal();
  }

  // Editar promos
  estaEditandoPromos = false;
  toggleEditPromo(i: number): void {
    this.estaEditandoPromos = true;
    this.calcularTotal();
    if (this.editingPromoIndex === i) {
      this.editingPromoIndex = null;
      this.estaEditandoPromos = false;
      return;
    }

    const currentPromos = this.carrito[i].promociones;
    this.editingPromoIndex = i;
    this.editPromos = JSON.parse(JSON.stringify(currentPromos));

    if (this.editPromos.tipoPromocion === 'dia') {
      for (const dia of this.diasSemana) {
        this.editPromos[dia.prop] ??= { porcentaje: null, inicio: null, fin: null, monedero: false };
      }
    }
  }

  savePromos(i: number): void {
    this.carrito[i].promociones = JSON.parse(JSON.stringify(this.editPromos));
    this.editingPromoIndex = null;
    this.estaEditandoPromos = false;
  }

  cancelPromos(): void {
    this.editingPromoIndex = null;
    this.estaEditandoPromos = false;
  }

  onRegistrarCompra(): void {
    if (this.headerForm.invalid || this.carrito.length === 0) {
      Swal.fire('Datos incompletos', 'Selecciona proveedor y agrega productos.', 'warning');
      return;
    }

    // Validar que no se seleccione futuro
    const fSel = this.headerForm.value.fechaCompra as string | null;
    if (fSel) {
      const hoy = new Date(this.hoyISO);
      const sel = new Date(fSel);
      if (sel > hoy) {
        Swal.fire('Fecha inválida', 'La fecha de compra no puede ser futura.', 'warning');
        return;
      }
    }

    const proveedorId = this.headerForm.value.proveedor;
    const proveedorSeleccionado = this.proveedores.find(p => p._id === proveedorId);
    const nombreProveedor = proveedorSeleccionado?.nombre || 'Desconocido';

    // Construye ISO “seguro” (12:00 local) para evitar desfases por zona
    const fechaCompraIso = fSel ? new Date(`${fSel}T12:00:00`).toISOString() : null;

    const afectarExistencias = !!this.headerForm.value.afectarExistencias;

    Swal.fire({
      icon: 'question',
      title: 'Confirmar compra',
      html: `
      Proveedor: <strong>${nombreProveedor}</strong><hr>
      <div>Fecha compra: <strong>${fSel || this.hoyISO}</strong></div>
      <div>Afectar existencias: <strong>${afectarExistencias ? 'Sí' : 'No'}</strong></div>
      <h2 style="color: blue">Total: <strong>$${this.total.toFixed(2)}</strong></h2>`,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
    }).then(result => {
      if (!result.isConfirmed) return;
      Swal.showLoading();

      const payload: any = {
        proveedor: this.headerForm.value.proveedor,
        afectarExistencias,                 // ⬅️ NUEVO
        productos: this.carrito.map(item => ({
          codigoBarras: item.codigoBarras,
          cantidad: item.cantidad,
          lote: item.lote,
          fechaCaducidad: item.fechaCaducidad,
          costoUnitario: item.costoUnitario,
          precioUnitario: item.precioUnitario,
          stockMinimo: item.stockMinimo,
          stockMaximo: item.stockMaximo,
          promociones: item.promociones
        }))
      };

      // ⬅️ Enviar la fecha con el nombre que espera el backend
      if (fechaCompraIso) payload.fechaCompra = fechaCompraIso;

      this.compraService.crearCompra(payload).subscribe({
        next: () => {
          Swal.hideLoading();
          Swal.fire('Compra registrada', 'Se guardó correctamente.', 'success');
          this.resetCompras();
        },
        error: err => {
          Swal.hideLoading();
          console.error(err);
          Swal.fire('Error', 'No se pudo registrar la compra.', 'error');
        }
      });
    });
  }

  resetCompras(): void {
    this.headerForm.reset();
    this.carrito = [];
    this.total = 0;
  }

  private toDate(fecha?: Date | string): string | null {
    if (!fecha) return null;
    const f = new Date(fecha);
    return f.toISOString().substring(0, 10);
  }

  onProdInput(q: string) {
    this.prodInput$.next(q);
  }

  async selectProd(p: any, prodInput?: HTMLInputElement) {
    this.prodSel = p;
    this.prodOpts = [];
    if (prodInput) { prodInput.value = ''; }

    this.cargandoProducto = true;
    await new Promise(r => setTimeout(r, 50));

    const produ = this.productos.find(prod => prod.codigoBarras === p.codigoBarras);

    if (!produ) {
      await Swal.fire({
        icon: 'warning',
        title: 'No encontrado',
        text: `Producto con código ${p.codigoBarras} no existe.`,
        confirmButtonText: 'Aceptar'
      });
      this.limpiarProducto();
      return;
    }

    this.applyProducto(produ);
  }


  /** Rellena el formulario/estado con un producto encontrado (por CB o por sugerencia) */
  private applyProducto(prod: any) {
    if (!prod) return;

    this.nombreProducto = prod.nombre || '';
    this.codBarras = prod.codigoBarras || '';
    this.productoEncontrado = !!this.nombreProducto;
    this.cargandoProducto = false;

    // Deshabilita el input de CB para evitar cambios accidentales
    this.itemForm.get('codigoBarras')?.setValue(this.codBarras);
    this.itemForm.get('codigoBarras')?.disable();

    const tipo = this.detectarTipoPromocion(prod);

    this.itemForm.patchValue({
      nombre: prod.nombre,
      codBarras: this.codBarras,
      cantidad: 1,
      lote: '',
      caducidadMMAAAA: '',
      fechaCaducidad: null,
      costoUnitario: prod.costo ?? 0,
      precioUnitario: prod.precio ?? 0,
      stockMinimo: prod.stockMinimo ?? 1,
      stockMaximo: prod.stockMaximo ?? 1,
      promociones: {
        tipoPromocion: tipo,
        promoCantidadRequerida: prod.promoCantidadRequerida ?? null,
        inicioPromoCantidad: this.toDate(prod.inicioPromoCantidad),
        finPromoCantidad: this.toDate(prod.finPromoCantidad),
        promoDeTemporada: {
          porcentaje: prod.promoDeTemporada?.porcentaje ?? null,
          inicio: this.toDate(prod.promoDeTemporada?.inicio),
          fin: this.toDate(prod.promoDeTemporada?.fin),
          monedero: prod.promoDeTemporada?.monedero ?? false
        },
        descuentoINAPAM: prod.descuentoINAPAM ?? false,
        ...this.mapDiasSemana(prod)
      }
    });
  }

  abrirNuevoProducto() {
    this.nuevoProductoForm.reset({
      nombre: '',
      codigoBarras: '',
      unidad: 'PZA',
      precio: null,
      costo: null,
      iva: false,
      stockMinimo: 50,
      stockMaximo: 100,
      ubicacion: '',
      categoria: '',
      generico: false,
      descuentoINAPAM: false
    });
    this.mostrarNuevoProducto = true;
    // Bloquear el scroll del body (opcional)
    this.renderer.addClass(document.body, 'no-scroll');

    // Enfocar overlay y primer input
    setTimeout(() => {
      this.backdrop?.nativeElement.focus();
      this.firstInput?.nativeElement.focus();
    });
  }

  cerrarNuevoProducto() {
    this.mostrarNuevoProducto = false;
    this.renderer.removeClass(document.body, 'no-scroll');
  }

  // guardar
  guardarNuevoProducto() {
    if (this.nuevoProductoForm.invalid) {
      this.nuevoProductoForm.markAllAsTouched();
      return;
    }

    const payload = this.nuevoProductoForm.value;

    // validación simple: stockMax >= stockMin
    if (payload.stockMaximo < payload.stockMinimo) {
      Swal.fire('Validación', 'El stock máximo debe ser mayor o igual al mínimo.', 'warning');
      return;
    }

    this.guardandoNuevo = true;

    this.productoService.crearProducto(payload).subscribe({
      next: (resp) => {
        this.guardandoNuevo = false;
        this.mostrarNuevoProducto = false;
        this.loadProductos();
        Swal.fire({
          icon: 'success',
          title: 'Listo',
          html: `Producto creado correctamente.<br>
                  Si deseas agregar promociones<br>
                  busca el producto en la tabla y editalo`,
          confirmButtonText: 'Aceptar',
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
      },
      error: (err) => {
        this.guardandoNuevo = false;
        console.error(err);
        Swal.fire('Error', err?.error?.mensaje || 'No se pudo crear el producto.', 'error');
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  trapTab(e: KeyboardEvent) {
    if (!this.mostrarNuevoProducto || e.key !== 'Tab' || !this.backdrop) return;
    const nodes: NodeListOf<HTMLElement> =
      this.backdrop.nativeElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && active === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && active === last) { first.focus(); e.preventDefault(); }
  }



}

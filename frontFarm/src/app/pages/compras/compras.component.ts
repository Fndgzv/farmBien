import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ProveedorService } from '../../services/proveedor.service';
import { ProductoService } from '../../services/producto.service';
import { CompraService } from '../../services/compra.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './compras.component.html',
  styleUrls: ['./compras.component.css']
})
export class ComprasComponent implements OnInit {

  headerForm!: FormGroup;
  itemForm!: FormGroup;
  carrito: any[] = [];
  total: number = 0;
  nombreProducto = '';
  codBarras = '';

  cargandoProducto = false;
  productoEncontrado = false;

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

  constructor(
    private fb: FormBuilder,
    private proveedorService: ProveedorService,
    private productoService: ProductoService,
    private compraService: CompraService,
    /* private cdr: ChangeDetectorRef */
  ) { }

  ngOnInit(): void {
    this.initForms();
    this.loadProveedores();
    this.loadProductos();
  }

  private initForms(): void {
    this.headerForm = this.fb.group({
      proveedor: [null, Validators.required]
    });

    this.itemForm = this.fb.group({
      nombre: ['', Validators.required],
      codigoBarras: ['', Validators.required],
      cantidad: [1, [Validators.required, Validators.min(1)]],
      lote: ['', Validators.required],
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
    await new Promise(resolve => setTimeout(resolve, 50));

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

    this.nombreProducto = prod.nombre;
    this.codBarras = prod.codigoBarras;
    this.productoEncontrado = true;
    this.cargandoProducto = false;
    this.itemForm.get('codigoBarras')?.disable();

    const tipo = this.detectarTipoPromocion(prod);

    this.itemForm.patchValue({
      nombre: prod.nombre,
      codBarras: this.codBarras,
      cantidad: 1,
      lote: '',
      fechaCaducidad: null,
      costoUnitario: prod.costo,
      precioUnitario: prod.precio,
      stockMinimo: prod.stockMinimo,
      stockMaximo: prod.stockMaximo,
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
  toggleEditPromo(i: number): void {
    this.calcularTotal();
    if (this.editingPromoIndex === i) {
      this.editingPromoIndex = null;
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
  }

  cancelPromos(): void {
    this.editingPromoIndex = null;
  }

  onRegistrarCompra(): void {
    if (this.headerForm.invalid || this.carrito.length === 0) {
      Swal.fire('Datos incompletos', 'Selecciona proveedor y agrega productos.', 'warning');
      return;
    }

    const proveedorId = this.headerForm.value.proveedor;
    const proveedorSeleccionado = this.proveedores.find(p => p._id === proveedorId);
    const nombreProveedor = proveedorSeleccionado?.nombre || 'Desconocido';
    Swal.fire({
      icon: 'question',
      title: 'Confirmar compra',
      html: `Proveedor: <strong>${nombreProveedor}</strong><hr>
             <h2 style = "color: blue">Total: <strong>$${this.total.toFixed(2)}</strong></h2>`,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
    }).then(result => {
      if (!result.isConfirmed) return;
      Swal.showLoading();

      const payload = {
        proveedor: this.headerForm.value.proveedor,
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
}

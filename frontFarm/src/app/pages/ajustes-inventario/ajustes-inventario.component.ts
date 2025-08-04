import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Producto } from '../../models/producto.model';
import { ModalOverlayService } from '../../services/modal-overlay.service';
import { ProductoService } from '../../services/producto.service';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faPen, faTimes } from '@fortawesome/free-solid-svg-icons';

import Swal from 'sweetalert2';

@Component({
  selector: 'app-ajuste-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FontAwesomeModule],
  templateUrl: './ajustes-inventario.component.html',
  styleUrls: ['./ajustes-inventario.component.css']
})
export class AjustesInventarioComponent implements OnInit {
  productos: Producto[] = [];
  productosFiltrados: Producto[] = [];
  formularioMasivo!: FormGroup;
  filtros: {
    nombre: string;
    codigoBarras: string;
    categoria: string;
    descuentoINAPAM: boolean | null;
    generico: boolean | null;
  } = {
      nombre: '',
      codigoBarras: '',
      categoria: '',
      descuentoINAPAM: null,
      generico: null
    };
  paginaActual = 1;
  tamanioPagina = 15;
  columnaOrden: keyof Producto | '' = '';
  direccionOrden: 'asc' | 'desc' = 'asc';
  diasSemana: string[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

  faTimes = faTimes;

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private modalService: ModalOverlayService,
    private productoService: ProductoService,
    private library: FaIconLibrary
  ) { library.addIcons(faPen, faTimes); }

  ngOnInit(): void {
    this.inicializarFormulario();

    this.cargarProductos(true);
    this.formularioMasivo.valueChanges.subscribe(() => {
      this.cdr.detectChanges();
    });
    this.formularioMasivo.get('promosPorDia')?.valueChanges.subscribe(() => {
      this.cdr.detectChanges();
    });

  }

  inicializarFormulario() {
    const promosPorDiaGroup: { [key: string]: FormGroup } = {};
    this.diasSemana.forEach(dia => {
      promosPorDiaGroup['promo' + dia] = this.fb.group({
        porcentaje: [null],
        inicio: [null],
        fin: [null],
        monedero: [null]
      });
    });

    this.formularioMasivo = this.fb.group({
      descuentoINAPAM: [null], stockMinimo: [null], stockMaximo: [null],
      ajustePrecioModo: [null], ajustePrecioPorcentaje: [null], ajustePrecioCantidad: [null],
      promoCantidadRequerida: [null], inicioPromoCantidad: [null], finPromoCantidad: [null],
      promoDeTemporadaPorcentaje: [null], promoDeTemporadaInicio: [null], promoDeTemporadaFin: [null],
      promoDeTemporadaMonedero: [null], promosPorDia: this.fb.group(promosPorDiaGroup)
    });
  }

  cargarProductos(borrarFiltros: boolean) {
    this.productoService.obtenerProductos().subscribe({
      next: (productos) => {
        this.productos = productos;
        if (borrarFiltros) {
          this.filtros = { nombre: '', codigoBarras: '', categoria: '', descuentoINAPAM: null, generico: null };
        }
        this.aplicarFiltros();
      },
      error: (err) => console.error('Error al cargar productos:', err)
    });
  }

  aplicarFiltros() {
    this.productosFiltrados = this.productos.filter(p => {
      const coincideNombre = this.filtros.nombre ? p.nombre.toLowerCase().includes(this.filtros.nombre.toLowerCase()) : true;
      const coincideCodigo = this.filtros.codigoBarras ? p.codigoBarras?.toLowerCase().includes(this.filtros.codigoBarras.toLowerCase()) : true;
      const coincideCategoria = this.filtros.categoria ? p.categoria.toLowerCase().includes(this.filtros.categoria.toLowerCase()) : true;
      const coincideINAPAM = this.filtros.descuentoINAPAM === null
        ? true
        : p.descuentoINAPAM === this.filtros.descuentoINAPAM;

      const coincideGenerico = this.filtros.generico === null
        ? true
        : p.generico === this.filtros.generico;

      return coincideNombre && coincideCodigo && coincideCategoria && coincideINAPAM && coincideGenerico;
    });
    this.paginaActual = 1;
  }

  limpiarFiltro(campo: keyof typeof this.filtros) {
    if (campo === 'descuentoINAPAM') this.filtros[campo] = null;
    if (campo === 'generico') this.filtros[campo] = null;
    if (campo === 'nombre' || campo === 'categoria' || campo === 'codigoBarras') this.filtros[campo] = '';
    
    this.aplicarFiltros();
  }


  get totalPaginas(): number {
    return Math.ceil(this.productosFiltrados.length / this.tamanioPagina);
  }

  get productosPagina(): Producto[] {
    const inicio = (this.paginaActual - 1) * this.tamanioPagina;
    const fin = inicio + this.tamanioPagina;
    return this.productosFiltrados.slice(inicio, fin);
  }

  limpiarCamposCambioMasivo() {
    this.formularioMasivo.reset();
  }

  aplicarCambiosMasivos() {
    const cambios = this.formularioMasivo.value;
    const productosSeleccionados = this.productosFiltrados.filter(p => p.seleccionado);

    if (productosSeleccionados.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin selección', text: 'Debes seleccionar al menos un producto para aplicar los cambios.' });
      return;
    }

    productosSeleccionados.forEach(producto => {
      Object.keys(cambios).forEach(campo => {
        if (cambios[campo] !== null && !['ajustePrecioModo', 'ajustePrecioPorcentaje', 'ajustePrecioCantidad'].includes(campo) && campo !== 'promosPorDia') {
          (producto as any)[campo] = cambios[campo];
        }
      });

      if (cambios.ajustePrecioModo === 'porcentaje' && cambios.ajustePrecioPorcentaje != null) {
        const porcentaje = cambios.ajustePrecioPorcentaje;
        const nuevoPrecio = producto.precio + (producto.precio * (porcentaje / 100));
        producto.precio = parseFloat(nuevoPrecio.toFixed(2));
      }
      if (cambios.ajustePrecioModo === 'cantidad' && cambios.ajustePrecioCantidad != null) {
        const cantidad = cambios.ajustePrecioCantidad;
        const nuevoPrecio = producto.precio + cantidad;
        producto.precio = parseFloat(nuevoPrecio.toFixed(2));
      }

      // Promo de Temporada
      if (
        cambios.promoDeTemporadaPorcentaje != null ||
        cambios.promoDeTemporadaInicio != null ||
        cambios.promoDeTemporadaFin != null ||
        cambios.promoDeTemporadaMonedero != null
      ) {
        producto.promoDeTemporada = {
          porcentaje: cambios.promoDeTemporadaPorcentaje ?? 0,
          inicio: new Date(cambios.promoDeTemporadaInicio),
          fin: new Date(cambios.promoDeTemporadaFin),
          monedero: cambios.promoDeTemporadaMonedero ?? false
        };
      }


      const promosPorDia = cambios.promosPorDia;
      this.diasSemana.forEach(dia => {
        const grupo = promosPorDia[`promo${dia}`];
        if (grupo?.porcentaje != null || grupo?.inicio != null || grupo?.fin != null || grupo?.monedero != null) {
          (producto as any)['promo' + dia] = {
            porcentaje: grupo.porcentaje ?? 0,
            inicio: grupo.inicio ? new Date(grupo.inicio) : null,
            fin: grupo.fin ? new Date(grupo.fin) : null,
            monedero: grupo.monedero ?? false
          };
        }
      });

      producto.modificado = true;
    });

    this.formularioMasivo.reset();

    this.grabarCambios();

    Swal.fire({ icon: 'success', title: 'Cambios aplicados', text: 'Base de datos actualizada correctamente.' });
  }

  get promosPorDiaForm(): FormGroup {
    return this.formularioMasivo.get('promosPorDia') as FormGroup;
  }


  get cambiosMasivosValidos(): boolean {
    const form = this.formularioMasivo.value;
    const { stockMinimo, stockMaximo, descuentoINAPAM, ajustePrecioModo, ajustePrecioPorcentaje, ajustePrecioCantidad,
      promoCantidadRequerida, inicioPromoCantidad, finPromoCantidad,
      promoDeTemporadaPorcentaje, promoDeTemporadaInicio, promoDeTemporadaFin, promoDeTemporadaMonedero } = form;

    const hayAlgunCambio = stockMinimo != null || stockMaximo != null || descuentoINAPAM != null || ajustePrecioModo != null ||
      promoCantidadRequerida != null || inicioPromoCantidad != null || finPromoCantidad != null ||
      promoDeTemporadaPorcentaje != null || promoDeTemporadaInicio != null || promoDeTemporadaFin != null || promoDeTemporadaMonedero != null ||
      this.hayCambiosEnPromosPorDia();

    if (!hayAlgunCambio) return false;

    if (ajustePrecioModo === 'porcentaje') {
      if (ajustePrecioPorcentaje == null || isNaN(ajustePrecioPorcentaje)) return false;
    }
    if (ajustePrecioModo === 'cantidad') {
      if (ajustePrecioCantidad == null || isNaN(ajustePrecioCantidad)) return false;
    }

    if (promoCantidadRequerida != null) {
      if (!inicioPromoCantidad || !finPromoCantidad) return false;
      if (new Date(inicioPromoCantidad) > new Date(finPromoCantidad)) return false;
    }

    const hayDatosTemporada = promoDeTemporadaPorcentaje != null || promoDeTemporadaInicio != null || promoDeTemporadaFin != null || promoDeTemporadaMonedero != null;

    if (hayDatosTemporada) {
      if (
        promoDeTemporadaPorcentaje == null ||
        isNaN(promoDeTemporadaPorcentaje) ||
        promoDeTemporadaPorcentaje <= 0 ||
        promoDeTemporadaPorcentaje > 100
      ) return false;

      if (!promoDeTemporadaInicio || !promoDeTemporadaFin) return false;

      if (new Date(promoDeTemporadaInicio) > new Date(promoDeTemporadaFin)) return false;
    }

    if (!this.validarPromosPorDia()) return false;

    return true;
  }

  hayCambiosEnPromosPorDia(): boolean {
    const promosPorDiaGroup = this.formularioMasivo.get('promosPorDia')?.value;
    if (!promosPorDiaGroup) return false;

    return this.diasSemana.some(dia => {
      const grupo = promosPorDiaGroup['promo' + dia];
      return grupo?.porcentaje != null || grupo?.inicio != null || grupo?.fin != null || grupo?.monedero != null;
    });
  }

  validarPromosPorDia(): boolean {
    const promosPorDia = this.formularioMasivo.get('promosPorDia')?.value;
    if (!promosPorDia) return true;

    for (let dia of this.diasSemana) {
      const grupo = promosPorDia[`promo${dia}`];
      if (!grupo) continue;

      const { porcentaje, inicio, fin } = grupo;

      const algunCampoCapturado = porcentaje != null || inicio != null || fin != null;

      // Si hay algún campo capturado, entonces deben cumplirse todas las condiciones
      if (algunCampoCapturado) {
        if (!inicio || !fin) return false;
        if (new Date(inicio) > new Date(fin)) return false;
        if (porcentaje == null || isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 100) return false;
      }
    }

    return true;
  }


  seleccionarTodos(event: any) {
    const checked = event.target.checked;
    this.productosFiltrados.forEach(p => p.seleccionado = checked);
  }

  editarProducto(prod: Producto) {
    const productoClonado = JSON.parse(JSON.stringify(prod));
    this.modalService.abrirModal(productoClonado, (productoEditado: Producto) => {
      this.guardarProductoEditado(productoEditado);
    });
  }

  guardarProductoEditado(productoActualizado: Producto) {
    this.productoService.actualizarProductoIndividual(productoActualizado).subscribe({
      next: () => {
        Swal.fire('Éxito', 'Producto actualizado correctamente', 'success');
        this.cargarProductos(false); // recarga sin borrar filtros
      },
      error: () => {
        Swal.fire('Error', 'No se pudo actualizar el producto', 'error');
      }
    });
  }


  grabarCambios() {
    const productosModificados = this.productos.filter(p => p.seleccionado);
    if (productosModificados.length === 0) {
      Swal.fire({ icon: 'warning', title: 'Sin selección', text: 'No hay productos seleccionados para actualizar.' });
      return;
    }
    Swal.fire({
      title: '¿Deseas guardar los cambios?',
      text: `Se actualizarán ${productosModificados.length} productos.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, guardar', cancelButtonText: 'Cancelar'
    }).then(result => {
      if (result.isConfirmed) {
        this.productoService.actualizarProductos(productosModificados).subscribe({
          next: () => {
            Swal.fire({ icon: 'success', title: 'Actualización exitosa', text: 'Los productos fueron actualizados correctamente.' });
            this.cargarProductos(false);
            this.productos.forEach(p => p.seleccionado = false);
            this.formularioMasivo.reset();
          },
          error: err => {
            console.error('Error al actualizar productos:', err);
            Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.mensaje || 'Ocurrió un error inesperado.' });
          }
        });
      }
    });
  }

  ordenar(columna: keyof Producto) {
    if (this.columnaOrden === columna) {
      this.direccionOrden = this.direccionOrden === 'asc' ? 'desc' : 'asc';
    } else {
      this.columnaOrden = columna;
      this.direccionOrden = 'asc';
    }
    this.productosFiltrados.sort((a, b) => {
      const valorA = (a[columna] ?? '').toString().toLowerCase();
      const valorB = (b[columna] ?? '').toString().toLowerCase();
      if (valorA < valorB) return this.direccionOrden === 'asc' ? -1 : 1;
      if (valorA > valorB) return this.direccionOrden === 'asc' ? 1 : -1;
      return 0;
    });
    this.paginaActual = 1;
  }

  actualizarProducto(producto: Producto) {
    this.productoService.actualizarProductoIndividual(producto).subscribe({
      next: () => {
        Swal.fire('Éxito', 'Producto actualizado correctamente', 'success');
        this.cargarProductos(false); // o recarga la lista
      },
      error: () => {
        Swal.fire('Error', 'No se pudo actualizar el producto', 'error');
      }
    });
  }

}

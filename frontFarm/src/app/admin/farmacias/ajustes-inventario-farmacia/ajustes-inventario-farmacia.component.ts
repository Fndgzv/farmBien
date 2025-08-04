import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { InventarioFarmaciaService } from '../../../services/inventario-farmacia.service';
import { FarmaciaService } from '../../../services/farmacia.service';
import Swal from 'sweetalert2';

import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faSpinner, faCheck, faSave, faPen, faTimes } from '@fortawesome/free-solid-svg-icons';


@Component({
  selector: 'app-ajustes-inventario-farmacia',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FaIconComponent,
    MatTooltipModule
  ],
  templateUrl: './ajustes-inventario-farmacia.component.html',
  styleUrl: './ajustes-inventario-farmacia.component.css'
})
export class AjustesInventarioFarmaciaComponent implements OnInit {
  formFiltros!: FormGroup;
  inventario: any[] = [];
  farmacias: any[] = [];

  ajusteMasivo = {
    existencia: 0,
    stockMax: 0,
    stockMin: 0
  };

  estadoEdicion: { [key: string]: boolean } = {}; // clave: id del producto

  paginaActual = 1;
  tamanoPagina = 15;

  faSpinner = faSpinner;
  faCheck = faCheck;
  faSave = faSave;
  faEdit = faPen;
  faTimes = faTimes;

  estadoGuardado: { [key: string]: 'idle' | 'guardando' | 'exito' } = {};

  constructor(
    private fb: FormBuilder,
    private inventarioService: InventarioFarmaciaService,
    private farmaciaService: FarmaciaService,
    private library: FaIconLibrary
  ) { library.addIcons(faSave, faSpinner, faCheck); }

  ngOnInit(): void {
    this.formFiltros = this.fb.group({
      farmacia: [''],
      nombre: [''],
      codigoBarras: [''],
      categoria: [''],
      inapam: [''],
      generico: ['']
    });

    this.cargarFarmacias();
  }

  cargarFarmacias() {
    this.farmaciaService.obtenerFarmacias().subscribe({
      next: (resp) => {
        this.farmacias = resp;

        if (this.farmacias.length > 0) {
          const primera = this.farmacias[0]._id;
          this.formFiltros.get('farmacia')?.setValue(primera);
          this.buscar(); // Disparar búsqueda automáticamente
        }
      },
      error: () => this.farmacias = []
    });
  }


  buscar() {
    const filtros = this.formFiltros.value;
    if (!filtros.farmacia) {
      alert('Debe seleccionar una farmacia');
      return;
    }

    this.inventarioService.buscarInventarioFarmacia(filtros).subscribe({
      next: (resp) => {
        this.estadoEdicion = {}; 
        this.inventario = resp.map((item: any) => {
          return {
            _id: item._id,
            farmacia: item.farmacia,
            producto: item.producto,
            existencia: item.existencia,
            stockMax: item.stockMax,
            stockMin: item.stockMin,
            precioVenta: item.precioVenta,
            seleccionado: false,
            copiaOriginal: {
              existencia: item.existencia,
              stockMax: item.stockMax,
              stockMin: item.stockMin,
              precioVenta: item.precioVenta
            }
          }
        });
        this.paginaActual = 1;
      },
      error: (err) => {
        console.error('Error al buscar inventario', err);
        this.inventario = [];
      }
    });

  }

  seleccionarTodos(event: any) {
    /* this.inventario.forEach(p => p.seleccionado = this.todosSeleccionados); */
    const checked = event.target.checked;
    this.inventario.forEach(p => p.seleccionado = checked);
    /* this.todosSeleccionados = checked; */
  }

  guardarAjusteMasivo() {
    const farmacia = this.formFiltros.get('farmacia')?.value;
    if (!farmacia) return;

    const existenciaNum = Number(this.ajusteMasivo.existencia);
    const stockMaxNum = Number(this.ajusteMasivo.stockMax);
    const stockMinNum = Number(this.ajusteMasivo.stockMin);

    const ajustarExistencia = !isNaN(existenciaNum);
    const ajustarStockMax = !isNaN(stockMaxNum);
    const ajustarStockMin = !isNaN(stockMinNum);


    // Filtrar productos a ajustar
    const productosAjustar = this.inventario.filter(p =>
      p.seleccionado &&
      (
        (ajustarExistencia && p.existencia !== existenciaNum) ||
        (ajustarStockMax && p.stockMax !== stockMaxNum) ||
        (ajustarStockMin && p.stockMin !== stockMinNum)
      )
    );

    if (productosAjustar.length === 0) {
      Swal.fire('Sin cambios', 'No hay productos seleccionados o no hay cambios para aplicar.', 'info');
      return;
    }

    const cambios = productosAjustar.map(p => {
      const cambio: any = { id: p._id };
      if (ajustarExistencia) cambio.existencia = existenciaNum;
      if (ajustarStockMax) cambio.stockMax = stockMaxNum;
      if (ajustarStockMin) cambio.stockMin = stockMinNum;
      return cambio;
    });

    this.inventarioService.actualizarMasivo(farmacia, cambios).subscribe({
      next: () => {
        for (const p of productosAjustar) {
          if (ajustarExistencia && existenciaNum > 0 ) {
            p.existencia = existenciaNum;
            p.copiaOriginal.existencia = existenciaNum;
          }
          if (ajustarStockMax && stockMaxNum > 0) {
            p.stockMax = stockMaxNum;
            p.copiaOriginal.stockMax = stockMaxNum;
          }
          if (ajustarStockMin && stockMinNum > 0) {
            p.stockMin = stockMinNum;
            p.copiaOriginal.stockMin = stockMinNum;
          }
        }
        Swal.fire('Actualizado', 'Ajustes aplicados correctamente.', 'success');
        this.ajusteMasivo.existencia = 0;
        this.ajusteMasivo.stockMax = 0;
        this.ajusteMasivo.stockMin = 0;
      },
      error: (err) => {
        console.error('Error en ajuste masivo', err);
        Swal.fire('Error', 'No se pudieron aplicar los ajustes.', 'error');
      }
    });
  }



  guardarFila(i: any) {
    const id = i._id;

    // Validaciones generales
    const campos = [
      { campo: 'existencia', valor: i.existencia },
      { campo: 'stockMax', valor: i.stockMax },
      { campo: 'stockMin', valor: i.stockMin },
      { campo: 'precioVenta', valor: i.precioVenta }
    ];


    for (const { campo, valor } of campos) {
      if (valor === null || valor === undefined || valor === '') {
        Swal.fire('Campo vacío', `El campo "${campo}" es obligatorio.`, 'warning');
        return;
      }
      if (isNaN(valor) || valor < 0) {
        Swal.fire('Valor inválido', `El campo "${campo}" no puede ser negativo.`, 'warning');
        return;
      }
    }

    // Validación: stockMin no mayor a stockMax
    if (i.stockMin > i.stockMax) {
      Swal.fire({
        icon: 'warning',
        title: 'Stock mínimo inválido',
        text: 'El stock mínimo no puede ser mayor que el stock máximo.'
      });
      return;
    }

    if (
      i.existencia == null ||
      isNaN(i.existencia) ||
      !Number.isInteger(i.existencia) ||
      i.existencia < 0
    ) {
      Swal.fire('Valor inválido', 'La existencia debe ser un número entero y no negativo.', 'warning');
      return;
    }

    if (
      i.precioVenta == null ||
      isNaN(i.precioVenta) ||
      i.precioVenta <= 0 ||
      !/^\d+(\.\d{1,2})?$/.test(i.precioVenta.toString())
    ) {
      Swal.fire('Valor inválido', 'El precio de venta debe ser un número positivo con hasta 2 decimales.', 'warning');
      return;
    }

    // Verificar si hubo cambios
    const cambios =
      i.existencia !== i.copiaOriginal.existencia ||
      i.stockMax !== i.copiaOriginal.stockMax ||
      i.stockMin !== i.copiaOriginal.stockMin ||
      i.precioVenta !== i.copiaOriginal.precioVenta;

    if (!cambios) {
      Swal.fire({
        icon: 'info',
        title: 'Sin cambios',
        text: 'No se detectaron cambios en este producto.'
      });
      return;
    }

    this.estadoGuardado[id] = 'guardando';

    this.inventarioService.actualizarUno(id, {
      existencia: i.existencia,
      stockMax: i.stockMax,
      stockMin: i.stockMin,
      precioVenta: i.precioVenta
    }).subscribe({
      next: () => {
        i.copiaOriginal = {
          existencia: i.existencia,
          stockMax: i.stockMax,
          stockMin: i.stockMin,
          precioVenta: i.precioVenta
        };
        this.estadoGuardado[id] = 'exito';
        setTimeout(() => {
          this.estadoGuardado[id] = 'idle';
        }, 1500);
        Swal.fire({
          icon: 'info',
          title: 'Éxito',
          text: 'El producto fue actualizado correctamente.'
        });
        this.buscar();
        this.estadoEdicion[i._id] = false;
      },
      error: (err) => {
        console.error('Error al guardar fila:', err);
        this.estadoGuardado[id] = 'idle';
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo guardar el producto.'
        });
      }
    });
  }


  get nombreFarmaciaSeleccionada(): string {
    const id = this.formFiltros.get('farmacia')?.value;
    const farmacia = this.farmacias.find(f => f._id === id);
    return farmacia?.nombre || 'Farmacia';
  }

  get totalPaginas(): number {
    return Math.ceil(this.inventario.length / this.tamanoPagina);
  }

  get inventarioPaginado() {
    const inicio = (this.paginaActual - 1) * this.tamanoPagina;
    return this.inventario.slice(inicio, inicio + this.tamanoPagina);
  }

  paginaAnterior() {
    if (this.paginaActual > 1) this.paginaActual--;
  }

  paginaSiguiente() {
    if (this.paginaActual < this.totalPaginas) this.paginaActual++;
  }

  irAPrimera() {
    this.paginaActual = 1;
  }

  irAUltima() {
    this.paginaActual = this.totalPaginas;
  }

  sePuedeGuardar(i: any): boolean {
    if (!i || !i.copiaOriginal) return false;

    const cambios =
      i.existencia !== i.copiaOriginal.existencia ||
      i.stockMax !== i.copiaOriginal.stockMax ||
      i.stockMin !== i.copiaOriginal.stockMin ||
      i.precioVenta !== i.copiaOriginal.precioVenta;

    const valoresValidos =
      i.existencia >= 0 &&
      i.stockMax >= 0 &&
      i.stockMin >= 0 &&
      i.precioVenta >= 0;

    return cambios && valoresValidos;
  }

  get deshabilitarBotonAplicar(): boolean {
    const { existencia, stockMax, stockMin } = this.ajusteMasivo;

    // Convertimos explícitamente
    const existenciaNum = Number(existencia);
    const stockMaxNum = Number(stockMax);
    const stockMinNum = Number(stockMin);

    const ajustarExistencia = !isNaN(existenciaNum);
    const ajustarStockMax = !isNaN(stockMaxNum);
    const ajustarStockMin = !isNaN(stockMinNum);

    const stockMaxValido = ajustarStockMax && Number.isInteger(stockMaxNum) && stockMaxNum > 0;
    const stockMinValido = ajustarStockMin && Number.isInteger(stockMinNum) && stockMinNum > 0;
    const existenciaValida = ajustarExistencia && Number.isInteger(existenciaNum) && existenciaNum > 0;

    // Solo evaluamos relación si ambos stocks son válidos
    const stocksRelacionValidos = (stockMaxValido && stockMinValido)
      ? stockMinNum <= stockMaxNum
      : true;

    // ✅ Botón se habilita si al menos un campo válido y coherente
    const camposValidos =
      (existenciaValida && stockMaxNum <= 0 && stockMinNum <= 0) || // Solo existencia
      (stockMaxValido && stockMinValido && stocksRelacionValidos) || // Solo stocks
      (existenciaValida && stockMaxValido && stockMinValido && stocksRelacionValidos); // Todos

    return !camposValidos;
  }

habilitarEdicion(id: string): void {
  this.estadoEdicion[id] = true;
}

cancelarEdicion(item: any) {
  item.existencia = item.copiaOriginal.existencia;
  item.stockMax = item.copiaOriginal.stockMax;
  item.stockMin = item.copiaOriginal.stockMin;
  item.precioVenta = item.copiaOriginal.precioVenta;
  this.estadoEdicion[item._id] = false;
  this.estadoGuardado[item._id] = 'idle';
}

limpiarFiltro(campo: string) {
  this.formFiltros.get(campo)?.setValue('');
  this.buscar();
}

}

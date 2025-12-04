import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InventarioPortatilService } from '../inventario-portatil.service';
import { CommonModule, DatePipe } from '@angular/common';
import Swal from 'sweetalert2';
import { FormsModule } from '@angular/forms';
import { InventarioTitleService } from '../inventario-title.service';

@Component({
  selector: 'app-ajustar-existencia',
  standalone: true,
  imports: [FormsModule, CommonModule, DatePipe],
  templateUrl: './ajustar-existencia.component.html',
  styleUrls: ['./ajustar-existencia.component.css']
})
export class AjustarExistenciaComponent implements OnInit {

  farmaciaId = '';
  productoId = '';

  rol = '';
  farmaciaNombre = '';

  producto: any = null;

  existenciaActual: number = 0;
  nuevaExistencia: number = 0;

  lotes: any[] = [];
  modoLote: 'agregar' | 'editar' | null = null;
  loteForm = { lote: '', fechaCaducidad: '', cantidad: 0 };
  loteEditandoId: string | null = null;

  titulo = '';

  botonSalirTexto = 'Salir'

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventarioPortatilService,
    private titleService: InventarioTitleService
  ) { }

  ngOnInit() {
    this.farmaciaId = this.route.snapshot.params['farmaciaId'];
    this.productoId = this.route.snapshot.params['productoId'];

    const user = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.rol = user.rol;
    this.farmaciaNombre = user.farmacia?.nombre || '';

    // ============================
    // CARGAR PRODUCTO
    // ============================
    this.invService.obtenerProducto(this.productoId).subscribe(p => {
      this.producto = p;
    });

    // ============================
    // DEFINIR TÍTULO
    // ============================
    if (this.farmaciaId === 'almacen') {
      this.titleService.setTitulo('Inventario – Almacén');
    } else {
      this.titulo = `Inventario – ${user.farmacia?.nombre || ''}`;
    }

    // ============================
    // CARGAR DATOS SEGÚN TIPO
    // ============================
    if (this.farmaciaId === 'almacen') {

      // ✔ Cargar lotes correctamente
      this.invService.obtenerLotes(this.productoId)
        .subscribe(l => this.lotes = l);

    } else {

      // ✔ Cargar existencia real correctamente
      this.invService.obtenerInventario(this.farmaciaId, this.productoId)
        .subscribe(inv => {
          this.existenciaActual = inv?.existencia ?? 0;
          this.nuevaExistencia = this.existenciaActual;
        });
    }

    if (this.rol === 'ajustaAlmacen') this.botonSalirTexto = 'Ir al menú'

  }


  // ==========================================================
  // GUARDAR EXISTENCIA (solo farmacia)
  // ==========================================================
  guardar() {
    if (this.farmaciaId === 'almacen') return;

    this.invService.ajustarExistencia(this.farmaciaId, this.productoId, this.nuevaExistencia)
      .subscribe({
        next: () => Swal.fire('Éxito', 'Existencia actualizada', 'success'),
        error: () => Swal.fire('Error', 'No se pudo actualizar', 'error')
      });
  }



  // ==========================================================
  // LOTES (solo almacén)
  // ==========================================================
  abrirAgregarLote() {
    this.modoLote = 'agregar';

    const nextNumber = this.lotes.length + 1;
    const padded = String(nextNumber).padStart(2, '0');

    this.loteForm = {
      lote: `LOTE-${padded}`,
      fechaCaducidad: '',
      cantidad: 0
    };
  }


  abrirEditarLote(l: any) {
    this.modoLote = 'editar';
    this.loteEditandoId = l._id;

    this.loteForm = {
      lote: l.lote,
      fechaCaducidad: l.fechaCaducidad?.substring(0, 10) || '',
      cantidad: l.cantidad
    };
  }


  guardarLote() {
    if (this.modoLote === 'agregar') {
      this.invService.agregarLote(this.productoId, this.loteForm).subscribe(() => {
        this.recargarLotes();
        this.modoLote = null;
      });

    } else {
      this.invService.editarLote(this.productoId, this.loteEditandoId!, this.loteForm).subscribe(() => {
        this.recargarLotes();
        this.modoLote = null;
      });
    }
  }


  eliminarLote(l: any) {
    Swal.fire({
      title: '¿Eliminar lote?',
      text: l.lote,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    }).then(r => {
      if (r.isConfirmed) {
        this.invService.eliminarLote(this.productoId, l._id).subscribe(() => this.recargarLotes());
      }
    });
  }


  recargarLotes() {
    this.invService.obtenerLotes(this.productoId)
      .subscribe(l => this.lotes = l);
  }


  // ============================
  // NAVEGACIÓN
  // ============================
  siguiente() {
    this.router.navigate(['/inventario-portatil/buscar', this.farmaciaId]);
  }

  salir() {
    if (this.rol === 'ajustaAlmacen') {
      this.router.navigate(['/inventario-portatil/seleccionar']);
    } else {
      localStorage.clear();
      window.location.href = '/login';
    }
  }
}

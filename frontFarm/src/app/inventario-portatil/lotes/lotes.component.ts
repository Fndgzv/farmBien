import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InventarioPortatilService } from '../inventario-portatil.service';
import Swal from 'sweetalert2';

interface Lote {
  _id: string;
  lote: string;
  fechaCaducidad?: string;
  cantidad: number;
}

@Component({
  standalone: true,
  selector: 'app-lotes',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './lotes.component.html',
  styleUrls: ['./lotes.component.css']
})
export class LotesComponent implements OnInit {

  productoId = '';
  productoNombre = '';

  lotes: any[] = [];

  // Para agregar/editar
  modo = 'listar'; // listar | agregar | editar
  loteIdEditando: string | null = null;

  formLote = {
    lote: '',
    fechaCaducidad: '',
    cantidad: 0
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventarioPortatilService
  ) {}

  ngOnInit() {
    this.productoId = this.route.snapshot.params['productoId'];
    this.cargarLotes();
  }

  cargarLotes() {
    this.invService.obtenerLotes(this.productoId).subscribe({
      next: (res) => {
        this.lotes = res;
      },
      error: () => Swal.fire("Error", "No se pudieron cargar los lotes", "error")
    });
  }

  irAjusteExistencia() {
    this.router.navigate(['/inventario-portatil/ajustar/almacen', this.productoId]);
  }

  nuevoLote() {
    this.modo = 'agregar';
    this.formLote = {
      lote: '',
      fechaCaducidad: '',
      cantidad: 0
    };
  }

  editarLote(l: Lote) {
    this.modo = 'editar';
    this.loteIdEditando = l._id;
    this.formLote = {
      lote: l.lote || '',
      fechaCaducidad: l.fechaCaducidad ? l.fechaCaducidad.substring(0, 10) : '',
      cantidad: l.cantidad
    };
  }

  cancelar() {
    this.modo = 'listar';
    this.loteIdEditando = null;
  }

  guardarNuevo() {
    const data = { ...this.formLote };
    data.cantidad = Number(data.cantidad);

    this.invService.agregarLote(this.productoId, data).subscribe({
      next: () => {
        Swal.fire("OK", "Lote agregado", "success");
        this.modo = 'listar';
        this.cargarLotes();
      },
      error: () => Swal.fire("Error", "No se pudo agregar lote", "error")
    });
  }

  guardarEdicion() {
    const data = { ...this.formLote };
    data.cantidad = Number(data.cantidad);

    if (!this.loteIdEditando) return;

    this.invService.editarLote(this.productoId, this.loteIdEditando, data).subscribe({
      next: () => {
        Swal.fire("OK", "Lote actualizado", "success");
        this.modo = 'listar';
        this.cargarLotes();
      },
      error: () => Swal.fire("Error", "No se pudo actualizar lote", "error")
    });
  }

  eliminarLote(l: Lote) {
    Swal.fire({
      title: "¿Eliminar lote?",
      text: `${l.lote}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar"
    }).then(resp => {
      if (resp.isConfirmed) {
        this.invService.eliminarLote(this.productoId, l._id).subscribe({
          next: () => {
            Swal.fire("OK", "Lote eliminado", "success");
            this.cargarLotes();
          },
          error: () => Swal.fire("Error", "No se pudo eliminar lote", "error")
        });
      }
    });
  }
}

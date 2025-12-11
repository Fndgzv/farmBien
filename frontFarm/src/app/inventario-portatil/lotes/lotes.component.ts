import { Component, OnInit, Input, ViewChild } from '@angular/core';
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

  @Input() productoId: string = '';
  @ViewChild('inputCantidad') inputCantidad!: any;

  productoNombre = '';

  lotes: any[] = [];

  // Para agregar/editar
  modo = 'listar'; // listar | agregar | editar
  loteIdEditando: string | null = null;

  formLote: {
    lote: string;
    fechaCaducidad: string;
    cantidad: string;
  } = {
      lote: '',
      fechaCaducidad: '',
      cantidad: ''
    };


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventarioPortatilService
  ) { }

  ngOnInit() {
    /* this.productoId = this.route.snapshot.params['productoId'];
    this.cargarLotes(); */
  }

  ngOnChanges() {
    if (this.productoId) {
      this.cargarLotes();
    }
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
      lote: this.generarNombreDeLote(),
      fechaCaducidad: this.calcularFechaCaducidadDefault(),
      cantidad: ''
    };

    setTimeout(() => {
      this.inputCantidad?.nativeElement?.focus();
    }, 100);
  }

  editarLote(l: Lote) {
    this.modo = 'editar';
    this.loteIdEditando = l._id;

    this.formLote = {
      lote: l.lote,
      fechaCaducidad: l.fechaCaducidad?.substring(0, 10) || this.calcularFechaCaducidadDefault(),
      cantidad: ''
    };

    setTimeout(() => {
      this.inputCantidad?.nativeElement?.focus();
    }, 100);
  }


  cancelar() {
    this.modo = 'listar';
    this.loteIdEditando = null;
  }

  guardarNuevo() {

    // 🔥 Si el usuario dejó vacío el nombre del lote → generar automático
    if (!this.formLote.lote || this.formLote.lote.trim() === "") {
      this.formLote.lote = this.generarNombreLote();
    }

    // 🔥 VALIDAR DUPLICADO
    if (this.existeNombreDeLote(this.formLote.lote)) {
      Swal.fire({
        icon: "error",
        title: "Lote duplicado",
        text: "Ya existe un lote con ese nombre. Usa otro nombre."
      });
      return;
    }

    // 🔥 VALIDAR CANTIDAD NEGATIVA
    const cant = Number(this.formLote.cantidad);

    if (isNaN(cant) || cant < 0) {
      Swal.fire({
        icon: "error",
        title: "Cantidad inválida",
        text: "La cantidad no puede ser negativa.",
      });
      return;
    }

    const data = {
      lote: this.formLote.lote,
      fechaCaducidad: this.formLote.fechaCaducidad,
      cantidad: Number(this.formLote.cantidad || 0)
    };

    this.invService.agregarLote(this.productoId, data).subscribe({
      next: () => {
        Swal.fire({
          icon: 'success',
          title: 'Éxito',
          text: 'El lote fue agregado correctamente.',
          timer: 1200,
          timerProgressBar: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
        });
        this.modo = 'listar';
        this.cargarLotes();
      },
      error: () => Swal.fire("Error", "No se pudo agregar lote", "error")
    });
  }

  guardarEdicion() {
    if (!this.loteIdEditando) return;

    // 🔥 Si el nombre quedó vacío → generar uno nuevo
    if (!this.formLote.lote || this.formLote.lote.trim() === "") {
      this.formLote.lote = this.generarNombreLote();
    }

    // 🔥 VALIDAR DUPLICADO EXCLUYENDO EL MISMO LOTE
    if (this.existeNombreDeLote(this.formLote.lote, this.loteIdEditando)) {
      Swal.fire({
        icon: "error",
        title: "Lote duplicado",
        text: "Ya existe otro lote con ese nombre."
      });
      return;
    }

    // 🔥 VALIDAR CANTIDAD NEGATIVA
    const cant = Number(this.formLote.cantidad);
    if (isNaN(cant) || cant < 0) {
      Swal.fire({
        icon: "error",
        title: "Cantidad inválida",
        text: "La cantidad no puede ser negativa."
      });
      return;
    }

    const data = {
      lote: this.formLote.lote,
      fechaCaducidad: this.formLote.fechaCaducidad,
      cantidad: Number(this.formLote.cantidad || 0)
    };

    this.invService.editarLote(this.productoId, this.loteIdEditando, data).subscribe({
      next: () => {
        Swal.fire({
              icon: 'success',
              title: 'Éxito',
              text: 'El lote fue actualizado correctamente.',
              timer: 1200,
              timerProgressBar: true,
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
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
            Swal.fire({
              icon: 'success',
              title: 'Éxito',
              text: 'El lote fue eliminado correctamente.',
              timer: 1200,
              timerProgressBar: true,
              allowOutsideClick: false,
              allowEscapeKey: false,
            });
            this.cargarLotes();
          },
          error: () => Swal.fire("Error", "No se pudo eliminar lote", "error")
        });
      }
    });
  }

  private calcularFechaCaducidadDefault(): string {
    const hoy = new Date();
    const año = hoy.getFullYear() + 1;
    const mes = hoy.getMonth();

    // último día del mes siguiente
    const ultimoDia = new Date(año, mes + 1, 0);

    return ultimoDia.toISOString().substring(0, 10);
  }

  private generarNombreDeLote(): string {
    if (!this.lotes.length) return "LOTE-01";

    // Buscar el mayor número ya usado
    const nums = this.lotes
      .map(l => {
        const match = String(l.lote).match(/LOTE-(\d+)/);
        return match ? Number(match[1]) : 0;
      })
      .filter(n => n > 0);

    const max = nums.length ? Math.max(...nums) : 0;
    const next = (max + 1).toString().padStart(2, '0');

    return `LOTE-${next}`;
  }

  private existeNombreDeLote(nombre: string, ignorarId: string | null = null): boolean {
    const nom = nombre.trim().toLowerCase();

    return this.lotes.some(l =>
      l.lote.trim().toLowerCase() === nom &&
      l._id !== ignorarId
    );
  }

  private generarNombreLote(): string {
    const total = this.lotes.length + 1;
    return `LOTE-${String(total).padStart(2, '0')}`;
  }

}

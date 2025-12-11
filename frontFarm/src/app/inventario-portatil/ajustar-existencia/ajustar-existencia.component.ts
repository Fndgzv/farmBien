import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InventarioPortatilService } from '../inventario-portatil.service';
import { CommonModule, DatePipe } from '@angular/common';
import Swal from 'sweetalert2';
import { FormsModule } from '@angular/forms';
import { InventarioTitleService } from '../inventario-title.service';
import { LotesComponent } from '../lotes/lotes.component';

@Component({
  selector: 'app-ajustar-existencia',
  standalone: true,
  imports: [FormsModule, CommonModule, LotesComponent],
  templateUrl: './ajustar-existencia.component.html',
  styleUrls: ['./ajustar-existencia.component.css']
})
export class AjustarExistenciaComponent implements OnInit {
  @ViewChild('inputExistencia') inputExistencia!: ElementRef;

  farmaciaId = '';
  productoId = '';

  rol = '';
  farmaciaNombre = '';

  producto: any = null;

  existenciaActual: number = 0;
  nuevaExistencia: number = 0;

  titulo = '';

  botonSalirTexto = 'Salir'

  campoInvalido: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventarioPortatilService,
    private titleService: InventarioTitleService
  ) { }

  ngAfterViewInit() {
    // 🔥 Solo aplica para farmacia, NO almacén
    if (this.farmaciaId !== 'almacen') {
      setTimeout(() => {
        if (this.inputExistencia?.nativeElement) {
          this.inputExistencia.nativeElement.focus();
          this.inputExistencia.nativeElement.select(); // Seleccionar texto si hay
        }
      }, 100);
    }
  }

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


    if (this.farmaciaId !== 'almacen') {

      // ✔ Cargar existencia real correctamente
      this.invService.obtenerInventario(this.farmaciaId, this.productoId)
        .subscribe(inv => {
          this.existenciaActual = inv?.existencia ?? 0;
          this.nuevaExistencia = null as any;
        });
    }


    if (this.rol === 'ajustaAlmacen') this.botonSalirTexto = 'Ir al menú'

  }


  // ==========================================================
  // GUARDAR EXISTENCIA (solo farmacia)
  // ==========================================================
  guardar() {

    if (this.farmaciaId === 'almacen') return;

    // 🔥 VALIDACIÓN: no permitir valores vacíos, null, undefined o negativos
    if (
      this.nuevaExistencia === null ||
      this.nuevaExistencia === undefined ||
      isNaN(this.nuevaExistencia) ||
      this.nuevaExistencia < 0
    ) {
      this.campoInvalido = true;

      Swal.fire({
        icon: 'warning',
        title: 'Cantidad requerida',
        text: 'Por favor ingresa la existencia física del producto.',
        confirmButtonText: 'Aceptar'
      }).then(() => {
        // 🔥 DAR FOCO AL INPUT CUANDO CIERRA SWEETALERT
        setTimeout(() => {
          if (this.inputExistencia?.nativeElement) {
            const el = this.inputExistencia.nativeElement;
            el.focus();
            el.select();   // 👈 SELECCIONA TODO EL TEXTO EXISTENTE
          }
        }, 50);
      });

      return;
    }

    this.campoInvalido = false;

    this.invService.ajustarExistencia(
      this.farmaciaId,
      this.productoId,
      Number(this.nuevaExistencia)
    )
      .subscribe({
        next: () => {
          Swal.fire({
            icon: 'success',
            title: 'Existencia actualizada',
            text: `Nueva existencia: ${this.nuevaExistencia}`,
            confirmButtonText: 'Aceptar',
            timer: 1200,
            timerProgressBar: true,
          }).then(() => {

            // Puedes decidir si redirigir aquí o no
            this.siguiente();

          });
        },
        error: () =>
          Swal.fire('Error', 'No se pudo actualizar', 'error')
      });

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

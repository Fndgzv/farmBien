import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InventarioPortatilService } from '../inventario-portatil.service';
import { CommonModule, DatePipe } from '@angular/common';
import Swal from 'sweetalert2';
import { FormsModule } from '@angular/forms';
import { InventarioTitleService } from '../inventario-title.service';
import { LotesComponent } from '../lotes/lotes.component';
import { AuthService } from '../../services/auth.service';

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
  nuevaExistencia: number | null = null;

  titulo = '';

  botonSalirTexto = 'Salir'

  campoInvalido: boolean = false;
  guardando = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventarioPortatilService,
    private titleService: InventarioTitleService,
    private authService: AuthService
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

      if (this.farmaciaId === 'almacen') {
        const inicializada = this.invService.inicializarUbicacionTemporal(p?.ubicacion || '');
        if (inicializada) {
          this.invService.marcarUbicacionGuardada(
            this.claveUbicacion,
            p?.ubicacion || ''
          );
        }
      }
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
          this.nuevaExistencia = null;

          const inicializada = this.invService.inicializarUbicacionTemporal(
            inv?.ubicacionFarmacia || ''
          );
          if (inicializada) {
            this.invService.marcarUbicacionGuardada(
              this.claveUbicacion,
              inv?.ubicacionFarmacia || ''
            );
          }
        });
    }


    if (this.rol === 'ajustaAlmacen') this.botonSalirTexto = 'Ir al menú'

  }


  // ==========================================================
  // GUARDAR EXISTENCIA (solo farmacia)
  // ==========================================================
  guardar() {

    if (this.farmaciaId === 'almacen' || this.guardando) return;

    const existenciaOmitida =
      this.nuevaExistencia === null ||
      this.nuevaExistencia === undefined ||
      isNaN(Number(this.nuevaExistencia));
    const existenciaInvalida =
      !existenciaOmitida && Number(this.nuevaExistencia) < 0;
    const ubicacionLimpia = this.ubicacion.trim();

    if (existenciaInvalida || (existenciaOmitida && !ubicacionLimpia)) {
      this.mostrarCantidadRequerida();
      return;
    }

    this.campoInvalido = false;
    this.guardando = true;
    const existencia = existenciaOmitida
      ? undefined
      : Number(this.nuevaExistencia);

    this.invService.ajustarExistencia(
      this.farmaciaId,
      this.productoId,
      existencia,
      ubicacionLimpia
    )
      .subscribe({
        next: () => {
          if (ubicacionLimpia) {
            this.invService.marcarUbicacionGuardada(
              this.claveUbicacion,
              ubicacionLimpia
            );
          }

          const soloUbicacion = existencia === undefined;
          Swal.fire({
            icon: 'success',
            title: soloUbicacion ? 'Ubicación actualizada' : 'Producto actualizado',
            text: soloUbicacion
              ? `Ubicación: ${ubicacionLimpia}`
              : `Nueva existencia: ${this.nuevaExistencia}`,
            confirmButtonText: 'Aceptar',
            timer: 1200,
            timerProgressBar: true,
          }).then(() => {
            this.navegarAlBuscador();
          });
        },
        error: () => {
          this.guardando = false;
          const mensaje = ubicacionLimpia
            ? 'No se pudo actualizar la ubicación ni completar el guardado.'
            : 'No se pudo actualizar la existencia.';
          Swal.fire('Error', mensaje, 'error');
        }
      });

  }


  // ============================
  // NAVEGACIÓN
  // ============================
  siguiente() {
    if (this.guardando) return;

    if (!this.invService.ubicacionRequiereGuardado(this.claveUbicacion)) {
      this.navegarAlBuscador();
      return;
    }

    const ubicacionLimpia = this.ubicacion.trim();
    this.guardando = true;

    const peticion = this.farmaciaId === 'almacen'
      ? this.invService.actualizarUbicacionAlmacen(this.productoId, ubicacionLimpia)
      : this.invService.ajustarExistencia(
        this.farmaciaId,
        this.productoId,
        undefined,
        ubicacionLimpia
      );

    peticion.subscribe({
      next: () => {
        this.invService.marcarUbicacionGuardada(
          this.claveUbicacion,
          ubicacionLimpia
        );
        this.navegarAlBuscador();
      },
      error: () => {
        this.guardando = false;
        Swal.fire(
          'Error',
          'No se pudo actualizar la ubicación. Intenta nuevamente.',
          'error'
        );
      }
    });
  }

  get ubicacion(): string {
    return this.invService.obtenerUbicacionTemporal();
  }

  set ubicacion(valor: string) {
    this.invService.establecerUbicacionTemporal(valor);
  }

  private get claveUbicacion(): string {
    return this.farmaciaId === 'almacen'
      ? this.invService.claveUbicacionAlmacen(this.productoId)
      : this.invService.claveUbicacionFarmacia(this.farmaciaId, this.productoId);
  }

  private navegarAlBuscador() {
    this.router.navigate(['/inventario-portatil/buscar', this.farmaciaId]);
  }

  private mostrarCantidadRequerida() {
    this.campoInvalido = true;

    Swal.fire({
      icon: 'warning',
      title: 'Cantidad requerida',
      text: 'Por favor ingresa la existencia física del producto.',
      confirmButtonText: 'Aceptar'
    }).then(() => {
      setTimeout(() => {
        if (this.inputExistencia?.nativeElement) {
          const el = this.inputExistencia.nativeElement;
          el.focus();
          el.select();
        }
      }, 50);
    });
  }

  salir() {
    this.invService.limpiarUbicacionTemporal();

    if (this.rol === 'ajustaAlmacen') {
      this.router.navigate(['/inventario-portatil/seleccionar']);
    } else {
      this.authService.logout();
    }
  }
}

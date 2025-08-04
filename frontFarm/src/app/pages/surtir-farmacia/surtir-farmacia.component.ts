import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';

import Swal from 'sweetalert2';

import { FarmaciaService } from '../../services/farmacia.service';
import { SurtidoFarmaciaService } from '../../services/surtido-farmacia.service';

interface Pendiente {
  producto: string;
  nombre: string;
  existenciaActual: number;
  stockMin: number;
  stockMax: number;
  falta: number;
  disponibleEnAlmacen: number;
}

@Component({
  selector: 'app-surtir-farmacia',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './surtir-farmacia.component.html',
  styleUrl: './surtir-farmacia.component.css'
})

export class SurtirFarmaciaComponent implements OnInit {
  form: FormGroup;
  farmacias: any[] = [];
  pendientes: Pendiente[] = [];
  cargando = false;

  constructor(
    private fb: FormBuilder,
    private farmaciaService: FarmaciaService,
    private surtidoService: SurtidoFarmaciaService
  ) {
    this.form = this.fb.group({
      farmaciaId: [null, Validators.required],
    });
  }

  ngOnInit() {
    // 1) Cargo el select de farmacias
    this.farmaciaService.obtenerFarmacias().subscribe(data => {
      this.farmacias = data;
    });
  }

  private toggleFarmacia(disabled: boolean) {
    const farmCtrl = this.form.get('farmaciaId')!;
    disabled ? farmCtrl.disable() : farmCtrl.enable();
  }

  onAceptar() {
    if (this.form.invalid) return;
    this.cargando = true;
    const farmaciaId = this.form.value.farmaciaId;

    this.surtidoService.obtenerPendientes(farmaciaId).subscribe({
      next: ({ pendientes }) => {
        this.pendientes = pendientes;
        this.cargando = false;

        if (pendientes.length === 0) {
          Swal.fire({
            icon: 'info',
            title: 'Sin pendientes',
            html: `No hay productos con existencia ≤ stock mínimo`,
            confirmButtonText: 'Aceptar',
            allowOutsideClick: false,
            allowEscapeKey: false
          });
          return;
        }

        this.toggleFarmacia(true);
      },
      error: (err) => {
        console.error(err);
        Swal.fire('Error', 'No se pudieron cargar los productos.', 'error');
        this.cargando = false;
      }
    });

  }

  onSurtir() {
    const farmaciaId = this.form.value.farmaciaId;
    const farmNombre = this.farmacias.find(f => f._id === farmaciaId)?.nombre || '';

    Swal.fire({
      icon: 'question',
      title: 'Confirmar surtido',
      html: `Se surtirá a la farmacia <strong>${farmNombre}</strong> hasta su stock máximo.`,
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false
    }).then(result => {
      if (!result.isConfirmed) {
        this.toggleFarmacia(false);
        return;
      }

      Swal.showLoading();
      this.surtidoService.surtirFarmacia(farmaciaId)
        .subscribe(
          () => {
            Swal.hideLoading();
            Swal.fire({
              icon: 'success',
              title: 'Surtido completado',
              html: '¿Deseas imprimir la hoja de surtido?',
              showCancelButton: true,
              confirmButtonText: 'Sí',
              cancelButtonText: 'No',
              allowOutsideClick: false,
              allowEscapeKey: false
            }).then(() => {
              this.pendientes = [];
              this.form.reset({ farmaciaId: null });
              this.toggleFarmacia(false);
            });
          },
          err => {
            Swal.hideLoading();
            console.error(err);
            Swal.fire('Error', 'No se pudo surtir la farmacia.', 'error');
            this.toggleFarmacia(false);
          }
        );
    });
  }

  onCancelar() {
    this.pendientes = [];
    this.form.reset({ farmaciaId: null });
    this.toggleFarmacia(false);
  }
}

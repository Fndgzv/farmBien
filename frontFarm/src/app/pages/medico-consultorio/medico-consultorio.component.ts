import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';
import { FichasConsultorioService } from '../../services/fichas-consultorio.service';

type ServicioUI = { productoId: string; cantidad: number; notas?: string };

@Component({
  selector: 'app-medico-consultorio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './medico-consultorio.component.html',
})
export class MedicoConsultorioComponent implements OnInit {

  farmaciaNombre = '';

  cola: any[] = [];
  fichaActual: any = null;

  // edición
  notasMedico = '';
  motivoEditable = '';
  servicios: ServicioUI[] = [];

  guardando = false;

  constructor(private fichasService: FichasConsultorioService) {}

  async ngOnInit() {
    // (opcional) mostrar farmacia del localStorage
    const stored = localStorage.getItem('user_farmacia');
    const f = stored ? JSON.parse(stored) : null;
    this.farmaciaNombre = f?.nombre || '';

    await this.cargarCola();
  }

  async cargarCola() {
    try {
      const resp = await firstValueFrom(this.fichasService.obtenerCola('EN_ESPERA'));
      this.cola = resp?.fichas ?? [];
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'No se pudo cargar la cola', 'error');
    }
  }

  async llamar(f: any) {
    try {
      const resp = await firstValueFrom(this.fichasService.llamarFicha(f._id));
      this.fichaActual = resp?.ficha;

      // iniciar UI
      this.notasMedico = '';
      this.motivoEditable = this.fichaActual?.motivo || '';
      this.servicios = [{ productoId: '', cantidad: 1, notas: '' }];

      // refrescar cola
      await this.cargarCola();
    } catch (e: any) {
      console.error(e);
      Swal.fire('No se pudo llamar', e?.error?.msg || 'Error', 'error');
    }
  }

  agregarRenglonServicio() {
    this.servicios.push({ productoId: '', cantidad: 1, notas: '' });
  }

  quitarServicio(i: number) {
    this.servicios.splice(i, 1);
  }

  cancelarAtencion() {
    this.fichaActual = null;
    this.servicios = [];
    this.notasMedico = '';
    this.motivoEditable = '';
  }

  async guardarYEnviarACaja() {
    if (!this.fichaActual?._id) return;

    // validación mínima frontend (luego la hacemos más inteligente)
    const serviciosOk = this.servicios
      .map(s => ({ ...s, productoId: (s.productoId || '').trim() }))
      .filter(s => s.productoId);

    if (serviciosOk.length === 0) {
      Swal.fire('Faltan servicios', 'Agrega al menos el renglón de Consulta.', 'warning');
      return;
    }

    this.guardando = true;
    try {
      const payload = {
        servicios: serviciosOk,
        notasMedico: (this.notasMedico || '').trim(),
        // (opcional) si quieres permitir ajustar motivo:
        // motivo: (this.motivoEditable || '').trim()
      };

      const resp = await firstValueFrom(
        this.fichasService.actualizarServicios(this.fichaActual._id, payload)
      );

      Swal.fire('Listo', 'Ficha enviada a caja para cobro.', 'success');

      this.fichaActual = null;
      this.servicios = [];
      this.notasMedico = '';
      this.motivoEditable = '';

      await this.cargarCola();
    } catch (e: any) {
      console.error(e);
      Swal.fire('Error', e?.error?.msg || 'No se pudo guardar', 'error');
    } finally {
      this.guardando = false;
    }
  }
}

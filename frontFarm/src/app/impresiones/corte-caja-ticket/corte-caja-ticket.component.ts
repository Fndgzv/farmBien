import { Component, Input, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketHeaderComponent } from '../ticket-header/ticket-header.component';

@Component({
  selector: 'app-corte-caja-ticket',
  imports: [CommonModule, TicketHeaderComponent],
  templateUrl: './corte-caja-ticket.component.html',
  styleUrl: './corte-caja-ticket.component.css',
  encapsulation: ViewEncapsulation.None
})

export class CorteCajaTicketComponent {
  @Input() datosCorte: any

  fechaActual = new Date();

  frasesMotivacion: string[] = [
    'Gracias por tu trabajo y compromiso. Cada turno bien cerrado fortalece a todo el equipo.',
    'Buen trabajo. Tu responsabilidad y dedicación hacen la diferencia.',
    'Gracias por tu honestidad y esfuerzo. Seguimos construyendo confianza como equipo.',
    'Tu trabajo de hoy suma al crecimiento de todos. Gracias por tu compromiso.',
    'Cada detalle cuenta. Gracias por cerrar tu turno con responsabilidad.'
  ];

  fraseSeleccionada = '';

  ngOnInit(): void {
    this.seleccionarFraseDelDia();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datosCorte']) {
      console.log('🟢 datosCorte recibidos en ticket:', this.datosCorte);
    }
  }

  seleccionarFraseDelDia() {
    const hoy = new Date();
    const indice = hoy.getDate() % this.frasesMotivacion.length;
    this.fraseSeleccionada = this.frasesMotivacion[indice];
  }
}
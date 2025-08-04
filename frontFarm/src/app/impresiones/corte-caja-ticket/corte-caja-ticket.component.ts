import { Component, Input, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketFooterComponent } from '../ticket-footer/ticket-footer.component';
import { TicketHeaderComponent } from '../ticket-header/ticket-header.component';


@Component({
  selector: 'app-corte-caja-ticket',
  imports: [CommonModule, TicketFooterComponent, TicketHeaderComponent],
  templateUrl: './corte-caja-ticket.component.html',
  styleUrl: './corte-caja-ticket.component.css',
  encapsulation: ViewEncapsulation.None
})

export class CorteCajaTicketComponent {
  @Input() datosCorte: any

  fechaActual = new Date();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datosCorte']) {
      console.log('🟢 datosCorte recibidos en ticket:', this.datosCorte);
    }
  }

}
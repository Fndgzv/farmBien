import { Component, Input, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketFooterComponent } from '../ticket-footer/ticket-footer.component';
import { TicketHeaderComponent } from '../ticket-header/ticket-header.component';


@Component({
  selector: 'app-pedido-ticket',
  imports: [CommonModule, TicketFooterComponent, TicketHeaderComponent],
  templateUrl: './pedido-ticket.component.html',
  styleUrl: './pedido-ticket.component.css'
})
export class PedidoTicketComponent {
    @Input() pedido: any; 

    fechaActual = new Date();

    ngOnChanges(changes: SimpleChanges): void {
  if (changes['pedido']) {
    console.log('🟢 Pedido recibido en ticket:', this.pedido);
  }
}

}

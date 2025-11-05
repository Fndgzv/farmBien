import { Component, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketFooterComponent } from '../ticket-footer/ticket-footer.component';
import { TicketHeaderComponent } from '../ticket-header/ticket-header.component';
import { PedidoTicketData } from '../ticket-types';
@Component({
  selector: 'app-pedido-ticket',
  imports: [CommonModule, TicketFooterComponent, TicketHeaderComponent],
  templateUrl: './pedido-ticket.component.html',
  styleUrls: ['./pedido-ticket.component.css']
})
export class PedidoTicketComponent {
  @Input({ required: true }) pedido!: PedidoTicketData;

  // Atajos de lectura (evitas null checks en el HTML)
  get header()  { return this.pedido.farmacia; }
  get detalle() { return this.pedido.pedido;   }
  get cliente() { return this.pedido.cliente;  }
  get usuario() { return this.pedido.usuario;  }
  get mov()     { return this.pedido.movimiento; }
  
  fechaActual = new Date();
}

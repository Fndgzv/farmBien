import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketHeaderComponent } from '../ticket-header/ticket-header.component';
import { TicketFooterComponent } from "../ticket-footer/ticket-footer.component";

@Component({
  selector: 'app-devolucion-ticket',
  imports: [CommonModule, TicketFooterComponent, TicketHeaderComponent],
  templateUrl: './devolucion-ticket.component.html',
  styleUrl: './devolucion-ticket.component.css'
})
export class DevolucionTicketComponent {
    @Input() venta: any; 

    fechaActual = new Date();
  
}

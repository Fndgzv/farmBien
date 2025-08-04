import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TicketHeaderComponent } from '../ticket-header/ticket-header.component';
import { TicketFooterComponent } from "../ticket-footer/ticket-footer.component";


@Component({
  selector: 'app-venta-ticket',
  imports: [CommonModule, TicketHeaderComponent, TicketFooterComponent],
  templateUrl: './venta-ticket.component.html',
  styleUrl: './venta-ticket.component.css'
})
export class VentaTicketComponent {
  @Input() venta: any; 

}
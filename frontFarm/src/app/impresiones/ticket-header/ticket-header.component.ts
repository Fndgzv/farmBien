import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-header',
  imports: [CommonModule],
  templateUrl: './ticket-header.component.html',
  styleUrl: './ticket-header.component.css'
})
export class TicketHeaderComponent {
  @Input() nombreFarmacia!: string;
  @Input() direccion!: string;
  @Input() telefono!: string;
}

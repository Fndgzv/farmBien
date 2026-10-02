import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-panel-carga',
  standalone: true,
  imports: [CommonModule],
  template: `
    <fieldset class="controles" [disabled]="activo" [attr.inert]="activo ? '' : null"
      [attr.aria-busy]="activo" aria-label="Controles de inventario">
      <ng-content></ng-content>
    </fieldset>
    <div *ngIf="activo" class="cargando-overlay" role="status" aria-live="polite" aria-atomic="true">
      <span class="cargando-spinner" aria-hidden="true"></span>
      <strong>{{ mensaje }}</strong>
      <span>Espera un momento.</span>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .controles { position: relative; z-index: 0; min-width: 0; margin: 0; padding: 0; border: 0; }
    .controles:disabled { opacity: 0.55; }
    .cargando-overlay {
      position: fixed;
      inset: 0;
      /* Mantener visibles y accesibles las confirmaciones de SweetAlert. */
      z-index: 1400;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.88);
      color: #333;
      cursor: wait;
    }
    .cargando-spinner {
      width: 36px;
      height: 36px;
      border: 4px solid #dce1f5;
      border-top-color: #3f51b5;
      border-radius: 50%;
      animation: girar 0.8s linear infinite;
    }
    @keyframes girar { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .cargando-spinner { animation: none; }
    }
  `]
})
export class PanelCargaComponent {
  @Input() activo = false;
  @Input() mensaje = 'Cargando inventario…';
}

import { Injectable, Injector } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ModalEditarProductoComponent } from '../components/ajuste-inventario/modal-editar-producto/modal-editar-producto.component';
import { Producto } from '../models/producto.model';

@Injectable({
  providedIn: 'root'
})
export class ModalOverlayService {

  private overlayRef?: OverlayRef;

  constructor(
    private overlay: Overlay,
    private injector: Injector
  ) {}

  abrirModal(producto: Producto, callback: (producto: Producto) => void): void {
    // Si ya hay modal abierto, no abrir otro
    if (this.overlayRef) return;

    this.overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      positionStrategy: this.overlay.position()
        .global()
        .centerHorizontally()
        .centerVertically()
    });

    const portal = new ComponentPortal(ModalEditarProductoComponent, null, this.crearInjector(producto, callback));
    const componentRef = this.overlayRef.attach(portal);

    // Cerrar al hacer click en el fondo
    this.overlayRef.backdropClick().subscribe(() => this.cerrarModal());

    // También al emitir desde el propio modal
    componentRef.instance.cerrar.subscribe(() => this.cerrarModal());
    componentRef.instance.guardar.subscribe((productoEditado: Producto) => {
      callback(productoEditado);
      this.cerrarModal();
    });
  }

  private crearInjector(producto: Producto, callback: (producto: Producto) => void): Injector {
    return Injector.create({
      providers: [
        { provide: 'PRODUCTO_DATA', useValue: producto },
        { provide: 'GUARDAR_CALLBACK', useValue: callback }
      ],
      parent: this.injector
    });
  }

  cerrarModal(): void {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
    }
  }
}

import { Injectable } from '@angular/core';
import { forkJoin, map } from 'rxjs';
import { FarmaciaService } from './farmacia.service';
import { ClienteService } from './cliente.service';
import { ProductoService } from './producto.service';

@Injectable({
    providedIn: 'root'
})
export class TicketService {
    constructor(
        private farmaciaService: FarmaciaService,
        private clienteService: ClienteService,
        private productoService: ProductoService
    ) { }

    resolverDatosVenta(venta: any) {
        const farmacia$ = this.farmaciaService.getFarmaciaById(venta.farmacia);
        const cliente$ = this.clienteService.getClienteById(venta.cliente);
        const productosArray = Array.isArray(venta.productos) ? venta.productos : [];

        const productos$ = forkJoin(
            productosArray.map((p: { producto: string }) =>
                this.productoService.obtenerProductoPorId(p.producto).pipe(
                    map(producto => ({
                        ...p,
                        nombre: producto.nombre
                    }))
                )
            )
        );

        return forkJoin({ farmacia: farmacia$, cliente: cliente$, productos: productos$ }).pipe(
            map(({ farmacia, cliente, productos }) => ({
                ...venta,
                farmacia,
                cliente,
                productos
            }))
        );
    }
}

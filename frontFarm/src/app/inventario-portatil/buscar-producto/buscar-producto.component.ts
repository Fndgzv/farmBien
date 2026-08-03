import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InventarioPortatilService } from '../inventario-portatil.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventarioTitleService } from '../inventario-title.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-buscar-producto',
  standalone: true,
  templateUrl: './buscar-producto.component.html',
  imports: [CommonModule, FormsModule],
  styleUrls: ['./buscar-producto.component.css']
})
export class BuscarProductoComponent implements OnInit {
  @ViewChild('inputBuscar') inputBuscar!: ElementRef;


  farmaciaId = '';
  query = '';
  resultados: any[] = [];
  titulo = '';

  botonSalirTexto = 'Salir';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventarioPortatilService,
    private titleService: InventarioTitleService,
    private authService: AuthService
  ) { }

  ngAfterViewInit() {
    setTimeout(() => {
      if (this.inputBuscar?.nativeElement) {
        this.inputBuscar.nativeElement.focus();
      }
    }, 100);
  }


  ngOnInit() {
    this.farmaciaId = this.route.snapshot.params['farmaciaId'];
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    if (this.farmaciaId === 'almacen') {
      this.titleService.setTitulo('Inventario – Almacén');
    } else {
      this.titulo = `Inventario – ${usuario.farmacia?.nombre || ''}`;
    }

    this.botonSalirTexto = usuario.rol === 'ajustaAlmacen' ? 'Ir al menú' : 'Salir';

  }


  buscar() {

    console.log('🔥 EJECUTANDO BUSCAR con:', this.query);

    if (!this.query.trim()) return;

    const q = this.query.trim();

    this.invService.buscar(q).subscribe({
      next: res => {
        this.resultados = res;

        // Si es coincidencia única → ir directo
        if (res.length === 1) {
          this.seleccionar(res[0]);
          return;
        }
      },
      error: () => {
        this.resultados = [];
      }
    });
  }

  seleccionar(p: any) {
    this.router.navigate(['/inventario-portatil/ajustar', this.farmaciaId, p._id]);
  }

  salir() {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.invService.limpiarUbicacionTemporal();

    // Si es AJUSTA ALMACÉN → regresar a seleccionar farmacia
    if (usuario.rol === 'ajustaAlmacen') {
      this.router.navigate(['/inventario-portatil/seleccionar']);
      return;
    }

    // Si es AJUSTA FARMA → cerrar sesión
    this.authService.logout();
  }


}

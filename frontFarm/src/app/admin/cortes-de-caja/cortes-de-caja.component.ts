import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import Swal from 'sweetalert2';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faUserCheck, faEye, faFileInvoice, faTimes } from '@fortawesome/free-solid-svg-icons';

import { FormBuilder, FormGroup } from '@angular/forms';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-cortes-de-caja',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FontAwesomeModule],
  templateUrl: './cortes-de-caja.component.html',
  styleUrl: './cortes-de-caja.component.css'
})
export class CortesDeCajaComponent {

  fechaInicioDesde: string = '';
  fechaInicioHasta: string = '';
  filtroUsuario: string = '';
  cortes: any[] = [];
  filtroForm: FormGroup;
  cargando = false;
   faTimes = faTimes;

  constructor(private http: HttpClient, private fb: FormBuilder, library: FaIconLibrary) {
    const hoy = new Date().toISOString().substring(0, 10);
    this.filtroForm = this.fb.group({
      fechaInicioDesde: [hoy],
      fechaInicioHasta: [hoy],
      nombreUsuario: ['']
    });

    library.addIcons(faUserCheck, faEye, faFileInvoice, faTimes);
  }

  ngOnInit(): void {
    this.buscarCortes();
  }

  buscarCortes(): void {
    const token = localStorage.getItem('auth_token') || '';
    const headers = new HttpHeaders({ 'x-auth-token': token });

    const { fechaInicioDesde, fechaInicioHasta, nombreUsuario } = this.filtroForm.value;

    const params: any = {
      fechaInicioDesde,
      fechaInicioHasta,
    };
    if (nombreUsuario && nombreUsuario.trim().length > 2) {
      params.nombreUsuario = nombreUsuario.trim();
    }

    this.cargando = true;
    this.http.get(`${environment.apiUrl}/cortes/filtrados`, { headers, params }).subscribe({
      next: (resp: any) => {
        this.cortes = resp.cortes;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al buscar cortes:', err);
        Swal.fire('Error', 'No se pudieron cargar los cortes de caja.', 'error');
        this.cargando = false;
      }
    });
  }

autorizarTurnoExtra(corte: any) {
  console.log('Autorizar turno extra para:', corte);
}

mostrarDetalle(corte: any) {
  console.log('Mostrar detalle:', corte);
}

vistaPreviaFinalizar(corte: any) {
  console.log('Vista previa de finalización:', corte);
}


}
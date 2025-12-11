import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { InventarioFisicoService } from '../../services/inventario-fisico.service';

@Component({
    selector: 'app-reporte-inventario-fisico',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reporte-inventario-fisico.component.html',
    styleUrls: ['./reporte-inventario-fisico.component.css']
})
export class ReporteInventarioFisicoComponent implements OnInit {

    cargando = false;
    registros: any[] = [];
    total = 0;

    page = 1;
    limit = 50;
    totalPaginas = 1;

    farmacias: any[] = [];

    textoProducto = '';
    productosFiltrados: any[] = [];

    textoUsuario = '';
    usuariosFiltrados: any[] = [];

    filtros = {
        farmacia: '',
        almacen: false,
        producto: '',
        usuario: '',
        desde: '',
        hasta: ''
    };

    constructor(
        private http: HttpClient,
        private invFisicoService: InventarioFisicoService
    ) { }

    ngOnInit() {
        // ===============================
        // Cargar farmacia del localStorage
        // ===============================
        const stored = localStorage.getItem('user_farmacia');
        const farmaciaLS = stored ? JSON.parse(stored) : null;

        if (!farmaciaLS) {
            Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
            return;
        }

        // El filtro debe usar *ID de farmacia*
        this.filtros.farmacia = farmaciaLS._id;

        // ===============================
        // Fechas por default
        // ===============================
        const hoy = new Date();
        hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset());
        this.filtros.desde = hoy.toISOString().substring(0, 10);
        this.filtros.hasta = hoy.toISOString().substring(0, 10);


        // ===============================
        // Cargar farmacias desde el backend
        // ===============================
        this.http.get('/api/farmacias').subscribe((resp: any) => {
            this.farmacias = resp;
        });

        this.buscar();
    }

    // ======================================
    // PRODUCTOS AUTOCOMPLETE
    // ======================================
    buscarProductos(query: string) {

        console.log("Producto buscando:", query);

        this.textoProducto = query;

        if (!query || query.length < 2) {
            this.productosFiltrados = [];
            return;
        }

        this.http.get('/api/productos/buscar', { params: { q: query } })
            .subscribe((resp: any) => this.productosFiltrados = resp);
    }

    seleccionarProducto(p: any) {
        this.filtros.producto = p._id;
        this.textoProducto = `${p.nombre} (${p.codigoBarras})`;
        this.productosFiltrados = [];
    }

    limpiarProducto() {
        this.filtros.producto = '';
        this.textoProducto = '';
        this.productosFiltrados = [];
    }

    // ======================================
    // USUARIOS AUTOCOMPLETE
    // ======================================
    buscarUsuarios(query: string) {

        console.log("Usuario buscando:", query);

        this.textoUsuario = query;

        if (!query || query.length < 2) {
            this.usuariosFiltrados = [];
            return;
        }

        this.http.get('/api/usuarios/buscar', { params: { q: query } })
            .subscribe((resp: any) => this.usuariosFiltrados = resp);
    }

    seleccionarUsuario(u: any) {
        this.filtros.usuario = u._id;
        this.textoUsuario = u.nombre;
        this.usuariosFiltrados = [];
    }

    limpiarUsuario() {
        this.filtros.usuario = '';
        this.textoUsuario = '';
        this.usuariosFiltrados = [];
    }

    // ======================================
    // BÚSQUEDA PRINCIPAL
    // ======================================
    buscar() {
        this.cargando = true;

        const params: Record<string, string> = {
            farmacia: this.filtros.almacen ? "Almacén" : this.filtros.farmacia,
            almacen: this.filtros.almacen ? "true" : "",
            producto: this.filtros.producto || "",
            usuario: this.filtros.usuario || "",
            desde: this.filtros.desde || "",
            hasta: this.filtros.hasta || "",
            page: String(this.page),
            limit: String(this.limit)
        };

        this.invFisicoService.obtenerRegistros(params)
            .subscribe((resp: any) => {

                // 🔥 Convertir farmaNombre ID → nombre real
                this.registros = resp.resultados.map((r: { farmaNombre: string; }) => {

                    // si es Almacén, dejarlo así
                    if (r.farmaNombre === "Almacén") {
                        return r;
                    }

                    // buscar nombre de farmacia en this.farmacias
                    const f = this.farmacias.find(x => x._id === r.farmaNombre);

                    return {
                        ...r,
                        farmaNombre: f ? f.nombre : r.farmaNombre   // ← si no existe, dejar el ID
                    };
                });

                this.total = resp.total;
                this.totalPaginas = Math.max(1, Math.ceil(this.total / this.limit));
                this.cargando = false;
            });

    }

    // ======================================
    // PAGINACIÓN
    // ======================================
    primera() {
        if (this.page === 1) return;
        this.page = 1;
        this.buscar();
    }

    anterior() {
        if (this.page === 1) return;
        this.page--;
        this.buscar();
    }

    siguiente() {
        if (this.page >= this.totalPaginas) return;
        this.page++;
        this.buscar();
    }

    ultima() {
        if (this.page === this.totalPaginas) return;
        this.page = this.totalPaginas;
        this.buscar();
    }

    // ======================================
    // EXPORTAR EXCEL
    // ======================================
    exportarExcel() {
        const params = new URLSearchParams({
            farmacia: this.filtros.almacen ? "Almacén" : this.filtros.farmacia,
            almacen: this.filtros.almacen ? "true" : "",
            producto: this.filtros.producto || "",
            usuario: this.filtros.usuario || "",
            desde: this.filtros.desde || "",
            hasta: this.filtros.hasta || "",
        });

        window.open(`/api/inventario-fisico/exportar-excel?${params.toString()}`, "_blank");
    }

}

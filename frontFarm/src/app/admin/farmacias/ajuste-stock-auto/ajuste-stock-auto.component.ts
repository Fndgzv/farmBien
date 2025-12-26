import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AjusteStockAutoService } from './ajuste-stock-auto.service';
import { FarmaciaService } from '../../../services/farmacia.service';
import { MatTooltip } from "@angular/material/tooltip";

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

@Component({
    selector: 'app-ajuste-stock-auto',
    standalone: true,
    imports: [CommonModule, FormsModule, MatTooltip],
    templateUrl: './ajuste-stock-auto.component.html',
    styleUrls: ['./ajuste-stock-auto.component.css']
})
export class AjusteStockAutoComponent implements OnInit {

    // filtros
    farmaciaId = '';
    desde = '';
    hasta = '';
    categoria = '';
    nombre = '';  // nombre del producto
    diasSurtir = 7;


    cargando = false;

    tabla: any[] = [];
    seleccionados = new Set<string>();
    seleccionarTodos = false;

    farmacias: any[] = [];
    farmaciaNombre: string = '';

    page = 1;
    pageSize = 20;
    totalPages = 1;

    get tablaPaginada() {
        const start = (this.page - 1) * this.pageSize;
        return this.tabla.slice(start, start + this.pageSize);
    }

    ordenCampo: 'productoNombre' | 'cantidadVendida' | 'productosPorDia' | 'faltanSobran' = 'productoNombre';
    ordenDir: 'asc' | 'desc' = 'asc';

    constructor(private service: AjusteStockAutoService, private farmaciaService: FarmaciaService) { }

    ngOnInit(): void {

        const stored = localStorage.getItem('user_farmacia');
        const farmacia = stored ? JSON.parse(stored) : null;

        if (!farmacia) {
            Swal.fire('Error', 'No se encontró la farmacia en localStorage', 'error');
            return;
        }

        this.farmaciaId = farmacia._id;
        this.farmaciaNombre = farmacia.nombre || '';

        this.farmaciaService.obtenerFarmacias().subscribe({
            next: (data) => (this.farmacias = data),
            error: () => Swal.fire('Error', 'No se pudieron cargar las farmacias', 'error')
        });

        // ✅ Inicializar fechas
        const hoy = new Date();
        const hace30Dias = new Date();
        hace30Dias.setDate(hoy.getDate() - 30);

        this.hasta = this.formatDate(hoy);
        this.desde = this.formatDate(hace30Dias);
    }

    buscar() {
        if (!this.farmaciaId || !this.desde || !this.hasta || !this.diasSurtir) {
            Swal.fire('Faltan datos', 'Todos los campos obligatorios deben llenarse', 'warning');
            return;
        }

        this.cargando = true;
        this.tabla = [];
        this.seleccionados.clear();
        this.seleccionarTodos = false;

        this.service.calcularTabla({
            farmaciaId: this.farmaciaId,
            desde: this.desde,
            hasta: this.hasta,
            diasSurtir: this.diasSurtir,
            categoria: this.categoria || undefined,
            nombre: this.nombre || undefined,
        }).subscribe({
            next: data => {

                this.tabla = data.map(r => ({
                    ...r,

                    // 🔒 asegurar que los inputs editables conserven el valor propuesto
                    stockMinPropuesto: Number(r.stockMinPropuesto ?? 0),
                    stockMaxPropuesto: Number(r.stockMaxPropuesto ?? 0),

                    // (opcional pero recomendado)
                    aplicar: false
                }));
                console.log('Datos de la tabla ===>', this.tabla)
                this.page = 1;
                this.totalPages = Math.ceil(this.tabla.length / this.pageSize);
                this.cargando = false;
            },
            error: () => {
                this.cargando = false;
                Swal.fire('Error', 'No se pudo calcular el stock', 'error');
            }
        });
    }

    toggleTodos() {
        this.seleccionados.clear();

        if (this.seleccionarTodos) {
            this.tabla.forEach(r => this.seleccionados.add(r.productoId));
        }
    }

    togglePaginaActual() {
        const pageRows = this.tablaPaginada;

        const todosSeleccionados = pageRows.every(r =>
            this.seleccionados.has(r.productoId)
        );

        pageRows.forEach(r => {
            if (todosSeleccionados) {
                this.seleccionados.delete(r.productoId);
            } else {
                this.seleccionados.add(r.productoId);
            }
        });
    }

    toggleFaltantes() {
        const faltantes = this.tabla.filter(r => r.faltanSobran > 0);

        const todosSeleccionados = faltantes.every(r =>
            this.seleccionados.has(r.productoId)
        );

        faltantes.forEach(r => {
            if (todosSeleccionados) {
                this.seleccionados.delete(r.productoId);
            } else {
                this.seleccionados.add(r.productoId);
            }
        });
    }

    toggleSobran() {
        const sobran = this.tabla.filter(r => r.faltanSobran < 0);

        const todos = sobran.every(r =>
            this.seleccionados.has(r.productoId)
        );

        sobran.forEach(r => {
            if (todos) {
                this.seleccionados.delete(r.productoId);
            } else {
                this.seleccionados.add(r.productoId);
            }
        });
    }

    toggleFila(id: string, checked: boolean) {
        checked ? this.seleccionados.add(id) : this.seleccionados.delete(id);
        this.seleccionarTodos = this.seleccionados.size === this.tabla.length;
    }

    aplicarCambios() {
        if (this.seleccionados.size === 0) {
            Swal.fire('Nada seleccionado', 'Seleccione al menos un producto', 'info');
            return;
        }

        const productos = this.tabla
            .filter(r => this.seleccionados.has(r.productoId))
            .map(r => ({
                productoId: r.productoId,
                stockMin: Number(r.stockMinPropuesto),
                stockMax: Number(r.stockMaxPropuesto)
            }));

        Swal.fire({
            title: '¿Aplicar cambios?',
            text: `Se actualizarán ${productos.length} productos`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aplicar'
        }).then(res => {
            if (!res.isConfirmed) return;

            this.service.aplicarCambios(this.farmaciaId, productos).subscribe({
                next: () => {
                    Swal.fire('Listo', 'Stocks actualizados correctamente', 'success');
                    this.buscar();
                },
                error: () => {
                    Swal.fire('Error', 'No se pudieron aplicar los cambios', 'error');
                }
            });
        });
    }

    private formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }


    ordenar(campo: any) {
        if (this.ordenCampo === campo) {
            this.ordenDir = this.ordenDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.ordenCampo = campo;
            this.ordenDir = 'asc';
        }

        this.tabla.sort((a, b) => {
            const v1 = a[campo] ?? '';
            const v2 = b[campo] ?? '';

            if (typeof v1 === 'number') {
                return this.ordenDir === 'asc' ? v1 - v2 : v2 - v1;
            }

            return this.ordenDir === 'asc'
                ? String(v1).localeCompare(String(v2))
                : String(v2).localeCompare(String(v1));
        });
        this.page = 1;
    }

    iconoOrden(campo: string) {
        if (this.ordenCampo !== campo) return 'fa-sort';
        return this.ordenDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
    }

    exportarExcel() {
        if (!this.tabla.length) {
            Swal.fire('Sin datos', 'No hay información para exportar', 'info');
            return;
        }

        const data = this.tabla.map(r => ({
            Producto: r.productoNombre,
            CodigoBarras: r.codigoBarras,
            Categoria: r.categoria,
            CantidadVendida: r.cantidadVendida,
            Existencia: r.existencia,
            StockMinActual: r.stockMinActual,
            StockMaxActual: r.stockMaxActual,
            ProductosPorDia: r.productosPorDia,
            StockMinPropuesto: r.stockMinPropuesto,
            StockMaxPropuesto: r.stockMaxPropuesto,
            FaltanSobran: r.faltanSobran
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'AjusteStock');

        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(
            new Blob([buffer], { type: 'application/octet-stream' }),
            `ajuste-stock-${this.farmaciaNombre}.xlsx`
        );
    }

}

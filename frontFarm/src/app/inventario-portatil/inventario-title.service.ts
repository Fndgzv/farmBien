import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class InventarioTitleService {

  private tituloSubject = new BehaviorSubject<string>('Inventario');
  titulo$ = this.tituloSubject.asObservable();

  constructor() {}

  setTitulo(t: string) {
    this.tituloSubject.next(t);
    localStorage.setItem('inventarioTitulo', t); // persistencia opcional
  }

  cargarDesdeStorage() {
    const t = localStorage.getItem('inventarioTitulo');
    if (t) this.tituloSubject.next(t);
  }
}

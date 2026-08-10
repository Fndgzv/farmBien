import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { Subject } from 'rxjs';
import Swal from 'sweetalert2';

import { SurtirFarmaciaComponent } from './surtir-farmacia.component';

describe('SurtirFarmaciaComponent duplicate submission guard', () => {
  it('envia una sola solicitud ante clics repetidos y rehabilita el boton al fallar', fakeAsync(() => {
    spyOn(console, 'error');
    const respuesta = new Subject<unknown>();
    const farmaciaService = {
      obtenerFarmacias: jasmine.createSpy('obtenerFarmacias')
    };
    const surtidoService = {
      surtirFarmacia: jasmine.createSpy('surtirFarmacia').and.returnValue(respuesta)
    };
    const component = new SurtirFarmaciaComponent(
      new FormBuilder(),
      farmaciaService as any,
      surtidoService as any
    );

    component.form.patchValue({ farmaciaId: 'farmacia-1' });
    component.farmacias = [{ _id: 'farmacia-1', nombre: 'Farmacia prueba' }];
    component.rows = [{ producto: 'producto-1', omitir: false } as any];
    component.pendientes = component.rows;

    let llamadasModal = 0;
    spyOn(Swal, 'fire').and.callFake((..._args: any[]) => {
      llamadasModal += 1;
      return Promise.resolve({ isConfirmed: llamadasModal === 1 }) as any;
    });
    spyOn(Swal, 'close');

    component.onSurtir();
    component.onSurtir();
    expect(component.guardandoSurtido).toBeTrue();
    expect(llamadasModal).toBe(1);

    flushMicrotasks();
    expect(surtidoService.surtirFarmacia).toHaveBeenCalledTimes(1);

    component.onSurtir();
    expect(surtidoService.surtirFarmacia).toHaveBeenCalledTimes(1);

    respuesta.error({ error: { mensaje: 'Fallo simulado' } });
    flushMicrotasks();
    expect(component.guardandoSurtido).toBeFalse();
  }));
});

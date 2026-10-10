import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, Subject, throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { VentasComponent } from './ventas.component';
import { VentasService } from '../../services/ventas.service';
import { ProductoService } from '../../services/producto.service';
import { ClienteService } from '../../services/cliente.service';
import { VentaService } from '../../services/venta.service';
import { FarmaciaService } from '../../services/farmacia.service';
import { FichasConsultorioService } from '../../services/fichas-consultorio.service';
import { VentaTicketPrintService } from '../../services/venta-ticket-print.service';

describe('Ventas: búsqueda y alta de clientes', () => {
  let fixture: ComponentFixture<VentasComponent>;
  let component: VentasComponent;
  let servicio: jasmine.SpyObj<ClienteService>;
  const cliente = { _id: 'cliente-1', nombre: 'Ana Pérez', telefono: '5512345678', totalMonedero: 75 };
  const esperarModal = () => new Promise(resolve => setTimeout(resolve, 80));

  beforeEach(async () => {
    servicio = jasmine.createSpyObj('ClienteService', ['buscarClientes', 'buscarClientePorTelefono', 'crearCliente']);
    servicio.buscarClientes.and.returnValue(of({ ok: true, rows: [] }));
    servicio.buscarClientePorTelefono.and.returnValue(throwError(() => ({ status: 404 })));
    servicio.crearCliente.and.returnValue(of(cliente));
    spyOn(VentasComponent.prototype, 'ngOnInit').and.resolveTo();
    spyOn(VentasComponent.prototype, 'ngAfterViewInit');
    spyOn(VentasComponent.prototype, 'ngOnDestroy');
    await TestBed.configureTestingModule({
      imports: [VentasComponent, NoopAnimationsModule],
      providers: [
        { provide: ClienteService, useValue: servicio },
        ...[VentasService, ProductoService, VentaService, FarmaciaService, FichasConsultorioService,
          VentaTicketPrintService].map(provide => ({ provide, useValue: {} }))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(VentasComponent);
    component = fixture.componentInstance;
    spyOn<any>(component, 'focusBarcode');
    component.configurarBusquedaClientes();
    fixture.detectChanges();
  });

  afterEach(async () => {
    Swal.close();
    // Esperar a que termine la animación de cierre para no tapar el siguiente test.
    await new Promise(resolve => setTimeout(resolve, 200));
    fixture.destroy();
  });

  for (const termino of ['Ana', '551234']) {
    it(`busca ${termino} desde el único input de cliente`, fakeAsync(() => {
      servicio.buscarClientes.and.returnValue(of({ ok: true, rows: [cliente] }));
      const input = fixture.nativeElement.querySelector('input[autocomplete="off"]') as HTMLInputElement;
      input.value = termino;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      tick(250);
      fixture.detectChanges();
      expect(servicio.buscarClientes).toHaveBeenCalledOnceWith(termino, 20);
      expect(component.opcionesClientes).toEqual([cliente]);
      expect(fixture.nativeElement.querySelectorAll('.row.align-items-center.mb-0 input').length).toBe(1);
    }));
  }

  it('descarta una respuesta anterior al cambiar la búsqueda', fakeAsync(() => {
    const anterior = new Subject<any>();
    servicio.buscarClientes.and.returnValues(anterior, of({ ok: true, rows: [cliente] }));
    component.clienteNombreCtrl.setValue('Otro');
    tick(200);
    component.clienteNombreCtrl.setValue('Ana');
    anterior.next({ ok: true, rows: [] });
    expect(component.busquedaClienteSinCoincidencias).toBeFalse();
    tick(200);
    expect(component.opcionesClientes).toEqual([cliente]);
  }));

  it('un error de consulta no ofrece registrar un cliente inexistente', fakeAsync(() => {
    servicio.buscarClientes.and.returnValue(throwError(() => ({ status: 500 })));
    component.clienteNombreCtrl.setValue('Ana');
    tick(250);
    expect(component.busquedaClienteSinCoincidencias).toBeFalse();
    expect(component.errorBusquedaCliente).toContain('No se pudo buscar');
  }));

  it('selecciona ID, teléfono y monedero, y los limpia al editar el buscador', () => {
    component.onClienteSelected(cliente);
    expect(component.ventaForm.value.cliente).toBe(cliente._id);
    expect(component.telefonoCliente).toBe(cliente.telefono);
    expect(component.montoMonederoCliente).toBe(75);
    component.clienteNombreCtrl.setValue('Otro');
    component.onClienteInput();
    expect(component.hayCliente).toBeFalse();
    expect(component.ventaForm.value.cliente).toBe('');
    expect(component.montoMonederoCliente).toBe(0);
    expect(component.clienteNombreCtrl.value).toBe('Otro');
  });

  for (const [termino, nombre, telefono] of [
    ['Ana Pérez', 'Ana Pérez', ''], ['55 1234-5678', '', '5512345678']
  ]) {
    it(`precarga el campo correspondiente al alta desde ${termino}`, async () => {
      const modal = component.abrirFormularioNuevoCliente(termino);
      await esperarModal();
      expect((document.getElementById('nuevoNombreCliente') as HTMLInputElement).value).toBe(nombre);
      expect((document.getElementById('nuevoTelefonoCliente') as HTMLInputElement).value).toBe(telefono);
      Swal.clickCancel();
      await modal;
    });
  }

  it('exige nombre y teléfono de diez dígitos antes de guardar', async () => {
    const modal = component.abrirFormularioNuevoCliente('Ana');
    await esperarModal();
    const nombre = document.getElementById('nuevoNombreCliente') as HTMLInputElement;
    const telefono = document.getElementById('nuevoTelefonoCliente') as HTMLInputElement;
    telefono.value = '123';
    Swal.clickConfirm();
    await esperarModal();
    expect(Swal.getValidationMessage()?.textContent).toContain('10 dígitos');
    nombre.value = '  ';
    telefono.value = '5512345678';
    Swal.clickConfirm();
    await esperarModal();
    expect(Swal.getValidationMessage()?.textContent).toContain('nombre es obligatorio');
    expect(servicio.crearCliente).not.toHaveBeenCalled();
    Swal.clickCancel();
    await modal;
  });

  it('mantiene el formulario abierto si el teléfono ya existe', async () => {
    servicio.buscarClientePorTelefono.and.returnValue(of(cliente));
    const modal = component.abrirFormularioNuevoCliente('Otro nombre');
    await esperarModal();
    (document.getElementById('nuevoTelefonoCliente') as HTMLInputElement).value = cliente.telefono;
    Swal.clickConfirm();
    await esperarModal();
    expect(Swal.getValidationMessage()?.textContent).toContain('ya está registrado');
    expect(servicio.crearCliente).not.toHaveBeenCalled();
    expect((document.getElementById('nuevoNombreCliente') as HTMLInputElement).value).toBe('Otro nombre');
    Swal.clickCancel();
    await modal;
  });

  it('registra y asocia el cliente nuevo cuando el teléfono no existe', async () => {
    const modal = component.abrirFormularioNuevoCliente('Ana Pérez');
    await esperarModal();
    (document.getElementById('nuevoTelefonoCliente') as HTMLInputElement).value = '55 1234-5678';
    Swal.clickConfirm();
    await esperarModal();
    expect(servicio.crearCliente).toHaveBeenCalledOnceWith({ nombre: 'Ana Pérez', telefono: '5512345678' });
    expect(component.cliente).toBe(cliente._id);
    expect(component.telefonoCliente).toBe(cliente.telefono);
    expect(component.clienteNombreCtrl.value).toEqual(cliente);
    Swal.close();
    await modal;
  });
});

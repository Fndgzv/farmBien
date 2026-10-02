import { fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import Swal from 'sweetalert2';
import { MedicoConsultorioComponent } from './medico-consultorio.component';

describe('MedicoConsultorioComponent: categorías de medicamentos', () => {
  const categoriasRenombradas = [
    ['Antibiótico', 'M - Antibiótico'],
    ['IV', 'M - IV'],
    ['VI', 'M - VI'],
    ['VI pediátrico', 'M - VI pediátrico'],
    ['VI / Pastillas refrescantes', 'M - VI / Pastillas refrescantes'],
    ['Suplementos', 'M - Suplementos'],
    ['Suplementos alimenticios', 'M - Suplementos alimenticios']
  ];
  const storageKey = 'medico_consultorio_receta_activa_por_ficha_v1';
  const signosKey = 'medico_consultorio_signos_paso_por_ficha_v1';
  const ficha = {
    _id: 'ficha-categorias', pacienteId: 'paciente-categorias', pacienteNombre: 'Paciente de prueba',
    estado: 'EN_ATENCION', servicios: []
  };
  let component: MedicoConsultorioComponent;
  let productos: any;
  let recetas: any;
  let fichas: any;
  let storageAnterior: (string | null)[];

  const producto = (categoria: string, id = categoria) => ({
    _id: id, nombre: `Medicamento ${id}`, codigoBarras: `CB-${id}`, ingreActivo: 'Ingrediente de prueba',
    categoria, categoriaNorm: categoria.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  });

  beforeEach(() => {
    storageAnterior = [storageKey, signosKey].map(key => localStorage.getItem(key));
    localStorage.removeItem(storageKey);
    localStorage.removeItem(signosKey);
    productos = jasmine.createSpyObj('ProductoService', ['buscarMedicamentosReceta']);
    recetas = jasmine.createSpyObj('RecetasService', ['crear', 'obtenerPorId']);
    fichas = jasmine.createSpyObj('FichasConsultorioService', ['reanudarFicha', 'finalizarConsulta']);
    component = new MedicoConsultorioComponent(fichas, {} as any, {} as any, recetas, productos, {} as any);
    component.fichaActual = { ...ficha };
    spyOn(component, 'cargarExpedienteSiHayPaciente').and.resolveTo();
    spyOn(component, 'cargarCola').and.resolveTo();
    spyOn(Swal, 'fire').and.resolveTo({ isConfirmed: true } as any);
  });

  afterEach(() => {
    component.ngOnDestroy();
    [storageKey, signosKey].forEach((key, index) => {
      const valor = storageAnterior[index];
      if (valor == null) localStorage.removeItem(key);
      else localStorage.setItem(key, valor);
    });
  });

  it('ofrece las categorías renombradas y respeta el espacio del prefijo M - VI', fakeAsync(() => {
    const permitidos = categoriasRenombradas.map(([, actual]) => actual);
    const excluidos = [
      ...categoriasRenombradas.map(([anterior]) => anterior),
      'M - IV pediátrico', 'M - Antibiótico especial', 'M - VII', 'M - VIExtra',
      'M - VI/Pastillas', 'Otro M - VI', 'Otro M - Suplementos', 'Servicio Médico', 'Recargas', 'Abarrotes', ''
    ];
    productos.buscarMedicamentosReceta.and.returnValue(of({ productos: [...permitidos, ...excluidos].map(c => producto(c)) }));
    component.agregarMedicamento();
    component.receta.medicamentos[0].q = 'Medicamento';

    component.buscarMedicamentos(0);
    tick(250);

    expect(productos.buscarMedicamentosReceta).toHaveBeenCalledOnceWith('Medicamento', 100);
    expect(component.receta.medicamentos[0].resultados?.map(p => p.categoria)).toEqual(permitidos);
    expect(component.receta.medicamentos[0].sinCoincidencias).toBeFalse();
  }));

  it('conserva la normalización de mayúsculas, acentos y espacios exteriores en el selector', fakeAsync(() => {
    const permitidos = ['  M - VI  ', ' M - VI PEDIÁTRICO ', ' m - Suplementos '].map(c => producto(c));
    productos.buscarMedicamentosReceta.and.returnValue(of({ productos: permitidos }));
    component.agregarMedicamento();
    component.receta.medicamentos[0].q = 'Medicamento';
    component.buscarMedicamentos(0);
    tick(250);
    expect(component.receta.medicamentos[0].resultados).toEqual(permitidos);
  }));

  for (const [, categoria] of categoriasRenombradas) {
    it(`${categoria}: busca, selecciona, guarda, reanuda LISTA_PARA_COBRO, edita y finaliza la misma receta`, fakeAsync(() => {
      const p = producto(categoria, 'producto-categorias');
      productos.buscarMedicamentosReceta.and.returnValue(of({ productos: [p] }));
      let guardada: any;
      recetas.crear.and.callFake((payload: any) => {
        guardada = { ...payload, _id: 'receta-categorias' };
        return of({ receta: guardada });
      });
      recetas.obtenerPorId.and.callFake(() => of({ receta: {
        ...guardada,
        medicamentos: guardada.medicamentos.map((m: any) => ({ ...m, productoId: m.productoId ? p : undefined }))
      } }));
      fichas.reanudarFicha.and.returnValue(of({ ficha: { ...ficha } }));
      fichas.finalizarConsulta.and.returnValue(of({ estadoFinal: 'LISTA_PARA_COBRO' }));
      spyOn<any>(component, 'imprimirRecetaAntesDeFinalizar').and.resolveTo(true);

      component.agregarMedicamento();
      component.receta.medicamentos[0].q = 'Medicamento';
      component.buscarMedicamentos(0);
      tick(250);
      component.seleccionarMedicamento(0, component.receta.medicamentos[0].resultados![0]);
      Object.assign(component.receta.medicamentos[0], {
        dosis: '500 mg', frecuencia: 'Cada 8 horas', duracion: '7 días', cantidad: 2, indicaciones: 'Con alimentos'
      });
      component.agregarMedicamento();
      component.usarOtro(1);
      component.receta.medicamentos[1].nombreLibre = 'Medicamento externo';
      component.receta.diagnosticosTexto = 'Diagnóstico de prueba';

      component.generarReceta();
      tick();
      expect(recetas.crear).toHaveBeenCalledTimes(1);
      const antes = guardada.medicamentos;
      expect(antes[0]).toEqual(jasmine.objectContaining({
        productoId: p._id, dosis: '500 mg', cantidad: 2, via: 'ORAL', indicaciones: 'Con alimentos'
      }));
      expect(antes[1].nombreLibre).toBe('Medicamento externo');

      component.reanudar({ ...ficha, estado: 'LISTA_PARA_COBRO' });
      tick();
      expect(fichas.reanudarFicha).toHaveBeenCalledOnceWith(ficha._id);
      expect(recetas.obtenerPorId).toHaveBeenCalledOnceWith('receta-categorias');
      expect(component.fichaActual.estado).toBe('EN_ATENCION');
      expect(component.receta.medicamentos.length).toBe(2);
      expect(component.receta.medicamentos[0]).toEqual(jasmine.objectContaining({
        productoId: p._id, nombreLibre: p.nombre, codigoBarras: p.codigoBarras,
        ingreActivo: p.ingreActivo, dosis: '500 mg', cantidad: 2, modo: 'CATALOGO'
      }));
      expect((component as any).buildPayloadReceta().medicamentos).toEqual(antes);

      component.receta.medicamentos[0].dosis = 'Dosis editada';
      component.servicios = [{ productoId: 'servicio-consulta', cantidad: 1, categoria: 'Servicio Médico' }];
      component.guardarYEnviarACaja();
      tick();
      expect(fichas.finalizarConsulta).toHaveBeenCalledTimes(1);
      const [id, final] = fichas.finalizarConsulta.calls.mostRecent().args;
      expect(id).toBe(ficha._id);
      expect(final.servicios).toEqual([{ productoId: 'servicio-consulta', cantidad: 1, notas: '' }]);
      expect(final.receta.recetaId).toBe('receta-categorias');
      expect(final.receta.medicamentos).toEqual([{ ...antes[0], dosis: 'Dosis editada' }, antes[1]]);
      expect(component.guardando).toBeFalse();
    }));
  }

  for (const [anterior, actual] of categoriasRenombradas) {
    it(`precarga un histórico ${anterior} con el producto renombrado sin cambiar la copia histórica`, () => {
      const historica = { medicamentos: [{
        productoId: producto(actual, 'producto-historico'), categoria: anterior, via: 'ORAL', cantidad: 3,
        dosis: 'Dosis histórica', frecuencia: 'Frecuencia histórica', duracion: 'Duración histórica'
      }] };
      const original = JSON.stringify(historica);
      (component as any).aplicarRecetaGuardadaEnFormulario(historica);
      const payload = (component as any).buildPayloadReceta();
      expect(payload.medicamentos[0]).toEqual(jasmine.objectContaining({
        productoId: 'producto-historico', cantidad: 3, dosis: 'Dosis histórica'
      }));
      const impresion = (component as any).construirMedicamentosImpresion(historica.medicamentos);
      expect(impresion[0].categoria).toBe(anterior);
      expect(JSON.stringify(historica)).toBe(original);
    });
  }

  it('precarga recetas que solo tienen el ID y el nombre guardado, sin exigir una categoría', () => {
    (component as any).aplicarRecetaGuardadaEnFormulario({ medicamentos: [{
      productoId: 'producto-historico', nombreLibre: 'Nombre guardado', via: 'ORAL', cantidad: 1
    }] });
    expect(component.receta.medicamentos[0]).toEqual(jasmine.objectContaining({
      productoId: 'producto-historico', nombreLibre: 'Nombre guardado', modo: 'CATALOGO', cantidad: 1
    }));
  });

  it('conserva la detección de antibióticos para impresión con categorías actuales e históricas', () => {
    for (const categoria of ['Antibiótico', 'M - Antibiótico', '  M - ANTIBIÓTICO  ']) {
      expect((component as any).recetaTieneAntibiotico([{ categoria }])).withContext(categoria).toBeTrue();
    }
    for (const categoria of [...categoriasRenombradas.slice(1).flat(), undefined]) {
      expect((component as any).recetaTieneAntibiotico([{ categoria }])).withContext(String(categoria)).toBeFalse();
    }
  });

  it('conserva como conceptos no médicos las categorías actuales e históricas de la ficha', () => {
    for (const categoria of categoriasRenombradas.flat()) {
      expect(component.esServicioBloqueadoNoMedico({ productoId: 'producto', cantidad: 2, categoria })).toBeTrue();
    }
    expect(component.esServicioBloqueadoNoMedico({ productoId: 'consulta', cantidad: 1, categoria: 'Servicio Médico' })).toBeFalse();
  });
});

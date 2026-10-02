const test = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const Producto = require('../models/Producto');
const Receta = require('../models/Receta');
const Paciente = require('../models/Paciente');
const Ficha = require('../models/FichaConsultorio');
const productosController = require('../controllers/productoController');
const recetasController = require('../controllers/recetas.controller');
const fichasController = require('../controllers/fichasConsultorio.controller');

const ids = {
  farmacia: '64b000000000000000000001', medico: '64b000000000000000000002',
  paciente: '64b000000000000000000003', ficha: '64b000000000000000000004',
  receta: '64b000000000000000000005', antibiotico: '64b000000000000000000006',
  iv: '64b000000000000000000007', vi: '64b000000000000000000008',
  suplemento: '64b000000000000000000009', viPediatrico: '64b00000000000000000000a',
  viPastillas: '64b00000000000000000000b', suplementoAlimenticio: '64b00000000000000000000c'
};
const catalogo = [
  { _id: ids.antibiotico, nombre: 'Prueba A', categoria: 'M - Antibiótico', categoriaNorm: 'm - antibiotico', codigoBarras: '75001', ingreActivo: 'Ingrediente A' },
  { _id: ids.iv, nombre: 'Prueba B', categoria: 'M - IV', categoriaNorm: 'm - iv', codigoBarras: '75002', ingreActivo: 'Ingrediente B' },
  { _id: ids.vi, nombre: 'Prueba C', categoria: 'M - VI', categoriaNorm: 'm - vi', codigoBarras: '75003', ingreActivo: 'Ingrediente C' },
  { _id: ids.suplemento, nombre: 'Prueba D', categoria: 'M - Suplementos', categoriaNorm: 'm - suplementos', codigoBarras: '75004', ingreActivo: 'Ingrediente D' },
  { _id: ids.viPediatrico, nombre: 'Prueba E', categoria: 'M - VI pediátrico', categoriaNorm: 'm - vi pediatrico', codigoBarras: '75005', ingreActivo: 'Ingrediente E' },
  { _id: ids.viPastillas, nombre: 'Prueba F', categoria: 'M - VI / Pastillas refrescantes', categoriaNorm: 'm - vi / pastillas refrescantes', codigoBarras: '75006', ingreActivo: 'Ingrediente F' },
  { _id: ids.suplementoAlimenticio, nombre: 'Prueba G', categoria: 'M - Suplementos alimenticios', categoriaNorm: 'm - suplementos alimenticios', codigoBarras: '75007', ingreActivo: 'Ingrediente G' }
];

function respuesta() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function peticion(body = {}, id = ids.ficha) {
  return { body, params: { id }, headers: {}, usuario: { _id: ids.medico, rol: 'medico', farmacia: ids.farmacia } };
}

// Las consultas y escrituras se simulan en memoria; los controladores y esquemas son reales.
function consulta(value) {
  const q = {
    select() { return q; }, sort() { return q; }, populate() { return q; },
    lean: async () => value?.toObject ? value.toObject() : value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
  return q;
}

function instalarCatalogo(t) {
  return t.mock.method(Producto, 'find', filtro => consulta(catalogo.filter(sift(filtro))));
}

function instalarRecetas(t) {
  let guardada = null;
  const find = t.mock.method(Receta, 'findOne', filtro => consulta(
    guardada && sift(filtro)(guardada) ? guardada : null
  ));
  const create = t.mock.method(Receta, 'create', async payload => {
    const doc = new Receta({ ...payload, _id: ids.receta });
    await doc.validate();
    guardada = doc.toObject();
    return guardada;
  });
  const update = t.mock.method(Receta, 'findByIdAndUpdate', (id, cambios) => {
    assert.equal(String(id), String(guardada._id));
    const doc = new Receta({ ...guardada, ...cambios.$set });
    assert.equal(doc.validateSync(), undefined);
    guardada = doc.toObject();
    return consulta(guardada);
  });
  t.mock.method(Paciente, 'findById', () => consulta({ _id: ids.paciente }));
  t.mock.method(Paciente, 'findByIdAndUpdate', () => consulta({ _id: ids.paciente }));
  t.mock.method(Paciente, 'updateOne', async () => ({ matchedCount: 1 }));
  return { get guardada() { return guardada; }, find, create, update };
}

function recetaPayload() {
  return {
    pacienteId: ids.paciente, fichaConsultorioId: ids.ficha, diagnosticos: ['Diagnóstico de prueba'],
    medicamentos: catalogo.map(p => ({
      productoId: p._id, via: 'ORAL', dosis: 'Dosis de prueba', frecuencia: 'Cada 8 horas',
      duracion: '7 días', cantidad: 2, indicaciones: 'Indicaciones de prueba'
    }))
  };
}

test('actualizar las categorías del producto mantiene categoriaNorm con el nuevo prefijo', async t => {
  const update = t.mock.method(Producto.collection, 'updateOne', async () => ({ acknowledged: true, matchedCount: 1 }));
  for (const p of catalogo) {
    await Producto.updateOne({ _id: p._id }, { $set: { categoria: p.categoria } });
    const cambios = update.mock.calls.at(-1).arguments[1];
    assert.equal(cambios.$set.categoria, p.categoria);
    assert.equal(cambios.$set.categoriaNorm, p.categoriaNorm);
  }
});

for (const [q, esperados] of [
  ['Prueba', catalogo.map(p => p._id)],
  ['75001', [ids.antibiotico]],
  ['Ingrediente B', [ids.iv]],
  ['Prueba C', [ids.vi]],
  ['75004', [ids.suplemento]],
  ['Ingrediente E', [ids.viPediatrico]],
  ['75006', [ids.viPastillas]],
  ['Ingrediente G', [ids.suplementoAlimenticio]]
]) {
  test(`buscador de receta devuelve las categorías nuevas por "${q}"`, async t => {
    instalarCatalogo(t);
    const res = respuesta();
    await productosController.buscarMedicamentosReceta({ query: { q } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.productos.map(p => p._id), esperados);
    for (const p of res.body.productos) {
      assert.equal(p.categoriaNorm, catalogo.find(item => item._id === p._id).categoriaNorm);
    }
  });
}

test('buscador conserva el límite y la prioridad del nombre sobre el ingrediente', async t => {
  t.mock.method(Producto, 'find', () => consulta([
    { ...catalogo[0], nombre: 'Zeta', ingreActivo: 'Prueba' }, catalogo[1]
  ]));
  const res = respuesta();
  await productosController.buscarMedicamentosReceta({ query: { q: 'Prueba', limit: '1' } }, res);
  assert.deepEqual(res.body.productos.map(p => p._id), [ids.iv]);
});

test('guardar y editar receta conserva referencias, cantidades y ficha sin persistir la categoría', async t => {
  const storage = instalarRecetas(t);
  const payload = recetaPayload();
  const res = respuesta();
  await recetasController.crear(peticion(payload), res);
  assert.equal(res.statusCode, 201);
  assert.equal(storage.create.mock.callCount(), 1);
  assert.deepEqual(storage.guardada.medicamentos.map(m => String(m.productoId)), catalogo.map(p => p._id));
  assert.ok(storage.guardada.medicamentos.every(m => !Object.hasOwn(m, 'categoria') && m.cantidad === 2));

  payload.recetaId = ids.receta;
  payload.medicamentos.forEach((m, index) => { m.dosis = `Dosis editada ${index}`; });
  const editada = respuesta();
  await recetasController.crear(peticion(payload), editada);
  assert.equal(editada.statusCode, 200);
  assert.equal(editada.body.actualizado, true);
  assert.equal(storage.create.mock.callCount(), 1);
  assert.equal(storage.update.mock.callCount(), 1);
  assert.equal(String(storage.guardada.fichaConsultorioId), ids.ficha);
  assert.deepEqual(storage.guardada.medicamentos.map(m => m.dosis), payload.medicamentos.map(m => m.dosis));
  assert.deepEqual(storage.guardada.medicamentos.map(m => m.cantidad), catalogo.map(() => 2));
});

test('leer receta recupera la categoría del producto actual y no escribe documentos históricos', async t => {
  const storage = instalarRecetas(t);
  const populates = [];
  storage.find.mock.mockImplementation(filtro => {
    assert.equal(filtro.farmaciaId, ids.farmacia);
    const q = consulta({
      _id: ids.receta, pacienteId: ids.paciente,
      medicamentos: catalogo.map(p => ({ productoId: p, via: 'ORAL', cantidad: 2 }))
    });
    q.populate = config => { populates.push(config); return q; };
    return q;
  });
  const res = respuesta();
  await recetasController.obtenerPorId(peticion({}, ids.receta), res);
  assert.equal(res.statusCode, 200);
  assert.ok(populates.some(p => p.path === 'medicamentos.productoId' && p.select.includes('categoria')));
  assert.deepEqual(res.body.receta.medicamentos.map(m => m.productoId.categoria), catalogo.map(p => p.categoria));
  assert.equal(storage.create.mock.callCount(), 0);
  assert.equal(storage.update.mock.callCount(), 0);
});

test('LISTA_PARA_COBRO se reanuda y vuelve a finalizar sin perder receta ni conceptos históricos', async t => {
  instalarCatalogo(t);
  const storage = instalarRecetas(t);
  const receta = recetaPayload();
  const guardado = respuesta();
  await recetasController.crear(peticion(receta), guardado);
  receta.recetaId = ids.receta;
  const ficha = new Ficha({
    _id: ids.ficha, farmaciaId: ids.farmacia, medicoId: ids.medico, creadaPor: ids.medico,
    pacienteId: ids.paciente, pacienteNombre: 'Paciente de prueba', estado: 'LISTA_PARA_COBRO',
    serviciosTotal: 575,
    servicios: [
      { productoId: ids.antibiotico, nombre: 'Prueba A', categoria: 'Antibiótico', precio: 50, cantidad: 2 },
      { productoId: ids.iv, nombre: 'Prueba B', categoria: 'IV', precio: 75, cantidad: 1 },
      { productoId: ids.vi, nombre: 'Prueba C', categoria: 'VI', precio: 50, cantidad: 1 },
      { productoId: ids.suplemento, nombre: 'Prueba D', categoria: 'Suplementos', precio: 50, cantidad: 2 },
      { productoId: ids.viPediatrico, nombre: 'Prueba E', categoria: 'VI pediátrico', precio: 25, cantidad: 2 },
      { productoId: ids.viPastillas, nombre: 'Prueba F', categoria: 'VI / Pastillas refrescantes', precio: 50, cantidad: 1 },
      { productoId: ids.suplementoAlimenticio, nombre: 'Prueba G', categoria: 'Suplementos alimenticios', precio: 75, cantidad: 2 }
    ]
  });
  const originales = ficha.toObject().servicios;
  t.mock.method(Ficha, 'findOne', filtro => consulta(sift(filtro)(ficha.toObject()) ? ficha : null));
  t.mock.method(Ficha, 'exists', async () => null);
  t.mock.method(Ficha, 'findOneAndUpdate', (filtro, update) => {
    assert.equal(filtro.estado, 'LISTA_PARA_COBRO');
    assert.ok(sift(filtro)(ficha.toObject()));
    ficha.set(update.$set);
    for (const key of Object.keys(update.$unset || {})) ficha.set(key, undefined);
    return consulta(ficha);
  });
  const save = t.mock.method(ficha, 'save', async () => { await ficha.validate(); return ficha; });

  const reanudada = respuesta();
  await fichasController.reanudarFicha(peticion(), reanudada);
  assert.equal(reanudada.statusCode, 200);
  assert.equal(ficha.estado, 'EN_ATENCION');
  assert.deepEqual(ficha.toObject().servicios, originales);
  assert.equal(storage.update.mock.callCount(), 0);

  const abierta = respuesta();
  await fichasController.reanudarFicha(peticion(), abierta);
  assert.equal(abierta.statusCode, 200);
  assert.equal(abierta.body.ficha.estado, 'EN_ATENCION');

  receta.medicamentos.forEach((m, index) => { m.dosis = `Dosis editada ${index}`; });
  const finalizada = respuesta();
  await fichasController.finalizarConsulta(peticion({ receta }), finalizada);
  assert.equal(finalizada.statusCode, 200);
  assert.equal(finalizada.body.estadoFinal, 'LISTA_PARA_COBRO');
  assert.equal(String(finalizada.body.recetaId), ids.receta);
  assert.equal(storage.create.mock.callCount(), 1);
  assert.equal(storage.update.mock.callCount(), 1);
  assert.equal(save.mock.callCount(), 1);
  assert.deepEqual(storage.guardada.medicamentos.map(m => String(m.productoId)), catalogo.map(p => p._id));
  assert.deepEqual(storage.guardada.medicamentos.map(m => m.cantidad), catalogo.map(() => 2));
  assert.deepEqual(storage.guardada.medicamentos.map(m => m.dosis), receta.medicamentos.map(m => m.dosis));
  assert.deepEqual(ficha.toObject().servicios, originales);
  assert.equal(ficha.serviciosTotal, 575);
  assert.equal(ficha.ventaId, undefined);
});

test('paciente de paso conserva categoría actual para imprimir y termina ATENDIDA sin servicios', async t => {
  instalarCatalogo(t);
  const storage = instalarRecetas(t);
  const ficha = new Ficha({
    _id: ids.ficha, farmaciaId: ids.farmacia, creadaPor: ids.medico,
    pacienteNombre: 'Paciente de paso', estado: 'EN_ATENCION'
  });
  t.mock.method(Ficha, 'findOne', () => consulta(ficha));
  t.mock.method(ficha, 'save', async () => { await ficha.validate(); return ficha; });
  const res = respuesta();
  await fichasController.finalizarConsulta(peticion({ receta: recetaPayload() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.estadoFinal, 'ATENDIDA');
  assert.deepEqual(res.body.recetaPaso.medicamentos.map(m => m.categoria), catalogo.map(p => p.categoria));
  assert.equal(storage.create.mock.callCount(), 0);
  assert.equal(storage.update.mock.callCount(), 0);
});

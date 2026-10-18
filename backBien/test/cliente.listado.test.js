const test = require('node:test');
const assert = require('node:assert/strict');
const Cliente = require('../models/Cliente');
const Venta = require('../models/Venta');
const { listarClientes } = require('../controllers/clienteController');

function prepararListado(t, rows = []) {
  const consulta = {};
  t.mock.method(Cliente, 'aggregate', pipeline => {
    consulta.pipeline = pipeline;
    return {
      collation(opciones) {
        consulta.collation = opciones;
        return this;
      },
      allowDiskUse: async () => rows
    };
  });
  t.mock.method(Cliente, 'countDocuments', async filtro => {
    consulta.filtroConteo = filtro;
    return 42;
  });
  return consulta;
}

async function listar(query) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await listarClientes({ query }, res);
  return res;
}

test('total monedero suma el campo de las ventas del cliente en días locales completos', async t => {
  const consulta = prepararListado(t);
  const res = await listar({ fechaIni: '2026-10-01', fechaFin: '2026-10-17', tz: '360' });
  assert.equal(res.statusCode, 200);
  const lookup = consulta.pipeline.find(stage => stage.$lookup).$lookup;
  assert.equal(lookup.from, Venta.collection.name);
  assert.equal(lookup.let.clienteId, '$_id');
  const match = lookup.pipeline.find(stage => stage.$match).$match;
  assert.deepEqual(match.$expr.$eq, ['$cliente', '$$clienteId']);
  assert.equal(match.fecha.$gte.toISOString(), '2026-10-01T06:00:00.000Z');
  assert.equal(match.fecha.$lt.toISOString(), '2026-10-18T06:00:00.000Z');
  assert.deepEqual(lookup.pipeline.find(stage => stage.$group).$group.total.$sum,
    { $ifNull: ['$totalMonederoCliente', 0] });
  const total = consulta.pipeline.find(stage => stage.$addFields).$addFields.totalMonederoCliente;
  assert.equal(total.$ifNull[1], 0, 'clientes sin compras deben mostrar cero');
});

for (const [sortDir, dir] of [['asc', 1], ['desc', -1]]) {
  test(`ordena el total monedero ${sortDir} de todos los clientes antes de paginar`, async t => {
    const rows = [{ _id: 'cliente', nombre: 'Ana', totalMonedero: 15, totalMonederoCliente: 120 }];
    const consulta = prepararListado(t, rows);
    const res = await listar({ sortBy: 'totalMonederoCliente', sortDir, page: '2', limit: '10' });
    const pipeline = consulta.pipeline;
    const totalIndex = pipeline.findIndex(stage => stage.$addFields?.totalMonederoCliente);
    const sortIndex = pipeline.findIndex(stage => stage.$sort);
    const skipIndex = pipeline.findIndex(stage => stage.$skip !== undefined);
    assert.ok(totalIndex < sortIndex && sortIndex < skipIndex);
    assert.equal(pipeline[sortIndex].$sort.totalMonederoCliente, dir);
    assert.equal(pipeline[sortIndex].$sort.nombre, 1);
    assert.equal(pipeline[skipIndex].$skip, 10);
    assert.equal(pipeline.find(stage => stage.$limit).$limit, 10);
    assert.deepEqual(res.body.rows, rows, 'saldo y total del período deben mantenerse separados');
    assert.deepEqual(res.body.paginacion, { total: 42, page: 2, limit: 10, sortBy: 'totalMonederoCliente', sortDir });
  });
}

for (const sortBy of ['nombre', 'totalMonedero']) {
  test(`conserva filtros, conteo y orden por ${sortBy} al agregar el total del período`, async t => {
    const consulta = prepararListado(t);
    const res = await listar({ q: 'Ana', telefono: '(55) 1234', sortBy, sortDir: 'asc', page: '3', limit: '20',
      fechaIni: '2026-09-30', fechaFin: '2026-09-30', tz: '0' });
    const pipeline = consulta.pipeline;
    const filtro = pipeline.find(stage => stage.$match).$match;
    assert.deepEqual(consulta.filtroConteo, filtro);
    assert.equal(filtro.nombre.$regex, 'Ana');
    assert.ok(new RegExp(filtro.telefono.$regex).test('55 1234 5678'));
    assert.equal(filtro.fecha, undefined, 'las fechas no deben excluir clientes sin compras');
    assert.equal(pipeline.find(stage => stage.$sort).$sort[sortBy], 1);
    assert.ok(pipeline.findIndex(stage => stage.$limit) < pipeline.findIndex(stage => stage.$lookup));
    assert.deepEqual(consulta.collation, { locale: 'es', strength: 1 });
    const rango = pipeline.find(stage => stage.$lookup).$lookup.pipeline[0].$match.fecha;
    assert.equal(rango.$gte.toISOString(), '2026-09-30T00:00:00.000Z');
    assert.equal(rango.$lt.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(res.body.paginacion.total, 42);
  });
}

test('conserva límites y orden predeterminado ante parámetros no permitidos', async t => {
  const consulta = prepararListado(t);
  const res = await listar({ sortBy: 'password', sortDir: 'otro', page: '-1', limit: '500' });
  assert.equal(consulta.pipeline.find(stage => stage.$sort).$sort.nombre, 1);
  const campos = consulta.pipeline.find(stage => stage.$project).$project;
  assert.equal(campos.password, undefined);
  assert.equal(campos.monedero, undefined);
  assert.deepEqual(res.body.paginacion, { total: 42, page: 1, limit: 200, sortBy: 'nombre', sortDir: 'asc' });
});

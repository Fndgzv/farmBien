const test = require('node:test');
const assert = require('node:assert/strict');
const Cliente = require('../models/Cliente');
const bcrypt = require('bcryptjs');
const { buscarClientesPorNombre, crearClienteDesdeVenta } = require('../controllers/clienteController');

function respuesta() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('busca por fragmentos de teléfono desde el mismo buscador de clientes', async t => {
  t.mock.method(Cliente, 'find', filtro => {
    const regex = new RegExp(filtro.telefono.$regex);
    assert.ok(regex.test('5512345678'));
    assert.ok(regex.test('55 1234 5678'));
    assert.ok(!regex.test('5598765432'));
    return { sort: () => ({ limit: () => ({ lean: async () => [{ nombre: 'Ana', telefono: '5512345678' }] }) }) };
  });
  const res = respuesta();
  await buscarClientesPorNombre({ query: { q: '(55) 1234' } }, res);
  assert.equal(res.body.rows[0].telefono, '5512345678');
});

test('conserva las coincidencias de nombre con acentos y escapa caracteres especiales', async t => {
  t.mock.method(Cliente, 'find', filtro => {
    assert.ok(filtro.nombre.test('MARÍA (LÓPEZ)'));
    assert.ok(!filtro.nombre.test('Maria Lopez'));
    return { sort: () => ({ limit: () => ({ lean: async () => [] }) }) };
  });
  const res = respuesta();
  await buscarClientesPorNombre({ query: { q: 'Maria (Lopez)' } }, res);
  assert.equal(res.statusCode, 200);
});

test('rechaza el alta sin nombre o sin teléfono válido antes de consultar la base', async t => {
  const find = t.mock.method(Cliente, 'findOne', () => { throw new Error('No debe consultar'); });
  for (const body of [
    { nombre: '  ', telefono: '5512345678' },
    { nombre: 'Ana', telefono: '' },
    { nombre: 'Ana', telefono: '123' }
  ]) {
    const res = respuesta();
    await crearClienteDesdeVenta({ body }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(find.mock.callCount(), 0);
});

test('un teléfono existente impide crear otro cliente aunque el nombre sea distinto', async t => {
  t.mock.method(Cliente, 'findOne', async filtro => {
    assert.equal(filtro.telefono, '5512345678');
    return { nombre: 'Cliente existente' };
  });
  const res = respuesta();
  await crearClienteDesdeVenta({ body: { nombre: 'Otro nombre', telefono: '(55) 1234-5678' } }, res);
  assert.equal(res.statusCode, 409);
});

test('permite nombres repetidos con distinto teléfono y normaliza los campos', async t => {
  t.mock.method(Cliente, 'findOne', async () => null);
  t.mock.method(bcrypt, 'hash', async telefono => `hash:${telefono}`);
  t.mock.method(Cliente.prototype, 'save', async function () { return this; });
  const res = respuesta();
  await crearClienteDesdeVenta({ body: { nombre: ' Ana ', telefono: '55 1234-5678' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.nombre, 'Ana');
  assert.equal(res.body.telefono, '5512345678');
});

test('el índice único protege el teléfono si dos altas se intentan al mismo tiempo', async t => {
  t.mock.method(Cliente, 'findOne', async () => null);
  t.mock.method(bcrypt, 'hash', async () => 'hash');
  t.mock.method(Cliente.prototype, 'save', async () => { throw { code: 11000 }; });
  const res = respuesta();
  await crearClienteDesdeVenta({ body: { nombre: 'Ana', telefono: '5512345678' } }, res);
  assert.equal(res.statusCode, 409);
});

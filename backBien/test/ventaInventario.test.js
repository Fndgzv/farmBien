const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Venta = require('../models/Venta');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const { crearVenta } = require('../controllers/ventaController');

const FARMACIA_ID = '64b000000000000000000001';
const PRODUCTO_ID = '64b000000000000000000002';
const USUARIO_ID = '64b000000000000000000003';
const INVENTARIO_ID = '64b000000000000000000004';

function crearRespuesta() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function crearRequest() {
  return {
    usuario: { id: USUARIO_ID, _id: USUARIO_ID, rol: 'admin' },
    body: {
      folio: 'PRUEBA-1',
      farmacia: FARMACIA_ID,
      productos: [{ producto: PRODUCTO_ID, cantidad: 1, precio: 10 }],
      efectivo: 10,
    },
  };
}

function instalarInventario(t, producto) {
  const inventario = {
    _id: INVENTARIO_ID,
    producto: {
      _id: PRODUCTO_ID,
      nombre: 'Producto de prueba',
      categoria: 'Medicamento',
      costo: 5,
      iva: false,
      ...producto,
    },
    existencia: 0,
    precioVenta: 10,
  };

  t.mock.method(InventarioFarmacia, 'find', () => ({
    populate() {
      return this;
    },
    async exec() {
      return [inventario];
    },
  }));
}

test('una venta con inventario=false no valida ni descuenta existencia', async (t) => {
  instalarInventario(t, { inventario: false });

  let bulkWrites = 0;
  let sesionesCerradas = 0;
  const session = {
    async withTransaction(callback) {
      await callback();
    },
    endSession() {
      sesionesCerradas += 1;
    },
  };

  t.mock.method(mongoose, 'startSession', async () => session);
  t.mock.method(InventarioFarmacia, 'bulkWrite', async () => {
    bulkWrites += 1;
    return { modifiedCount: 1 };
  });
  t.mock.method(Venta, 'create', async ([payload]) => [{ _id: 'venta-prueba', ...payload }]);

  const res = crearRespuesta();
  await crearVenta(crearRequest(), res);

  assert.equal(res.statusCode, 201);
  assert.equal(bulkWrites, 0);
  assert.equal(sesionesCerradas, 1);
  assert.equal(res.body?.venta?.productos?.[0]?.cantidad, 1);
});

test('una venta sin el campo inventario conserva la validación de existencia', async (t) => {
  instalarInventario(t, {});

  const res = crearRespuesta();
  await crearVenta(crearRequest(), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.mensaje || '', /No hay suficiente stock/);
});

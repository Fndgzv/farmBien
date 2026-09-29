const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const Laboratorio = require('../models/Laboratorio');
const controller = require('../controllers/productoController');

const ID = '64b000000000000000000001';
const LAB_ID = '64b000000000000000000002';

function preparar(t) {
  const doc = new Producto({
    _id: ID, nombre: 'Producto de prueba', unidad: 'PZA', categoria: 'IV',
    inventario: true, precio: 123, costo: 40, stockMinimo: 2, stockMaximo: 10,
    laboratorio: LAB_ID, sintomas: ['dolor'], descripcionUso: 'Conservar',
    imagen: 'imagen.png', ubicacion: 'A-1',
    lotes: [{ lote: 'Caducado', cantidad: 5, fechaCaducidad: '2020-01-01' }],
    promoLunes: { porcentaje: 10, inicio: '2030-01-01', fin: '2030-12-31', monedero: true },
    promoDeTemporada: { porcentaje: 15, inicio: '2030-01-01', fin: '2030-12-31', monedero: false },
    promoCantidadRequerida: 3, inicioPromoCantidad: '2030-01-01', finPromoCantidad: '2030-12-31'
  });
  const session = {
    withTransaction: async (fn) => fn(),
    endSession: t.mock.fn()
  };
  t.mock.method(mongoose, 'startSession', async () => session);
  t.mock.method(Producto, 'findById', () => ({ session: async () => doc }));
  const save = t.mock.method(doc, 'save', async () => { await doc.validate(); });
  const bulkWrite = t.mock.method(InventarioFarmacia, 'bulkWrite', async () => ({}));
  t.mock.method(console, 'error', () => {});
  return { doc, session, save, bulkWrite };
}

async function actualizar(productos) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await controller.actualizarProductos({ body: { productos } }, res);
  return res;
}

test('cambiar IV por M - IV conserva lotes caducados, promociones y demás campos omitidos', async (t) => {
  const { doc, session, save, bulkWrite } = preparar(t);
  const antes = doc.toObject();
  const res = await actualizar([{ _id: ID, categoria: 'M - IV' }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(doc.toObject(), { ...antes, categoria: 'M - IV' });
  assert.equal(save.mock.callCount(), 1);
  assert.equal(bulkWrite.mock.callCount(), 0, 'un cambio de categoría no debe sobrescribir precios de farmacias');
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('inventario admite false y true sin modificar las existencias ni los demás campos', async (t) => {
  const { doc } = preparar(t);
  const antes = doc.toObject();
  for (const inventario of [false, true]) {
    const res = await actualizar([{ _id: ID, inventario }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(doc.toObject(), { ...antes, inventario });
  }
});

test('mantiene la actualización combinada de stock, laboratorio, promociones y precio con sincronización', async (t) => {
  const { doc, bulkWrite, session } = preparar(t);
  const res = await actualizar([{
    _id: ID, stockMinimo: 0, stockMaximo: 30, ubicacion: 'B-1', laboratorio: null,
    inventario: false, precio: 150,
    promoLunes: { porcentaje: 20, inicio: '2030-02-01', fin: '2030-02-28', monedero: false }
  }]);
  assert.equal(res.statusCode, 200);
  assert.equal(doc.stockMinimo, 0);
  assert.equal(doc.stockMaximo, 30);
  assert.equal(doc.ubicacion, 'B-1');
  assert.equal(doc.laboratorio, null);
  assert.equal(doc.inventario, false);
  assert.equal(doc.promoLunes.porcentaje, 20);
  assert.equal(doc.promoLunes.monedero, false);
  assert.equal(doc.precio, 150);
  assert.deepEqual(bulkWrite.mock.calls[0].arguments, [[{
    updateMany: { filter: { producto: doc._id }, update: { $set: { precioVenta: 150 } } }
  }], { session }]);
});

test('conserva compatibilidad con un payload completo y reemplazo explícito de lotes', async (t) => {
  const { doc } = preparar(t);
  t.mock.method(Laboratorio, 'exists', () => ({ session: async () => ({ _id: LAB_ID }) }));
  const payload = JSON.parse(JSON.stringify({ ...doc.toObject(), categoria: 'M - IV', inventario: false, lotes: [] }));
  const res = await actualizar([payload]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), payload);
});

test('sigue rechazando lotes duplicados, fechas vencidas y promociones inválidas cuando se envían', async (t) => {
  const { save } = preparar(t);
  for (const cambios of [
    { lotes: [{ lote: 'A' }, { lote: 'A' }] },
    { lotes: [{ lote: 'A', fechaCaducidad: '2020-01-01' }] },
    { promoLunes: { porcentaje: 101 } }
  ]) {
    const res = await actualizar([{ _id: ID, ...cambios }]);
    assert.notEqual(res.statusCode, 200);
    assert.equal(save.mock.callCount(), 0);
  }
});

test('un producto inexistente no se reporta como actualizado', async (t) => {
  const { save, session } = preparar(t);
  Producto.findById.mock.mockImplementation(() => ({ session: async () => null }));
  const res = await actualizar([{ _id: ID, inventario: false }]);
  assert.equal(res.statusCode, 404);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(session.endSession.mock.callCount(), 1);
});

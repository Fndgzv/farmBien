const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Venta = require('../models/Venta');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const controller = require('../controllers/ajusteInventarioController');

const FARMACIA_ID = '64b000000000000000000001';
const OTRA_FARMACIA_ID = '64b000000000000000000002';

function ventaAgrupada(numero, categoria, campos = {}) {
  const _id = new mongoose.Types.ObjectId(numero.toString(16).padStart(24, '0'));
  return {
    _id,
    cantidadVendida: 20,
    producto: { _id, nombre: `Producto ${numero}`, categoria, inventario: true, ...campos }
  };
}

function respuesta() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function instalarConsultas(t, ventas, inventarios = []) {
  const aggregate = t.mock.method(Venta, 'aggregate', async () => ventas);
  const find = t.mock.method(InventarioFarmacia, 'find', (filtro) => ({
    populate: async () => inventarios.filter(inv =>
      String(inv.farmacia) === String(filtro.farmacia)
      && filtro.producto.$in.some(id => String(id) === String(inv.producto._id))
    )
  }));
  return { aggregate, find };
}

async function buscar(query = {}) {
  const res = respuesta();
  await controller.stockPropuesto({ query: {
    farmaciaId: FARMACIA_ID,
    desde: '2026-09-01',
    hasta: '2026-09-10',
    diasSurtir: '7',
    ...query
  } }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
}

test('stock auto filtra el prefijo completo de categoria aunque categoriaNorm falte o esté desactualizada', async (t) => {
  const ventas = [
    ventaAgrupada(11, 'M - IV'),
    ventaAgrupada(12, 'M - IV pediátrico', { categoriaNorm: 'iv' }),
    ventaAgrupada(13, 'M - VI', { categoriaNorm: 'm - iv' }),
    ventaAgrupada(14, 'IV'),
    ventaAgrupada(15, 'Otro M - IV')
  ];
  instalarConsultas(t, ventas);

  const tabla = await buscar({ categoria: '  m   -   IV  ' });

  assert.deepEqual(tabla.map(row => row.categoria), ['M - IV', 'M - IV pediátrico']);
});

test('stock auto busca categoria sin distinguir acentos o mayúsculas y trata símbolos literalmente', async (t) => {
  instalarConsultas(t, [
    ventaAgrupada(11, 'Antibióticos pediátricos'),
    ventaAgrupada(12, 'Antibióticos adultos'),
    ventaAgrupada(13, 'M [IV]'),
    ventaAgrupada(14, 'M I')
  ]);

  const tabla = await buscar({ categoria: 'ANTIBIOTICOS PEDIATRICOS' });
  assert.deepEqual(tabla.map(row => row.categoria), ['Antibióticos pediátricos']);
  const simbolos = await buscar({ categoria: 'M [IV]' });
  assert.deepEqual(simbolos.map(row => row.categoria), ['M [IV]']);
});

test('stock auto excluye inventario false con y sin categoria y conserva productos antiguos sin el campo', async (t) => {
  const ventas = [
    ventaAgrupada(11, 'M - IV'),
    ventaAgrupada(12, 'M - IV', { inventario: false }),
    ventaAgrupada(13, 'M - IV', { inventario: undefined })
  ];
  const { find } = instalarConsultas(t, ventas);

  for (const categoria of [undefined, '', '   ', 'M - IV']) {
    const tabla = await buscar({ categoria });
    assert.deepEqual(tabla.map(row => String(row.productoId)), [String(ventas[0]._id), String(ventas[2]._id)]);
    const idsConsultados = find.mock.calls.at(-1).arguments[0].producto.$in;
    assert.equal(idsConsultados.some(id => String(id) === String(ventas[1]._id)), false);
  }
});

test('stock auto devuelve vacío sin consultar inventario si no hay coincidencias o solo hay productos sin inventario', async (t) => {
  const { aggregate, find } = instalarConsultas(t, [ventaAgrupada(11, 'M - IV')]);
  assert.deepEqual(await buscar({ categoria: 'Inexistente' }), []);
  aggregate.mock.mockImplementation(async () => [ventaAgrupada(12, 'M - IV', { inventario: false })]);
  assert.deepEqual(await buscar(), []);
  aggregate.mock.mockImplementation(async () => []);
  assert.deepEqual(await buscar(), []);
  assert.equal(find.mock.callCount(), 0);
});

test('stock auto conserva el periodo de ventas y lee stocks de la farmacia seleccionada', async (t) => {
  const venta = ventaAgrupada(11, 'M - IV', { stockMinimo: 50, stockMaximo: 100 });
  const { aggregate } = instalarConsultas(t, [venta], [
    { farmacia: FARMACIA_ID, producto: venta.producto, existencia: 4, stockMin: 3, stockMax: 9 },
    { farmacia: OTRA_FARMACIA_ID, producto: venta.producto, existencia: 100, stockMin: 20, stockMax: 40 }
  ]);

  const [row] = await buscar({ categoria: 'M - IV' });
  assert.equal(row.stockMinActual, 3);
  assert.equal(row.stockMaxActual, 9);
  assert.equal(row.existencia, 4);
  assert.equal(row.cantidadVendida, 20);
  assert.equal(row.productosPorDia, 2);
  assert.equal(row.stockMaxPropuesto, 16);
  assert.equal(row.stockMinPropuesto, 10);
  assert.equal(row.faltanSobran, 12);

  const pipeline = aggregate.mock.calls[0].arguments[0];
  assert.deepEqual(pipeline[0].$match, {
    farmacia: new mongoose.Types.ObjectId(FARMACIA_ID),
    fecha: { $gte: new Date('2026-09-01T00:00:00.000Z'), $lte: new Date('2026-09-10T23:59:59.999Z') }
  });
  assert.ok(pipeline.some(stage => stage.$lookup?.from === 'productos'));
});

test('aplicar stock auto escribe stockMin y stockMax solo para los productos y farmacia seleccionados', async (t) => {
  const productoId = ventaAgrupada(11, 'M - IV')._id;
  const bulkWrite = t.mock.method(InventarioFarmacia, 'bulkWrite', async () => ({ modifiedCount: 1 }));
  const res = respuesta();

  await controller.aplicarCambiosStockAuto({ body: {
    farmaciaId: FARMACIA_ID,
    productos: [{ productoId: String(productoId), stockMin: 10, stockMax: 16 }]
  } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, modificados: 1 });
  assert.deepEqual(bulkWrite.mock.calls[0].arguments[0], [{
    updateOne: {
      filter: { farmacia: new mongoose.Types.ObjectId(FARMACIA_ID), producto: productoId },
      update: { $set: { stockMin: 10, stockMax: 16 } }
    }
  }]);
});

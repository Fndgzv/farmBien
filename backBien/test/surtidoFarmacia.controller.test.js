const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const controller = require('../controllers/surtidoFarmaciaController');

const FARMACIA_ID = '64b000000000000000000001';
const USUARIO_ID = '64b000000000000000000004';

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
    }
  };
}

function crearPeticion(detalles = []) {
  return {
    body: { farmaciaId: FARMACIA_ID, confirm: true, detalles },
    usuario: { id: USUARIO_ID, rol: 'admin' }
  };
}

function crearProducto({ id, nombre, lotes, precio = 10 }) {
  const guardados = [];
  return {
    _id: id,
    nombre,
    codigoBarras: `CB-${id.slice(-2)}`,
    categoria: 'General',
    ubicacion: 'A-1',
    precio,
    lotes: lotes.map((lote) => ({ ...lote })),
    guardados,
    async save(options) {
      guardados.push(options);
    }
  };
}

function crearInventario({ producto, existencia, stockMin, stockMax, precioVenta = 12 }) {
  const guardados = [];
  return {
    producto,
    existencia,
    stockMin,
    stockMax,
    precioVenta,
    ubicacionFarmacia: 'F-1',
    guardados,
    async save(options) {
      guardados.push(options);
    }
  };
}

function crearConsulta(getInventarios, sesionesDeLectura) {
  return {
    session(session) {
      sesionesDeLectura.push(session);
      return this;
    },
    async populate() {
      return getInventarios();
    }
  };
}

function capturarEstado(inventarios) {
  return inventarios.map((inventario) => ({
    existencia: inventario.existencia,
    lotes: inventario.producto.lotes.map((lote) => lote.cantidad)
  }));
}

function restaurarEstado(inventarios, estado) {
  inventarios.forEach((inventario, indice) => {
    inventario.existencia = estado[indice].existencia;
    inventario.producto.lotes.forEach((lote, indiceLote) => {
      lote.cantidad = estado[indice].lotes[indiceLote];
    });
  });
}

function crearSession(inventarios) {
  return {
    commits: 0,
    abortosAutomaticos: 0,
    abortosManuales: 0,
    cierres: 0,
    async withTransaction(callback) {
      const estadoInicial = capturarEstado(inventarios);
      try {
        await callback();
        this.commits += 1;
      } catch (error) {
        restaurarEstado(inventarios, estadoInicial);
        this.abortosAutomaticos += 1;
        throw error;
      }
    },
    async abortTransaction() {
      this.abortosManuales += 1;
      throw new Error('Cannot call abortTransaction twice');
    },
    async endSession() {
      this.cierres += 1;
    }
  };
}

function instalarInventarios(t, inventarios) {
  const sesionesDeLectura = [];
  t.mock.method(InventarioFarmacia, 'find', () =>
    crearConsulta(() => inventarios, sesionesDeLectura)
  );
  return sesionesDeLectura;
}

function crearDocumentoSurtido(data, id = '64b000000000000000000099') {
  return {
    _id: id,
    toObject() {
      return {
        _id: id,
        farmacia: data.farmacia,
        usuarioSurtio: data.usuarioSurtio,
        fechaSurtido: new Date('2026-08-03T12:00:00Z'),
        tipoMovimiento: data.tipoMovimiento,
        items: data.items.map((item) => ({ ...item }))
      };
    }
  };
}

test('surte un producto en una sola transaccion y cierra la sesion una vez', async (t) => {
  const producto = crearProducto({
    id: '64b000000000000000000011',
    nombre: 'Producto uno',
    lotes: [{ lote: 'L1', cantidad: 8, fechaCaducidad: '2027-01-01' }]
  });
  const inventario = crearInventario({
    producto,
    existencia: 1,
    stockMin: 2,
    stockMax: 6
  });
  const inventarios = [inventario];
  const session = crearSession(inventarios);
  const sesionesDeLectura = instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);

  let creacion;
  t.mock.method(SurtidoFarmacia, 'create', async ([data], options) => {
    creacion = { data, options };
    return [crearDocumentoSurtido(data)];
  });

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(inventario.existencia, 6);
  assert.equal(producto.lotes[0].cantidad, 3);
  assert.equal(creacion.data.items.length, 1);
  assert.equal(creacion.data.items[0].cantidad, 5);
  assert.equal(creacion.options.session, session);
  assert.equal(producto.guardados[0].session, session);
  assert.equal(inventario.guardados[0].session, session);
  assert.deepEqual(sesionesDeLectura, [session]);
  assert.equal(session.commits, 1);
  assert.equal(session.abortosAutomaticos, 0);
  assert.equal(session.abortosManuales, 0);
  assert.equal(session.cierres, 1);
});

test('surte varios productos y lotes en un unico movimiento', async (t) => {
  const productoA = crearProducto({
    id: '64b000000000000000000021',
    nombre: 'Producto A',
    lotes: [
      { lote: 'A2', cantidad: 5, fechaCaducidad: '2028-01-01' },
      { lote: 'A1', cantidad: 3, fechaCaducidad: '2027-01-01' }
    ]
  });
  const productoB = crearProducto({
    id: '64b000000000000000000022',
    nombre: 'Producto B',
    lotes: [{ lote: 'B1', cantidad: 4, fechaCaducidad: '2027-06-01' }]
  });
  const inventarios = [
    crearInventario({ producto: productoA, existencia: 0, stockMin: 1, stockMax: 6 }),
    crearInventario({ producto: productoB, existencia: 2, stockMin: 2, stockMax: 5 })
  ];
  const session = crearSession(inventarios);
  instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);

  let movimientos = 0;
  let itemsCreados;
  t.mock.method(SurtidoFarmacia, 'create', async ([data]) => {
    movimientos += 1;
    itemsCreados = data.items.map((item) => ({ ...item }));
    return [crearDocumentoSurtido(data)];
  });

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(movimientos, 1);
  assert.deepEqual(itemsCreados.map((item) => [item.lote, item.cantidad]), [
    ['A1', 3],
    ['A2', 3],
    ['B1', 3]
  ]);
  assert.deepEqual(inventarios.map((inventario) => inventario.existencia), [6, 5]);
  assert.equal(res.body.surtido.items.length, 3);
  assert.equal(session.commits, 1);
  assert.equal(session.cierres, 1);
});

test('sin existencia no crea movimientos ni intenta abortar dos veces', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const producto = crearProducto({
    id: '64b000000000000000000031',
    nombre: 'Sin stock',
    lotes: [{ lote: 'L0', cantidad: 0, fechaCaducidad: '2027-01-01' }]
  });
  const inventarios = [
    crearInventario({ producto, existencia: 0, stockMin: 1, stockMax: 5 })
  ];
  const session = crearSession(inventarios);
  instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);
  const crearMovimiento = t.mock.method(SurtidoFarmacia, 'create', async () => {
    throw new Error('No debe crear movimientos');
  });

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.match(res.body.detalle, /sin existencia/i);
  assert.equal(crearMovimiento.mock.callCount(), 0);
  assert.equal(session.commits, 0);
  assert.equal(session.abortosAutomaticos, 1);
  assert.equal(session.abortosManuales, 0);
  assert.equal(session.cierres, 1);
});

test('un producto sin lotes no genera cambios parciales', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const producto = crearProducto({
    id: '64b000000000000000000035',
    nombre: 'Sin lotes',
    lotes: []
  });
  const inventario = crearInventario({
    producto,
    existencia: 0,
    stockMin: 1,
    stockMax: 5
  });
  const inventarios = [inventario];
  const session = crearSession(inventarios);
  instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);
  const crearMovimiento = t.mock.method(SurtidoFarmacia, 'create', async () => undefined);

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 400);
  assert.equal(inventario.existencia, 0);
  assert.equal(producto.guardados.length, 0);
  assert.equal(crearMovimiento.mock.callCount(), 0);
  assert.equal(session.abortosAutomaticos, 1);
  assert.equal(session.abortosManuales, 0);
  assert.equal(session.cierres, 1);
});

test('un lote insuficiente surte solo lo disponible sin exceder cantidades', async (t) => {
  const producto = crearProducto({
    id: '64b000000000000000000036',
    nombre: 'Stock parcial',
    lotes: [{ lote: 'LP', cantidad: 2, fechaCaducidad: '2027-01-01' }]
  });
  const inventario = crearInventario({
    producto,
    existencia: 0,
    stockMin: 1,
    stockMax: 5
  });
  const inventarios = [inventario];
  const session = crearSession(inventarios);
  instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);

  let items;
  t.mock.method(SurtidoFarmacia, 'create', async ([data]) => {
    items = data.items;
    return [crearDocumentoSurtido(data)];
  });

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(inventario.existencia, 2);
  assert.equal(producto.lotes[0].cantidad, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].cantidad, 2);
  assert.equal(session.commits, 1);
  assert.equal(session.abortosManuales, 0);
  assert.equal(session.cierres, 1);
});

test('un error al actualizar la farmacia revierte tambien los lotes de almacen', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const producto = crearProducto({
    id: '64b000000000000000000037',
    nombre: 'Error destino',
    lotes: [{ lote: 'LE', cantidad: 7, fechaCaducidad: '2027-01-01' }]
  });
  const inventario = crearInventario({
    producto,
    existencia: 1,
    stockMin: 1,
    stockMax: 5
  });
  inventario.save = async () => {
    throw new Error('Fallo simulado al actualizar farmacia');
  };
  const inventarios = [inventario];
  const session = crearSession(inventarios);
  instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);
  const crearMovimiento = t.mock.method(SurtidoFarmacia, 'create', async () => undefined);

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(inventario.existencia, 1);
  assert.equal(producto.lotes[0].cantidad, 7);
  assert.equal(crearMovimiento.mock.callCount(), 0);
  assert.equal(session.abortosAutomaticos, 1);
  assert.equal(session.abortosManuales, 0);
  assert.equal(session.cierres, 1);
});

test('un error al registrar el surtido revierte almacen y farmacia', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const producto = crearProducto({
    id: '64b000000000000000000041',
    nombre: 'Producto rollback',
    lotes: [{ lote: 'LR', cantidad: 5, fechaCaducidad: '2027-01-01' }]
  });
  const inventario = crearInventario({
    producto,
    existencia: 0,
    stockMin: 1,
    stockMax: 4
  });
  const inventarios = [inventario];
  const session = crearSession(inventarios);
  instalarInventarios(t, inventarios);
  t.mock.method(mongoose, 'startSession', async () => session);
  t.mock.method(SurtidoFarmacia, 'create', async () => {
    throw new Error('Fallo simulado de base de datos');
  });

  const res = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.doesNotMatch(res.body.error, /Fallo simulado/);
  assert.equal(inventario.existencia, 0);
  assert.equal(producto.lotes[0].cantidad, 5);
  assert.equal(session.commits, 0);
  assert.equal(session.abortosAutomaticos, 1);
  assert.equal(session.abortosManuales, 0);
  assert.equal(session.cierres, 1);
});

test('dos confirmaciones consecutivas solo generan un surtido', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const producto = crearProducto({
    id: '64b000000000000000000051',
    nombre: 'Producto repetido',
    lotes: [{ lote: 'LD', cantidad: 10, fechaCaducidad: '2027-01-01' }]
  });
  const inventario = crearInventario({
    producto,
    existencia: 0,
    stockMin: 1,
    stockMax: 5
  });
  const inventarios = [inventario];
  instalarInventarios(t, inventarios);

  const sesiones = [];
  t.mock.method(mongoose, 'startSession', async () => {
    const session = crearSession(inventarios);
    sesiones.push(session);
    return session;
  });

  let movimientos = 0;
  t.mock.method(SurtidoFarmacia, 'create', async ([data]) => {
    movimientos += 1;
    return [crearDocumentoSurtido(data, `movimiento-${movimientos}`)];
  });

  const primera = crearRespuesta();
  const segunda = crearRespuesta();
  await controller.surtirFarmacia(crearPeticion(), primera);
  await controller.surtirFarmacia(crearPeticion(), segunda);

  assert.equal(primera.statusCode, 200);
  assert.equal(segunda.statusCode, 400);
  assert.equal(movimientos, 1);
  assert.equal(inventario.existencia, 5);
  assert.equal(producto.lotes[0].cantidad, 5);
  assert.equal(sesiones.length, 2);
  assert.equal(sesiones[0].commits, 1);
  assert.equal(sesiones[1].abortosAutomaticos, 1);
  assert.equal(sesiones[0].abortosManuales + sesiones[1].abortosManuales, 0);
  assert.equal(sesiones[0].cierres + sesiones[1].cierres, 2);
});

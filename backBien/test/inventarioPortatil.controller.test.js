const test = require('node:test');
const assert = require('node:assert/strict');

const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const InventarioFisico = require('../models/InventarioFisico');
const Farmacia = require('../models/Farmacia');
const controller = require('../controllers/inventarioPortatil.controller');

const FARMACIA_ID = '64b000000000000000000001';
const OTRA_FARMACIA_ID = '64b000000000000000000002';
const PRODUCTO_ID = '64b000000000000000000003';

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

function crearPeticion(body, rol = 'ajustaAlmacen', farmaciaUsuario = null) {
  return {
    params: {
      farmaciaId: FARMACIA_ID,
      productoId: PRODUCTO_ID
    },
    body,
    usuario: {
      _id: '64b000000000000000000004',
      rol,
      farmacia: farmaciaUsuario
    }
  };
}

test('actualiza únicamente ubicacionFarmacia sin generar movimiento físico', async (t) => {
  t.mock.method(Farmacia, 'exists', async () => ({ _id: FARMACIA_ID }));
  t.mock.method(Producto, 'findById', () => ({
    select: async () => ({ costo: 10 })
  }));
  t.mock.method(InventarioFarmacia, 'findOne', async () => ({ existencia: 7 }));

  let operacion;
  t.mock.method(InventarioFarmacia, 'findOneAndUpdate', async (filtro, update, options) => {
    operacion = { filtro, update, options };
    return {
      farmacia: FARMACIA_ID,
      producto: PRODUCTO_ID,
      existencia: 7,
      ubicacionFarmacia: update.$set.ubicacionFarmacia
    };
  });

  const crearMovimiento = t.mock.method(InventarioFisico, 'create', async () => {
    throw new Error('No debe crear movimientos');
  });

  const req = crearPeticion(
    { ubicacion: '  A-03-02  ' },
    'ajustaFarma',
    { toString: () => FARMACIA_ID }
  );
  const res = crearRespuesta();

  await controller.ajustarExistenciaFarmacia(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mensaje, 'Ubicación actualizada');
  assert.deepEqual(operacion, {
    filtro: { farmacia: FARMACIA_ID, producto: PRODUCTO_ID },
    update: { $set: { ubicacionFarmacia: 'A-03-02' } },
    options: { new: true, upsert: false }
  });
  assert.equal(crearMovimiento.mock.callCount(), 0);
});

test('guarda existencia y ubicación de farmacia en la misma actualización', async (t) => {
  t.mock.method(Farmacia, 'exists', async () => ({ _id: FARMACIA_ID }));
  t.mock.method(Producto, 'findById', () => ({
    select: async () => ({ costo: 10 })
  }));
  t.mock.method(InventarioFarmacia, 'findOne', async () => ({ existencia: 7 }));

  let updateRecibido;
  t.mock.method(InventarioFarmacia, 'findOneAndUpdate', async (_filtro, update) => {
    updateRecibido = update;
    return {
      farmacia: FARMACIA_ID,
      producto: PRODUCTO_ID,
      existencia: 9,
      ubicacionFarmacia: 'B-01'
    };
  });

  let movimiento;
  t.mock.method(InventarioFisico, 'create', async (data) => {
    movimiento = data;
    return data;
  });

  const req = crearPeticion({ nuevaExistencia: 9, ubicacion: ' B-01 ' });
  const res = crearRespuesta();

  await controller.ajustarExistenciaFarmacia(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateRecibido, {
    $set: { existencia: 9, ubicacionFarmacia: 'B-01' }
  });
  assert.equal(movimiento.existenciaSistema, 7);
  assert.equal(movimiento.existenciaFisica, 9);
  assert.equal(movimiento.diferencia, 2);
});

test('ajustaFarma no puede modificar una farmacia distinta a la del token', async () => {
  const req = crearPeticion(
    { ubicacion: 'A-01' },
    'ajustaFarma',
    { toString: () => OTRA_FARMACIA_ID }
  );
  const res = crearRespuesta();

  await controller.ajustarExistenciaFarmacia(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.mensaje, 'No puedes ajustar otras farmacias.');
});

test('ubicación sola no crea un inventario de farmacia inexistente', async (t) => {
  t.mock.method(Farmacia, 'exists', async () => ({ _id: FARMACIA_ID }));
  t.mock.method(Producto, 'findById', () => ({
    select: async () => ({ costo: 10 })
  }));
  t.mock.method(InventarioFarmacia, 'findOne', async () => null);
  const actualizar = t.mock.method(InventarioFarmacia, 'findOneAndUpdate', async () => {
    throw new Error('No debe crear el documento');
  });

  const req = crearPeticion({ ubicacion: 'A-02' });
  const res = crearRespuesta();

  await controller.ajustarExistenciaFarmacia(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(actualizar.mock.callCount(), 0);
});

test('actualiza productos.ubicacion recortando espacios', async (t) => {
  let operacion;
  t.mock.method(Producto, 'findByIdAndUpdate', (id, update) => {
    operacion = { id, update };
    return {
      select: async () => ({
        _id: id,
        ubicacion: update.$set.ubicacion
      })
    };
  });

  const req = {
    params: { productoId: PRODUCTO_ID },
    body: { ubicacion: '  ANAQUEL 4  ' },
    usuario: { rol: 'ajustaSoloAlmacen' }
  };
  const res = crearRespuesta();

  await controller.actualizarUbicacionAlmacen(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(operacion, {
    id: PRODUCTO_ID,
    update: { $set: { ubicacion: 'ANAQUEL 4' } }
  });
});

test('guarda lote y ubicación de almacén en un solo save del producto', async (t) => {
  let guardados = 0;
  const producto = {
    lotes: [],
    ubicacion: '',
    costo: 5,
    async save() {
      guardados += 1;
    }
  };

  t.mock.method(Producto, 'findById', async () => producto);
  t.mock.method(InventarioFisico, 'create', async (data) => data);

  const req = {
    params: { productoId: PRODUCTO_ID },
    body: {
      lote: 'LOTE-01',
      fechaCaducidad: '2027-07-31',
      cantidad: 4,
      ubicacion: '  PASILLO 2  '
    },
    usuario: { _id: '64b000000000000000000004', rol: 'ajustaAlmacen' }
  };
  const res = crearRespuesta();

  await controller.agregarLote(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(guardados, 1);
  assert.equal(producto.ubicacion, 'PASILLO 2');
  assert.equal(producto.lotes.length, 1);
  assert.equal(producto.lotes[0].cantidad, 4);
});

test('rechaza ubicaciones vacías o mayores a 120 caracteres', async () => {
  const reqVacia = {
    params: { productoId: PRODUCTO_ID },
    body: { ubicacion: '   ' },
    usuario: { rol: 'ajustaAlmacen' }
  };
  const resVacia = crearRespuesta();

  await controller.actualizarUbicacionAlmacen(reqVacia, resVacia);
  assert.equal(resVacia.statusCode, 400);

  const reqLarga = {
    ...reqVacia,
    body: { ubicacion: 'A'.repeat(121) }
  };
  const resLarga = crearRespuesta();

  await controller.actualizarUbicacionAlmacen(reqLarga, resLarga);
  assert.equal(resLarga.statusCode, 400);
  assert.match(resLarga.body.mensaje, /120 caracteres/);
});

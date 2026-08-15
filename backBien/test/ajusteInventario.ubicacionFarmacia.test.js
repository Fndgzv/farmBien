const test = require('node:test');
const assert = require('node:assert/strict');

const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const controller = require('../controllers/ajusteInventarioController');

const FARMACIA_ID = '64b000000000000000000001';
const PRODUCTO_ID = '64b000000000000000000002';

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

function instalarConsultas(t, inventario) {
  const pipelines = [];

  t.mock.method(Producto, 'find', () => ({
    select() {
      return this;
    },
    async lean() {
      return [{ _id: PRODUCTO_ID }];
    }
  }));

  t.mock.method(InventarioFarmacia, 'aggregate', (pipeline) => ({
    async allowDiskUse() {
      pipelines.push(pipeline);
      return inventario;
    }
  }));

  return pipelines;
}

async function buscar(ubicacionFarmacia) {
  const res = crearRespuesta();
  await controller.obtenerInventarioFarmacia({
    query: { farmacia: FARMACIA_ID, ubicacionFarmacia }
  }, res);
  return res;
}

test('ubicacionFarmacia encuentra Antibiótico con texto parcial, acentos y mayúsculas', async (t) => {
  const inventario = [{ _id: 'antibiotico', ubicacionFarmacia: 'Antibiótico' }];
  const pipelines = instalarConsultas(t, inventario);
  const busquedas = [
    'A',
    'Ant',
    'Anti',
    'Antibi',
    'Antibió',
    'Antibiót',
    'Antibiótico',
    'Antibiotico',
    'antibiótico',
    'antibiotico',
    'ANTIBIÓTICO',
    'ANTIBIOTICO'
  ];

  for (const busqueda of busquedas) {
    const res = await buscar(busqueda);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, inventario, `debe encontrar con ${busqueda}`);
  }

  const matchInventario = pipelines.at(-1)[0].$match;
  assert.equal(matchInventario.ubicacionFarmacia, undefined);
  assert.equal(matchInventario.$and, undefined);
  assert.doesNotMatch(JSON.stringify(matchInventario), /\\\\u0300|\$regexMatch/);
});

test('ubicacionFarmacia normaliza otros diacríticos y Unicode descompuesto', async (t) => {
  const inventario = [
    { _id: 'genericos', ubicacionFarmacia: 'Genéricos' },
    { _id: 'inyeccion', ubicacionFarmacia: 'Inyección' },
    { _id: 'pediatrico', ubicacionFarmacia: 'Pediátrico' },
    { _id: 'optica', ubicacionFarmacia: 'Óptica' },
    { _id: 'pinguino', ubicacionFarmacia: 'Pingüino' },
    { _id: 'ninez', ubicacionFarmacia: 'Nin\u0303ez' }
  ];
  instalarConsultas(t, inventario);

  const casos = [
    ['Genericos', 'genericos'],
    ['Genéricos', 'genericos'],
    ['Inyeccion', 'inyeccion'],
    ['Inyección', 'inyeccion'],
    ['Pediatrico', 'pediatrico'],
    ['Pediátrico', 'pediatrico'],
    ['Optica', 'optica'],
    ['Óptica', 'optica'],
    ['pinguino', 'pinguino'],
    ['niñez', 'ninez']
  ];

  for (const [busqueda, idEsperado] of casos) {
    const res = await buscar(busqueda);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((item) => item._id), [idEsperado]);
  }
});

test('ubicacionFarmacia trata caracteres de regex como texto literal y nunca los envía a MongoDB', async (t) => {
  const especiales = ['[', ']', '(', ')', '\\', '*', '+', '?', '.', '^', '$', '{', '}'];
  const ubicacion = `Estante ${especiales.join(' ')}`;
  const inventario = [{ _id: 'especiales', ubicacionFarmacia: ubicacion }];
  const pipelines = instalarConsultas(t, inventario);

  for (const caracter of especiales) {
    const res = await buscar(caracter);
    assert.equal(res.statusCode, 200, `no debe fallar con ${caracter}`);
    assert.deepEqual(res.body, inventario, `debe buscar literalmente ${caracter}`);
  }

  for (const pipeline of pipelines) {
    const matchInventario = pipeline[0].$match;
    assert.equal(matchInventario.$and, undefined);
    assert.equal(matchInventario.ubicacionFarmacia, undefined);
  }
});

test('ubicacionFarmacia conserva coincidencia parcial por todas las palabras y el orden', async (t) => {
  const inventario = [
    { _id: 'primero', ubicacionFarmacia: 'Área norte Antibióticos' },
    { _id: 'segundo', ubicacionFarmacia: 'Antibioticos del área sur' },
    { _id: 'tercero', ubicacionFarmacia: 'Área norte Pediátrico' }
  ];
  const pipelines = instalarConsultas(t, inventario);

  const res = await buscar('antibio área');

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.map((item) => item._id), ['primero', 'segundo']);
  assert.ok(pipelines.at(-1).some((etapa) => etapa.$sort));
});

test('ubicacionFarmacia vacía, ausente o null no filtra ni produce errores', async (t) => {
  const inventario = [
    { _id: 'con-ubicacion', ubicacionFarmacia: 'Antibiótico' },
    { _id: 'null', ubicacionFarmacia: null },
    { _id: 'sin-campo' }
  ];
  instalarConsultas(t, inventario);

  for (const ubicacionFarmacia of [undefined, null, '', '   ']) {
    const res = await buscar(ubicacionFarmacia);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, inventario);
  }
});

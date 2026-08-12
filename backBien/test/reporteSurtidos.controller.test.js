const test = require('node:test');
const assert = require('node:assert/strict');

const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const { reporteSurtidos } = require('../controllers/reportesControllers');

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

test('el reporte obtiene el costo del snapshot del surtido y no del producto actual', async (t) => {
  let pipeline;
  t.mock.method(SurtidoFarmacia, 'aggregate', (stages) => {
    pipeline = stages;
    return { allowDiskUse: async () => [] };
  });

  const req = {
    query: {
      fechaIni: '2026-08-01',
      fechaFin: '2026-08-10'
    }
  };
  const res = crearRespuesta();

  await reporteSurtidos(req, res);

  const groupStage = pipeline.find((stage) => stage.$group);
  const itemProjection = groupStage.$group.items.$push;

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(itemProjection.costo, '$items.costo');
  assert.notEqual(itemProjection.costo, '$prod.costo');
});

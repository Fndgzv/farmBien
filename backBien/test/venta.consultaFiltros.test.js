const test = require('node:test');
const assert = require('node:assert/strict');
const Venta = require('../models/Venta');
const { consultarVentas } = require('../controllers/ventaController');

function prepararConsultas(t) {
  const consultas = {};
  t.mock.method(Venta, 'find', filtro => {
    consultas.filtro = filtro;
    const query = {
      sort() { return this; },
      skip(valor) { consultas.skip = valor; return this; },
      limit(valor) { consultas.limit = valor; return this; },
      populate() { return this; },
      then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); }
    };
    return query;
  });
  t.mock.method(Venta, 'countDocuments', async filtro => {
    consultas.conteo = filtro;
    return 25;
  });
  t.mock.method(Venta, 'aggregate', async pipeline => {
    consultas.pipeline = pipeline;
    return [];
  });
  return consultas;
}

async function consultar(query) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await consultarVentas({ query: { fechaInicial: '2026-11-01', fechaFinal: '2026-11-04', ...query } }, res);
  return res;
}

// Evalúa las expresiones aritméticas de Mongo sobre casos concretos sin conectar a una base de datos.
function evaluar(expr, doc, variables = {}) {
  if (Array.isArray(expr)) return expr.map(item => evaluar(item, doc, variables));
  if (typeof expr === 'string' && expr.startsWith('$')) {
    const variable = expr.startsWith('$$');
    const ruta = expr.slice(variable ? 2 : 1).split('.');
    return ruta.reduce((valor, key) => valor?.[key], variable ? variables : doc);
  }
  if (expr === null || typeof expr !== 'object') return expr;
  const [operador, argumentos] = Object.entries(expr)[0];
  if (operador === '$map') {
    return evaluar(argumentos.input, doc, variables).map(p =>
      evaluar(argumentos.in, doc, { ...variables, [argumentos.as]: p }));
  }
  const valores = Array.isArray(argumentos)
    ? argumentos.map(a => evaluar(a, doc, variables)) : evaluar(argumentos, doc, variables);
  switch (operador) {
    case '$ifNull': return valores[0] ?? valores[1];
    case '$sum': return valores.reduce((a, b) => a + b, 0);
    case '$multiply': return valores.reduce((a, b) => a * b, 1);
    case '$subtract': return valores[0] - valores[1];
    case '$round': return Number(valores[0].toFixed(valores[1]));
    case '$gte': return valores[0] >= valores[1];
    case '$lte': return valores[0] <= valores[1];
    case '$and': return valores.every(Boolean);
    default: throw new Error(`Operador no esperado: ${operador}`);
  }
}

test('el rango de utilidad descuenta costo por cantidad y monedero, con límites inclusivos', async t => {
  const consultas = prepararConsultas(t);
  const res = await consultar({ utilidadDesde: '10', utilidadHasta: '20', page: '2', limit: '10' });
  assert.equal(res.statusCode, 200);
  const cumple = doc => evaluar(consultas.filtro.$expr, doc);
  const venta = { total: 100, productos: [{ costo: 20, cantidad: 2 }], formaPago: { vale: 40 } };
  assert.equal(cumple(venta), true, '100 - 40 - 40 = 20: incluye el límite superior');
  assert.equal(cumple({ ...venta, formaPago: { vale: 50 } }), true, 'incluye el límite inferior');
  assert.equal(cumple({ ...venta, formaPago: { vale: 50.01 } }), false);
  assert.equal(cumple({ ...venta, formaPago: { vale: 39.99 } }), false);
  assert.equal(cumple({ ...venta, formaPago: {} }), false, 'ausencia de monedero significa cero');
  assert.deepEqual(consultas.conteo, consultas.filtro);
  assert.deepEqual(consultas.pipeline[0].$match.$expr, consultas.filtro.$expr);
  assert.equal(consultas.skip, 10);
  assert.deepEqual(res.body.paginacion, { page: 2, limit: 10, totalRegistros: 25, totalPaginas: 3 });
});

test('utilidad permite límites negativos, cero y un solo extremo', async t => {
  const consultas = prepararConsultas(t);
  const venta = { total: 50, productos: [{ costo: 30, cantidad: 2 }] };
  await consultar({ utilidadHasta: '0' });
  assert.equal(evaluar(consultas.filtro.$expr, venta), true);
  assert.equal(evaluar(consultas.filtro.$expr, { ...venta, total: 61 }), false);
  await consultar({ utilidadDesde: '-10' });
  assert.equal(evaluar(consultas.filtro.$expr, venta), true);
  assert.equal(evaluar(consultas.filtro.$expr, { ...venta, total: 49 }), false);
  await consultar({ utilidadDesde: '0', utilidadHasta: '0' });
  assert.equal(evaluar(consultas.filtro.$expr, { total: 0 }), true);
  assert.equal(evaluar(consultas.filtro.$expr, venta), false);
});

for (const formaPago of ['efectivo', 'tarjeta', 'transferencia', 'vale']) {
  test(`forma de pago ${formaPago} incluye importes parciales y combina los demás filtros`, async t => {
    const consultas = prepararConsultas(t);
    const res = await consultar({ formaPago, totalDesde: '100', totalHasta: '200', utilidadDesde: '0', porServicioMedico: 'false' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(consultas.filtro[`formaPago.${formaPago}`], { $gt: 0 });
    assert.deepEqual(consultas.filtro.total, { $gte: 100, $lte: 200 });
    assert.deepEqual(consultas.filtro.porServicioMedico, { $ne: true });
    assert.ok(consultas.filtro.$expr);
    assert.deepEqual(consultas.pipeline[0].$match, consultas.filtro);
    assert.deepEqual(consultas.conteo, consultas.filtro);
    assert.equal(res.body.filtrosAplicados.formaPago, formaPago);
  });
}

test('TODAS y rangos vacíos conservan ventas de cualquier forma de pago', async t => {
  const consultas = prepararConsultas(t);
  const res = await consultar({ formaPago: '', utilidadDesde: '', utilidadHasta: '' });
  assert.equal(res.statusCode, 200);
  assert.equal(consultas.filtro.$expr, undefined);
  assert.equal(Object.keys(consultas.filtro).some(k => k.startsWith('formaPago')), false);
});

test('rechaza formas de pago fuera de las opciones permitidas', async t => {
  const consultas = prepararConsultas(t);
  const res = await consultar({ formaPago: '$where' });
  assert.equal(res.statusCode, 400);
  assert.equal(consultas.filtro, undefined);
});

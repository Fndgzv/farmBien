const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
require('../models/Producto');
const InventarioFisico = require('../models/InventarioFisico');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const ExcelJS = require('exceljs');
const { obtenerInventarioFisico, exportarExcel } = require('../controllers/inventarioFisico.controller');

const farmacia = '64b000000000000000000001';
const producto = new mongoose.Types.ObjectId('64b000000000000000000002');
const usuario = '64b000000000000000000003';
const datos = [
  { farmaNombre: farmacia, producto: { _id: producto, nombre: 'Producto', ubicacion: 'Almacén A' }, perdida: -20 },
  { farmaNombre: farmacia, producto: { _id: producto, nombre: 'Producto', ubicacion: 'Almacén A' }, perdida: 5 }
];

function respuesta() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {}, end() {}
  };
}

function simularConsultas(t, registros = datos) {
  t.mock.method(InventarioFisico, 'find', () => {
    let skip = 0;
    let limit = registros.length;
    const query = {
      populate(campo, seleccion) {
        if (campo === 'producto') assert.ok(seleccion.includes('ubicacion'));
        return this;
      },
      sort() { return this; },
      skip(valor) { skip = valor; return this; },
      limit(valor) { limit = valor; return this; },
      lean: async () => registros.slice(skip, skip + limit)
    };
    return query;
  });
  t.mock.method(InventarioFisico, 'countDocuments', async () => registros.length);
  t.mock.method(InventarioFisico, 'aggregate', async pipeline => {
    assert.equal(pipeline.length, 2);
    assert.equal(pipeline[1].$group.diferenciaTotal.$sum, '$perdida');
    assert.equal(pipeline[0].$match.farmaNombre, registros[0]?.farmaNombre ?? farmacia);
    return registros.length ? [{ diferenciaTotal: registros.reduce((suma, r) => suma + r.perdida, 0) }] : [];
  });
}

test('cada página devuelve el total de todas las diferencias y la ubicación de su farmacia', async t => {
  simularConsultas(t);
  t.mock.method(InventarioFarmacia, 'find', filtro => {
    assert.deepEqual(filtro.$or, [{ farmacia, producto }]);
    return { select: () => ({ lean: async () => [{ farmacia, producto, ubicacionFarmacia: 'Farmacia B-2' }] }) };
  });
  for (const page of [1, 2]) {
    const res = respuesta();
    await obtenerInventarioFisico({ query: { farmacia, page, limit: 1 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.diferenciaTotal, -15);
    assert.equal(res.body.resultados.length, 1);
    assert.equal(res.body.resultados[0].ubicacion, 'Farmacia B-2');
    assert.equal(res.body.page, page);
  }
});

test('el almacén usa ubicacion del producto sin consultar el inventario de farmacia', async t => {
  simularConsultas(t, [{ ...datos[0], farmaNombre: 'Almacén' }]);
  const find = t.mock.method(InventarioFarmacia, 'find', () => { throw new Error('No debe consultar'); });
  const res = respuesta();
  await obtenerInventarioFisico({ query: { farmacia, almacen: 'true' } }, res);
  assert.equal(res.body.resultados[0].ubicacion, 'Almacén A');
  assert.equal(find.mock.callCount(), 0);
});

test('una farmacia sin ubicación deja la celda vacía y no toma la ubicación de almacén', async t => {
  simularConsultas(t);
  t.mock.method(InventarioFarmacia, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const res = respuesta();
  await obtenerInventarioFisico({ query: { farmacia } }, res);
  assert.equal(res.body.resultados[0].ubicacion, '');
});

test('el total respeta producto, usuario y fechas con los tipos que requiere la agregación', async t => {
  simularConsultas(t);
  t.mock.method(InventarioFarmacia, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(InventarioFisico, 'aggregate', async pipeline => {
    const filtro = pipeline[0].$match;
    assert.ok(filtro.producto.equals(producto));
    assert.ok(filtro.usuario.equals(new mongoose.Types.ObjectId(usuario)));
    assert.ok(filtro.fechaInv.$gte instanceof Date);
    assert.ok(filtro.fechaInv.$lte instanceof Date);
    return [{ diferenciaTotal: -20 }];
  });
  const res = respuesta();
  await obtenerInventarioFisico({ query: {
    farmacia, producto: String(producto), usuario, desde: '2026-10-01', hasta: '2026-10-09'
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.diferenciaTotal, -20);
});

test('sin registros devuelve diferencia total cero', async t => {
  simularConsultas(t, []);
  const res = respuesta();
  await obtenerInventarioFisico({ query: { farmacia } }, res);
  assert.equal(res.body.diferenciaTotal, 0);
  assert.deepEqual(res.body.resultados, []);
});

test('el Excel conserva la ubicación y suma las diferencias en la misma columna monetaria', async t => {
  simularConsultas(t, datos.map(r => ({ ...r, farmaNombre: 'Almacén' })));
  let sheet;
  // Usar un libro real permite comprobar filas, columnas y formatos.
  const original = ExcelJS.Workbook.prototype.addWorksheet;
  t.mock.method(ExcelJS.Workbook.prototype, 'addWorksheet', function (...args) {
    sheet = original.apply(this, args);
    this.xlsx.write = async () => {};
    return sheet;
  });
  const res = respuesta();
  await exportarExcel({ query: { almacen: 'true' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sheet.getCell('C1').value, 'Ubicación');
  assert.equal(sheet.getCell('C2').value, 'Almacén A');
  assert.equal(sheet.getCell('A4').value, 'Diferencia total:');
  assert.equal(sheet.getCell('H4').value, -15);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const Producto = require('../models/Producto');
const {
  controlaInventario,
  esProductoSinInventarioInicial,
} = require('../utils/controlInventario');

test('Producto usa inventario=true por defecto', () => {
  const producto = new Producto({
    nombre: 'Producto de prueba',
    unidad: 'PZA',
    precio: 1,
    costo: 1,
    categoria: 'Prueba',
  });

  assert.equal(producto.inventario, true);
});

test('solo inventario=false desactiva el control de existencias', () => {
  assert.equal(controlaInventario({ inventario: false }), false);
  assert.equal(controlaInventario({ inventario: true }), true);
  assert.equal(controlaInventario({}), true);
  assert.equal(controlaInventario({ inventario: null }), true);
  assert.equal(controlaInventario({ inventario: '' }), true);
});

test('el poblado marca exclusivamente los prefijos y categoría indicados', () => {
  for (const nombre of ['Pza Consulta', 'pza Curación', 'PZA Aplicación']) {
    assert.equal(esProductoSinInventarioInicial({ nombre, categoria: 'Otra' }), true, nombre);
  }

  assert.equal(esProductoSinInventarioInicial({ nombre: 'Consulta', categoria: 'Servicio Médico' }), true);
  assert.equal(esProductoSinInventarioInicial({ nombre: 'PzA Mixto', categoria: 'Otra' }), false);
  assert.equal(esProductoSinInventarioInicial({ nombre: 'Producto Pza', categoria: 'Otra' }), false);
  assert.equal(esProductoSinInventarioInicial({ nombre: 'Consulta', categoria: 'Servicio Medico' }), false);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COLUMNAS_CATALOGO_OBLIGATORIAS,
  COLUMNAS_VENTAS,
  clasificarProducto,
  columnasCatalogoDisponibles,
  construirFilaCatalogo,
  esControlado,
  lineaCsv,
  mesesCalendario,
  requiereReceta,
  resolverFinExclusivo,
} = require('../scripts/exportar-viabilidad');

test('deriva receta y controlado solo de las categorías indicadas', () => {
  assert.equal(requiereReceta('Antibiótico'), true);
  assert.equal(requiereReceta('Controlado'), true);
  assert.equal(requiereReceta('Suplementos'), false);
  assert.equal(esControlado('Psicotrópicos controlados'), true);
  assert.equal(esControlado('Antibiótico'), false);
});

test('clasifica categorías al enum solicitado', () => {
  assert.equal(clasificarProducto('Controlado'), 'CONTROLADO');
  assert.equal(clasificarProducto('Antibiótico'), 'RECETA');
  assert.equal(clasificarProducto('Dermocosmética'), 'DERMOCOSMETICA');
  assert.equal(clasificarProducto('Suplementos y vitaminas'), 'SUPLEMENTO');
  assert.equal(clasificarProducto('Material de curación'), 'MATERIAL_CURACION');
  assert.equal(clasificarProducto('Dispositivos médicos'), 'DISPOSITIVO');
  assert.equal(clasificarProducto('VI / Pastillas refrescantes'), 'OTC');
  assert.equal(clasificarProducto('Recargas'), 'OTRO');
});

test('escapa comas, comillas y saltos de línea en CSV', () => {
  const fila = lineaCsv(['a', 'b'], { a: 'Jarabe, 120 ml', b: 'Dijo "sí"\nsegunda línea' });
  assert.equal(fila, '"Jarabe, 120 ml","Dijo ""sí""\nsegunda línea"\r\n');
});

test('omite del catálogo las columnas opcionales sin información', () => {
  const fila = Object.fromEntries(COLUMNAS_CATALOGO_OBLIGATORIAS.map((columna) => [columna, 0]));
  fila.sku = 'sku-1';
  fila.descripcion = 'Producto';
  fila.clasificacion = 'OTC';
  const columnas = columnasCatalogoDisponibles([fila]);
  assert.deepEqual(columnas, [
    'sku', 'descripcion', 'clasificacion',
    'requiere_receta', 'controlado', 'precio_venta', 'costo_ultimo',
    'existencia_actual', 'unidades_vendidas_12m', 'unidades_vendidas_3m',
  ]);
});

test('construye una fila sin identificadores personales', () => {
  const fila = construirFilaCatalogo({
    _id: '64b000000000000000000002',
    nombre: 'Producto ejemplo',
    categoria: 'Antibiótico',
    precio: 100,
    costo: 60,
    iva: false,
    lotes: [{ cantidad: 2, fechaCaducidad: new Date('2027-01-15T00:00:00.000Z') }],
  }, {
    laboratorios: new Map(),
    existencias: new Map([['64b000000000000000000002', 3]]),
    ventas: new Map([['64b000000000000000000002', { unidades12m: 9, unidades3m: 4 }]]),
  });

  assert.equal(fila.existencia_actual, 5);
  assert.equal(fila.requiere_receta, 1);
  assert.equal(fila.caducidad_mas_proxima, '2027-01-15');
  const prohibidas = ['cliente', 'usuario', 'nombre_cliente', 'telefono', 'correo', 'direccion', 'receta', 'medico'];
  assert.equal(Object.keys(fila).some((columna) => prohibidas.includes(columna)), false);
  assert.deepEqual(COLUMNAS_VENTAS, ['folio', 'fecha', 'sku', 'cantidad', 'precio_unitario', 'importe_linea']);
});

test('G1 genera exactamente doce meses calendario, incluido el mes de corte', () => {
  const fecha = require('luxon').DateTime.fromISO('2026-08-20', { zone: 'America/Mexico_City' });
  const meses = mesesCalendario(fecha);
  assert.equal(meses.length, 12);
  assert.equal(meses[0], '2025-09');
  assert.equal(meses.at(-1), '2026-08');
});

test('la hora de corte queda fija y una fecha explícita incluye el día completo', () => {
  const { DateTime } = require('luxon');
  const instante = DateTime.fromISO('2026-08-20T18:30:00', { zone: 'America/Mexico_City' });
  assert.equal(resolverFinExclusivo(instante, null).toISO(), instante.toISO());
  assert.equal(
    resolverFinExclusivo(instante.startOf('day'), '2026-08-20').toISO(),
    '2026-08-21T00:00:00.000-06:00'
  );
});

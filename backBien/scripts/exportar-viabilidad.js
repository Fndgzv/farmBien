'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const { once } = require('events');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const ZONA = 'America/Mexico_City';
const UTF8_BOM = '\uFEFF';
const MESES_POR_DEFECTO = 12;
const SALIDAS = Object.freeze({
  catalogo: 'A1-catalogo.csv',
  ventas: 'A2-ventas-lineas.csv',
  pyg: 'G1-pyg.csv',
});

const COLUMNAS_CATALOGO_OBLIGATORIAS = Object.freeze([
  'sku',
  'descripcion',
  'clasificacion',
  'requiere_receta',
  'controlado',
  'precio_venta',
  'costo_ultimo',
  'existencia_actual',
  'unidades_vendidas_12m',
  'unidades_vendidas_3m',
]);

const COLUMNAS_CATALOGO_OPCIONALES = Object.freeze([
  'codigo_barras',
  'marca',
  'categoria_interna',
  'tasa_iva',
  'caducidad_mas_proxima',
]);

const COLUMNAS_VENTAS = Object.freeze([
  'folio',
  'fecha',
  'sku',
  'cantidad',
  'precio_unitario',
  'importe_linea',
]);

const COLUMNAS_PYG = Object.freeze([
  'mes',
  'ingresos',
  'costo_de_ventas',
]);

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function incluyeAlguno(texto, patrones) {
  return patrones.some((patron) => texto.includes(patron));
}

function esControlado(categoria) {
  const valor = normalizarTexto(categoria);
  return incluyeAlguno(valor, ['controlado', 'psicotrop', 'estupefac']);
}

function requiereReceta(categoria) {
  const valor = normalizarTexto(categoria);
  return esControlado(valor) || valor.includes('antibiot');
}

function clasificarProducto(categoria) {
  const valor = normalizarTexto(categoria);

  if (esControlado(valor)) return 'CONTROLADO';
  if (incluyeAlguno(valor, ['antibiot', 'receta'])) return 'RECETA';
  if (incluyeAlguno(valor, ['derma', 'dermo', 'cosmet', 'belleza', 'cuidado de la piel'])) {
    return 'DERMOCOSMETICA';
  }
  if (incluyeAlguno(valor, ['suplement', 'vitamin', 'mineral', 'nutric'])) {
    return 'SUPLEMENTO';
  }
  if (incluyeAlguno(valor, [
    'dispositivo', 'equipo medico', 'aparato medico', 'termomet',
    'glucomet', 'baumanomet', 'nebuliz', 'oximet',
  ])) {
    return 'DISPOSITIVO';
  }
  if (incluyeAlguno(valor, [
    'material de curacion', 'material curacion', 'curacion',
    'botiquin', 'venda', 'gasa', 'jeringa', 'algodon',
  ])) {
    return 'MATERIAL_CURACION';
  }
  if (
    incluyeAlguno(valor, ['otc', 'venta libre', 'libre venta'])
    || /^vi(?:\s|\/|$)/.test(valor)
  ) return 'OTC';

  return 'OTRO';
}

function numeroFinito(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function redondear(valor, decimales = 2) {
  const numero = numeroFinito(valor);
  if (numero === null) return '';
  const factor = 10 ** decimales;
  return Math.round((numero + Number.EPSILON) * factor) / factor;
}

function valorCsv(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (!/[",\r\n]/.test(texto)) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

function lineaCsv(columnas, fila) {
  return `${columnas.map((columna) => valorCsv(fila[columna])).join(',')}\r\n`;
}

function tieneDato(valor) {
  return valor !== null && valor !== undefined && valor !== '';
}

function columnasCatalogoDisponibles(filas) {
  const opcionalesDisponibles = COLUMNAS_CATALOGO_OPCIONALES.filter((columna) =>
    filas.some((fila) => tieneDato(fila[columna]))
  );

  const orden = [
    'sku', 'descripcion', 'codigo_barras', 'marca', 'categoria_interna',
    'clasificacion', 'requiere_receta', 'controlado', 'precio_venta',
    'costo_ultimo', 'tasa_iva', 'existencia_actual',
    'caducidad_mas_proxima', 'unidades_vendidas_12m', 'unidades_vendidas_3m',
  ];
  const incluidas = new Set([...COLUMNAS_CATALOGO_OBLIGATORIAS, ...opcionalesDisponibles]);
  return orden.filter((columna) => incluidas.has(columna));
}

function fechaIso(valor) {
  if (!valor) return '';
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toISOString().slice(0, 10);
}

function fechaVentaIso(valor) {
  if (!valor) return '';
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return DateTime.fromJSDate(fecha, { zone: 'utc' }).setZone(ZONA).toISODate();
}

function caducidadMasProxima(lotes) {
  const fechas = (Array.isArray(lotes) ? lotes : [])
    .filter((lote) => (numeroFinito(lote?.cantidad) ?? 0) > 0)
    .map((lote) => lote?.fechaCaducidad)
    .filter(Boolean)
    .map((fecha) => new Date(fecha))
    .filter((fecha) => !Number.isNaN(fecha.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return fechas.length ? fechaIso(fechas[0]) : '';
}

function existenciaAlmacen(lotes) {
  return (Array.isArray(lotes) ? lotes : []).reduce(
    (total, lote) => total + (numeroFinito(lote?.cantidad) ?? 0),
    0
  );
}

function costoUltimo(producto) {
  const costoCompra = numeroFinito(producto?.ultimoCostoCompra);
  const costoCatalogo = numeroFinito(producto?.costo);
  const hayCompraIdentificada = Boolean(producto?.ultimaCompraAt) || (costoCompra ?? 0) > 0;
  return redondear(hayCompraIdentificada ? costoCompra : costoCatalogo);
}

function construirFilaCatalogo(producto, contexto) {
  const id = String(producto?._id ?? '');
  const existenciaFarmacias = contexto.existencias.get(id) ?? 0;
  const venta = contexto.ventas.get(id) ?? { unidades12m: 0, unidades3m: 0 };
  const ivaDisponible = typeof producto?.iva === 'boolean';

  return {
    sku: id,
    descripcion: String(producto?.nombre ?? '').trim(),
    codigo_barras: String(producto?.codigoBarras ?? '').trim(),
    marca: contexto.laboratorios.get(String(producto?.laboratorio ?? '')) ?? '',
    categoria_interna: String(producto?.categoria ?? '').trim(),
    clasificacion: clasificarProducto(producto?.categoria),
    requiere_receta: requiereReceta(producto?.categoria) ? 1 : 0,
    controlado: esControlado(producto?.categoria) ? 1 : 0,
    precio_venta: redondear(producto?.precio),
    costo_ultimo: costoUltimo(producto),
    tasa_iva: ivaDisponible ? (producto.iva ? 0.16 : 0) : '',
    existencia_actual: redondear(existenciaAlmacen(producto?.lotes) + existenciaFarmacias, 6),
    caducidad_mas_proxima: caducidadMasProxima(producto?.lotes),
    unidades_vendidas_12m: redondear(venta.unidades12m, 6),
    unidades_vendidas_3m: redondear(venta.unidades3m, 6),
  };
}

function validarArgumentos(argv) {
  const opciones = {
    meses: MESES_POR_DEFECTO,
    salida: path.resolve(__dirname, '..', '..', 'viabilidad', 'datos'),
    fechaCorte: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--months') opciones.meses = Number(argv[++i]);
    else if (arg === '--output-dir') opciones.salida = path.resolve(argv[++i]);
    else if (arg === '--as-of') opciones.fechaCorte = argv[++i];
    else if (arg === '--help' || arg === '-h') opciones.ayuda = true;
    else throw new Error(`Argumento no reconocido: ${arg}`);
  }

  if (!Number.isInteger(opciones.meses) || opciones.meses < 1 || opciones.meses > 120) {
    throw new Error('--months debe ser un entero entre 1 y 120.');
  }
  return opciones;
}

function resolverFechaCorte(valor) {
  const fecha = valor
    ? DateTime.fromISO(valor, { zone: ZONA })
    : DateTime.now().setZone(ZONA);
  if (!fecha.isValid) throw new Error(`Fecha de corte inválida: ${valor}`);
  return fecha;
}

function resolverFinExclusivo(fechaCorte, valorOriginal) {
  const esFechaSinHora = /^\d{4}-\d{2}-\d{2}$/.test(String(valorOriginal ?? '').trim());
  return esFechaSinHora
    ? fechaCorte.plus({ days: 1 }).startOf('day')
    : fechaCorte;
}

function obtenerUriMongo() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/farmBien';
}

function uriOculta(uri) {
  return String(uri).replace(/\/\/([^@/]+)@/, '//***@');
}

async function escribirAtomico(ruta, contenido) {
  const temporal = `${ruta}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.writeFile(temporal, contenido, 'utf8');
  try {
    await fsp.rename(temporal, ruta);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fsp.rm(ruta, { force: true });
    await fsp.rename(temporal, ruta);
  }
}

async function consultarLaboratorios(db) {
  const filas = await db.collection('laboratorios')
    .find({}, { projection: { laboratorio: 1 } })
    .toArray();
  return new Map(filas.map((fila) => [String(fila._id), String(fila.laboratorio ?? '').trim()]));
}

async function consultarExistencias(db) {
  const farmaciasActivas = await db.collection('farmacias')
    .find({ activo: { $ne: false } }, { projection: { _id: 1 } })
    .toArray();
  const filtro = farmaciasActivas.length
    ? { farmacia: { $in: farmaciasActivas.map((farmacia) => farmacia._id) } }
    : {};
  const filas = await db.collection('inventariofarmacias').aggregate([
    { $match: filtro },
    { $group: { _id: '$producto', existencia: { $sum: { $ifNull: ['$existencia', 0] } } } },
  ], { allowDiskUse: true }).toArray();
  return new Map(filas.map((fila) => [String(fila._id), numeroFinito(fila.existencia) ?? 0]));
}

async function consultarUnidadesVendidas(db, inicio12m, inicio3m, finExclusivo) {
  const filas = await db.collection('ventas').aggregate([
    { $match: { fecha: { $gte: inicio12m, $lt: finExclusivo } } },
    { $unwind: '$productos' },
    {
      $group: {
        _id: '$productos.producto',
        unidades12m: { $sum: { $ifNull: ['$productos.cantidad', 0] } },
        unidades3m: {
          $sum: {
            $cond: [
              { $gte: ['$fecha', inicio3m] },
              { $ifNull: ['$productos.cantidad', 0] },
              0,
            ],
          },
        },
      },
    },
  ], { allowDiskUse: true }).toArray();

  return new Map(filas.map((fila) => [String(fila._id), {
    unidades12m: numeroFinito(fila.unidades12m) ?? 0,
    unidades3m: numeroFinito(fila.unidades3m) ?? 0,
  }]));
}

async function exportarCatalogo(db, ruta, periodo) {
  const [productos, laboratorios, existencias, ventas] = await Promise.all([
    db.collection('productos').find({}, {
      projection: {
        nombre: 1,
        codigoBarras: 1,
        laboratorio: 1,
        categoria: 1,
        iva: 1,
        precio: 1,
        costo: 1,
        ultimoCostoCompra: 1,
        ultimaCompraAt: 1,
        lotes: 1,
      },
    }).sort({ nombre: 1, _id: 1 }).toArray(),
    consultarLaboratorios(db),
    consultarExistencias(db),
    consultarUnidadesVendidas(db, periodo.inicio12m, periodo.inicio3m, periodo.finExclusivo),
  ]);

  const contexto = { laboratorios, existencias, ventas };
  const filas = productos.map((producto) => construirFilaCatalogo(producto, contexto));
  const columnas = columnasCatalogoDisponibles(filas);
  const contenido = UTF8_BOM
    + `${columnas.join(',')}\r\n`
    + filas.map((fila) => lineaCsv(columnas, fila)).join('');
  await escribirAtomico(ruta, contenido);

  const clasificaciones = filas.reduce((acc, fila) => {
    acc[fila.clasificacion] = (acc[fila.clasificacion] || 0) + 1;
    return acc;
  }, {});
  return { filas: filas.length, columnas, clasificaciones };
}

async function escribirConBackpressure(stream, texto) {
  if (stream.write(texto, 'utf8')) return;
  await once(stream, 'drain');
}

async function cerrarStream(stream) {
  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
}

async function exportarVentas(db, ruta, periodo) {
  const temporal = `${ruta}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const stream = fs.createWriteStream(temporal, { encoding: 'utf8' });
  let filas = 0;
  let omitidas = 0;

  try {
    await escribirConBackpressure(stream, UTF8_BOM + `${COLUMNAS_VENTAS.join(',')}\r\n`);
    const cursor = db.collection('ventas').find(
      { fecha: { $gte: periodo.inicio12m, $lt: periodo.finExclusivo } },
      { projection: { folio: 1, fecha: 1, productos: 1 } }
    ).batchSize(500);

    for await (const venta of cursor) {
      const folio = String(venta?.folio ?? '').trim();
      const fecha = fechaVentaIso(venta?.fecha);
      for (const producto of Array.isArray(venta?.productos) ? venta.productos : []) {
        const sku = String(producto?.producto ?? '').trim();
        const cantidad = numeroFinito(producto?.cantidad);
        const precio = numeroFinito(producto?.precio);
        if (!folio || !fecha || !sku || cantidad === null || precio === null) {
          omitidas += 1;
          continue;
        }
        const totalGuardado = numeroFinito(producto?.totalRen);
        const fila = {
          folio,
          fecha,
          sku,
          cantidad: redondear(cantidad, 6),
          precio_unitario: redondear(precio),
          importe_linea: redondear(totalGuardado === null ? cantidad * precio : totalGuardado),
        };
        await escribirConBackpressure(stream, lineaCsv(COLUMNAS_VENTAS, fila));
        filas += 1;
      }
    }

    await cerrarStream(stream);
    try {
      await fsp.rename(temporal, ruta);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
      await fsp.rm(ruta, { force: true });
      await fsp.rename(temporal, ruta);
    }
  } catch (error) {
    stream.destroy();
    await fsp.rm(temporal, { force: true }).catch(() => {});
    throw error;
  }

  return { filas, omitidas, columnas: [...COLUMNAS_VENTAS] };
}

function mesesCalendario(fechaCorte) {
  const primero = fechaCorte.startOf('month').minus({ months: 11 });
  return Array.from({ length: 12 }, (_, indice) => primero.plus({ months: indice }).toFormat('yyyy-MM'));
}

async function exportarPyg(db, ruta, fechaCorte, finExclusivo) {
  const meses = mesesCalendario(fechaCorte);
  const inicio = DateTime.fromFormat(meses[0], 'yyyy-MM', { zone: ZONA }).startOf('month').toUTC().toJSDate();
  const filasDb = await db.collection('ventas').aggregate([
    { $match: { fecha: { $gte: inicio, $lt: finExclusivo } } },
    {
      $project: {
        mes: { $dateToString: { date: '$fecha', format: '%Y-%m', timezone: ZONA } },
        ingresos: { $ifNull: ['$total', 0] },
        costoDeVentas: {
          $sum: {
            $map: {
              input: { $ifNull: ['$productos', []] },
              as: 'linea',
              in: {
                $multiply: [
                  { $ifNull: ['$$linea.cantidad', 0] },
                  { $ifNull: ['$$linea.costo', 0] },
                ],
              },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$mes',
        ingresos: { $sum: '$ingresos' },
        costoDeVentas: { $sum: '$costoDeVentas' },
      },
    },
    { $sort: { _id: 1 } },
  ], { allowDiskUse: true }).toArray();

  const porMes = new Map(filasDb.map((fila) => [fila._id, fila]));
  const filas = meses.map((mes) => ({
    mes,
    ingresos: redondear(porMes.get(mes)?.ingresos ?? 0),
    costo_de_ventas: redondear(porMes.get(mes)?.costoDeVentas ?? 0),
  }));
  const contenido = UTF8_BOM
    + `${COLUMNAS_PYG.join(',')}\r\n`
    + filas.map((fila) => lineaCsv(COLUMNAS_PYG, fila)).join('');
  await escribirAtomico(ruta, contenido);
  return { filas: filas.length, columnas: [...COLUMNAS_PYG] };
}

function imprimirAyuda() {
  console.log([
    'Uso: node scripts/exportar-viabilidad.js [opciones]',
    '',
    'Opciones:',
    '  --months N       Ventana móvil de ventas (12 por defecto).',
    '  --as-of YYYY-MM-DD  Fecha de corte en America/Mexico_City.',
    '  --output-dir RUTA   Destino (viabilidad/datos por defecto).',
  ].join('\n'));
}

async function main(argv = process.argv.slice(2)) {
  const opciones = validarArgumentos(argv);
  if (opciones.ayuda) {
    imprimirAyuda();
    return;
  }

  const fechaCorte = resolverFechaCorte(opciones.fechaCorte);
  const finExclusivoDt = resolverFinExclusivo(fechaCorte, opciones.fechaCorte);
  const fechaReporte = finExclusivoDt.minus({ milliseconds: 1 });
  const inicio12mDt = finExclusivoDt.minus({ months: opciones.meses });
  const inicio3mDt = finExclusivoDt.minus({ months: Math.min(3, opciones.meses) });
  const periodo = {
    inicio12m: inicio12mDt.toUTC().toJSDate(),
    inicio3m: inicio3mDt.toUTC().toJSDate(),
    finExclusivo: finExclusivoDt.toUTC().toJSDate(),
  };

  await fsp.mkdir(opciones.salida, { recursive: true });
  const uri = obtenerUriMongo();
  console.log(`Conectando a MongoDB: ${uriOculta(uri)}`);
  await mongoose.connect(uri, { autoIndex: false });

  try {
    const db = mongoose.connection.db;
    const rutas = {
      catalogo: path.join(opciones.salida, SALIDAS.catalogo),
      ventas: path.join(opciones.salida, SALIDAS.ventas),
      pyg: path.join(opciones.salida, SALIDAS.pyg),
    };

    console.log(`Periodo A1/A2: ${inicio12mDt.toISO()} a ${fechaReporte.toISO()} (${ZONA})`);
    const catalogo = await exportarCatalogo(db, rutas.catalogo, periodo);
    const ventas = await exportarVentas(db, rutas.ventas, periodo);
    const pyg = await exportarPyg(db, rutas.pyg, fechaReporte, periodo.finExclusivo);

    console.log(`A1: ${catalogo.filas} SKU | columnas: ${catalogo.columnas.join(', ')}`);
    console.log(`A1 clasificaciones: ${JSON.stringify(catalogo.clasificaciones)}`);
    console.log(`A2: ${ventas.filas} líneas | omitidas por faltar campo obligatorio: ${ventas.omitidas}`);
    console.log(`G1: ${pyg.filas} meses | columnas: ${pyg.columnas.join(', ')}`);
    console.log(`Archivos UTF-8 con BOM y separador coma en: ${opciones.salida}`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(`ERROR exportando viabilidad: ${error?.message || error}`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = {
  COLUMNAS_CATALOGO_OBLIGATORIAS,
  COLUMNAS_VENTAS,
  COLUMNAS_PYG,
  caducidadMasProxima,
  clasificarProducto,
  columnasCatalogoDisponibles,
  construirFilaCatalogo,
  esControlado,
  lineaCsv,
  mesesCalendario,
  normalizarTexto,
  requiereReceta,
  resolverFinExclusivo,
  valorCsv,
};

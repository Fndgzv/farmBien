/**
 * scripts/copiar-stocks.js
 *
 * Copia stockMax y stockMin desde la farmacia FUENTE a la farmacia DESTINO
 * para los mismos productos, y pone existencia=0 en DESTINO.
 *
 * Uso:
 *   node scripts/copiar-stocks.js --dry-run     # (por defecto) NO escribe
 *   node scripts/copiar-stocks.js --apply       # aplica cambios
 *
 * Requisitos:
 *   - Variable de entorno MONGO_URI o MONGODB_URI apuntando a la BD correcta.
 *   - Modelos: ./models/InventarioFarmacia y ./models/Producto existen en el proyecto.
 */

require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

// ⚠️  Ajusta aquí los ObjectId de tus farmacias
const SRC_ID = "67d73b3a6348d5c1f9b74313"; // farmacia FUENTE
const DST_ID = "6901b8db573b04d722ea9963"; // farmacia DESTINO

// Flags de seguridad
const APPLY = process.argv.includes('--apply');
const DRY   = process.argv.includes('--dry-run') || !APPLY;

// Conexión
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ No se encontró MONGO_URI/MONGODB_URI en variables de entorno.');
  process.exit(1);
}

const Inventario = require('../models/InventarioFarmacia'); // colección: inventariofarmacias
// Si tu modelo de producto lo necesitas, puedes requerirlo también.
// const Producto = require('../models/Producto');

// Helpers
const oid = (s) => mongoose.Types.ObjectId(s);
const src = oid(SRC_ID);
const dst = oid(DST_ID);

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

(async () => {
  console.log('Conectando a MongoDB…');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 20000,
  });
  console.log('✅ Conectado.');

  // 1) Cargar inventario de la FARMACIA FUENTE: { producto -> {stockMax, stockMin} }
  console.log(`Leyendo inventario de la farmacia FUENTE ${SRC_ID}…`);
  const fuenteDocs = await Inventario
    .find({ farmacia: src }, { producto: 1, stockMax: 1, stockMin: 1 })
    .lean();

  console.log(`FUENTE docs: ${fuenteDocs.length}`);

  const fuentePorProducto = new Map();
  for (const d of fuenteDocs) {
    if (!d?.producto) continue;
    // Normaliza valores numéricos; si vienen null/undefined, pon 0
    const smx = toNum(d.stockMax, 0);
    const smn = toNum(d.stockMin, 0);
    fuentePorProducto.set(String(d.producto), { stockMax: smx, stockMin: smn });
  }

  if (fuentePorProducto.size === 0) {
    console.log('⚠️ No hay productos en la FUENTE. Nada que copiar.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 2) Cargar inventario de la FARMACIA DESTINO para hacer match de productos
  console.log(`Leyendo inventario de la farmacia DESTINO ${DST_ID}…`);
  const destinoDocs = await Inventario
    .find({ farmacia: dst }, { _id: 1, producto: 1, stockMax: 1, stockMin: 1, existencia: 1 })
    .lean();

  console.log(`DESTINO docs: ${destinoDocs.length}`);

  // 3) Preparar operaciones: solo donde exista el mismo producto en FUENTE
  const ops = [];
  let coincide = 0;
  for (const d of destinoDocs) {
    const prodId = String(d.producto || '');
    if (!prodId) continue;

    const srcVals = fuentePorProducto.get(prodId);
    if (!srcVals) continue; // no hay homólogo en FUENTE

    coincide++;

    // Solo construimos set con los campos que pediste:
    // existencia = 0, stockMax/Min igual que la FUENTE
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            existencia: 0,
            stockMax: toNum(srcVals.stockMax, 0),
            stockMin: toNum(srcVals.stockMin, 0),
          }
        }
      }
    });
  }

  console.log(`Productos con coincidencia FUENTE→DESTINO: ${coincide}`);
  console.log(`Updates a aplicar: ${ops.length}`);

  if (!ops.length) {
    console.log('No hay nada por actualizar. Saliendo.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Preview
  console.log('Preview de 5 ops:');
  console.log(ops.slice(0, 5));

  if (DRY) {
    console.log('\n🧪 DRY-RUN activado: NO se aplicó ningún cambio.');
    console.log('Ejecuta con --apply para escribir en BD.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  // 4) Aplicar en bulk (rápido y seguro). Si prefieres por lotes, divide el array.
  console.log('✍️ Aplicando cambios (bulkWrite)…');
  try {
    const res = await Inventario.bulkWrite(ops, { ordered: false });
    console.log('✅ bulkWrite OK:');
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('❌ Error en bulkWrite:', e?.message || e);
  } finally {
    await mongoose.disconnect();
  }
})();

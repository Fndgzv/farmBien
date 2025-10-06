/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Producto = require('../models/Producto');

// ===== Cargar .env desde ubicaciones habituales =====
const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];
let loadedEnvPath = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    loadedEnvPath = p;
    break;
  }
}
if (loadedEnvPath) {
  console.log('[INFO] .env cargado desde:', loadedEnvPath);
} else {
  require('dotenv').config(); // fallback (cwd)
  console.warn('[WARN] No se encontró .env en candidatos; usando variables de proceso.');
}

// ===== Helpers =====
function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Args CLI: --commit, --build-indexes, --batch=1000
const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) acc[m[1]] = m[2] !== undefined ? m[2] : true;
  return acc;
}, {});
const DO_COMMIT = Boolean(args.commit);
const BUILD_INDEXES = Boolean(args['build-indexes']);
const BATCH_SIZE = Number(args.batch || 1000);

// ===== Main =====
(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/farmaciaDB';
  if (!process.env.MONGO_URI) {
    console.warn('[WARN] MONGO_URI no definido; usando fallback:', uri);
  }

  const t0 = Date.now();
  await mongoose.connect(uri);
  console.log(
    '[INFO] Conectado:',
    `${mongoose.connection.host}:${mongoose.connection.port}`,
    'DB:',
    mongoose.connection.name
  );

  // (Opcional) construir índices si lo pides por flag
  if (BUILD_INDEXES) {
    console.log('[INFO] Creando índices en nombreNorm / categoriaNorm (background) ...');
    await Promise.allSettled([
      Producto.collection.createIndex({ nombreNorm: 1 }, { background: true }),
      Producto.collection.createIndex({ categoriaNorm: 1 }, { background: true }),
    ]);
    console.log('[OK] Índices creados (o ya existían).');
  }

  const total = await Producto.estimatedDocumentCount();
  console.log(`[INFO] Documentos estimados en productos: ${total}`);

  const cursor = Producto.find({}, {
    _id: 1,
    nombre: 1,
    categoria: 1,
    nombreNorm: 1,
    categoriaNorm: 1
  }).lean().cursor();

  let scanned = 0;
  let toUpdate = 0;
  let updated = 0;
  let batch = [];

  async function flush() {
    if (!batch.length) return;
    if (DO_COMMIT) {
      const res = await Producto.bulkWrite(batch, { ordered: false });
      updated += (res.modifiedCount || 0) + (res.upsertedCount || 0);
    }
    batch = [];
  }

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    scanned++;

    const expectedNombreNorm = norm(doc.nombre);
    const expectedCategoriaNorm = norm(doc.categoria);

    const set = {};
    if (doc.nombreNorm !== expectedNombreNorm) set.nombreNorm = expectedNombreNorm;
    if (doc.categoriaNorm !== expectedCategoriaNorm) set.categoriaNorm = expectedCategoriaNorm;

    if (Object.keys(set).length) {
      toUpdate++;
      batch.push({
        updateOne: { filter: { _id: doc._id }, update: { $set: set } }
      });
      if (batch.length >= BATCH_SIZE) await flush();
    }

    if (scanned % 5000 === 0) {
      console.log(`[PROGRESO] Escaneados: ${scanned}, Por actualizar: ${toUpdate}, Actualizados: ${updated}`);
    }
  }

  await flush();

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('================ RESUMEN ================');
  console.log(`Escaneados:       ${scanned}`);
  console.log(`Por actualizar:   ${toUpdate}`);
  console.log(`Actualizados:     ${DO_COMMIT ? updated : 0} ${DO_COMMIT ? '' : '(dry-run)'}`);
  console.log(`Tiempo:           ${secs}s`);
  console.log('=========================================');

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('[ERROR]', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

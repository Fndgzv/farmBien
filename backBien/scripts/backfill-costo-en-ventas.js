#!/usr/bin/env node
/**
 * Backfill: llena Venta.productos[].costo con Producto.costo
 *
 * Uso:
 *   node scripts/backfill-costo-en-ventas.js
 *   node scripts/backfill-costo-en-ventas.js --dry-run
 *   node scripts/backfill-costo-en-ventas.js --batch=500
 *   node scripts/backfill-costo-en-ventas.js --limit=2000
 *   node scripts/backfill-costo-en-ventas.js --uri="mongodb://localhost:27017/miDB"
 *
 * Requisitos:
 * - .env con MONGO_URI o pasar --uri
 * - Modelos: backBien/models/Venta.js, backBien/models/Producto.js
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// ---- CLI args simples ----
const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (!m) return acc;
  const k = m[1];
  const v = m[2] === undefined ? true : m[2];
  acc[k] = v;
  return acc;
}, {});

// ---- Carga .env del root del proyecto ----
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  // intenta uno arriba (por si scripts/ está anidado distinto)
  const envPath2 = path.resolve(rootDir, '.env');
  if (fs.existsSync(envPath2)) require('dotenv').config({ path: envPath2 });
}

const MONGO_URI = args.uri || process.env.MONGO_URI || process.env.MONGODB_URL || process.env.DB_URI;
if (!MONGO_URI) {
  console.error('❌ No se encontró MONGO_URI. Pásalo con --uri o define en .env');
  process.exit(1);
}

const DRY_RUN = !!args['dry-run'];
const BATCH = parseInt(args.batch || '500', 10);
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const SKIP = args.skip ? parseInt(args.skip, 10) : 0;

// ---- Modelos ----
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');

(async function main() {
  const started = Date.now();
  console.log(`🔗 Conectando a MongoDB...`);
  await mongoose.connect(MONGO_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 20000,
  });
  console.log(`✅ Conectado`);

  // Filtra ventas donde al menos un renglón tiene costo faltante/null/0
  const missingFilter = {
    productos: {
      $elemMatch: {
        $or: [
          { costo: { $exists: false } },
          { costo: null },
          { costo: 0 },
        ],
      },
    },
  };

  const totalToProcess = await Venta.countDocuments(missingFilter);
  console.log(`📊 Ventas a revisar: ${totalToProcess}${LIMIT ? ` (limit ${LIMIT})` : ''}`);
  if (totalToProcess === 0) {
    console.log('Nada que hacer. 👌');
    await mongoose.disconnect();
    return;
  }

  // const cursor = Venta.find(missingFilter).lean().cursor();
  // let q = Venta.find(missingFilter).sort({ _id: 1 }); // o { fecha: 1 }
  let q = Venta.find(missingFilter);
if (SKIP) q = q.skip(SKIP);
if (LIMIT) q = q.limit(LIMIT);
const cursor = q.lean().cursor();

console.log(`📊 Ventas a revisar: ${totalToProcess}${LIMIT ? ` (limit ${LIMIT})` : ''}${SKIP ? `, skip ${SKIP}` : ''}`);

  let processed = 0;
  let updatedDocs = 0;
  let updatedRows = 0;
  let skippedDocs = 0;
  let ops = [];

  for await (const venta of cursor) {
    processed++;
    // if (LIMIT && processed > LIMIT) break;

    const prodIds = [...new Set(
      (venta.productos || [])
        .map(p => p?.producto)
        .filter(Boolean)
        .map(id => id.toString())
    )];

    if (prodIds.length === 0) {
      skippedDocs++;
      continue;
    }

    // Trae costos de productos involucrados en esta venta
    const prods = await Producto.find({ _id: { $in: prodIds } })
      .select('_id costo')
      .lean();

    const costMap = new Map(prods.map(p => [p._id.toString(), Number(p.costo) || 0]));

    let changed = false;
    let changedCountForThisDoc = 0;

    const nuevos = (venta.productos || []).map(item => {
      const current = item?.costo;
      if (current === undefined || current === null || current === 0) {
        const pid = item?.producto?.toString?.() || String(item?.producto || '');
        const costo = costMap.get(pid);
        if (typeof costo === 'number' && !Number.isNaN(costo) && costo > 0) {
          changed = true;
          changedCountForThisDoc++;
          return { ...item, costo };
        } else {
          // si no hay costo del producto, deja tal cual
          return item;
        }
      }
      return item;
    });

    if (changed) {
      updatedRows += changedCountForThisDoc;
      if (DRY_RUN) {
        // Solo loguea en dry-run
        console.log(`DRY-RUN: Venta ${venta._id} -> ${changedCountForThisDoc} renglones actualizados`);
      } else {
        ops.push({
          updateOne: {
            filter: { _id: venta._id },
            update: { $set: { productos: nuevos } },
          },
        });
      }
    } else {
      skippedDocs++;
    }

    if (!DRY_RUN && ops.length >= BATCH) {
      const res = await Venta.bulkWrite(ops, { ordered: false });
      updatedDocs += (res.modifiedCount || 0);
      console.log(`💾 Bulk guardado: ${res.modifiedCount || 0} ventas`);
      ops = [];
    }
  }

  if (!DRY_RUN && ops.length) {
    const res = await Venta.bulkWrite(ops, { ordered: false });
    updatedDocs += (res.modifiedCount || 0);
    console.log(`💾 Bulk final: ${res.modifiedCount || 0} ventas`);
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log('——— Resumen ———');
  console.log(`Procesadas: ${processed}${LIMIT ? ` (limit ${LIMIT})` : ''}`);
  console.log(`Ventas modificadas: ${updatedDocs}`);
  console.log(`Renglones actualizados: ${updatedRows}`);
  console.log(`Ventas sin cambios: ${skippedDocs}`);
  console.log(`Tiempo: ${secs}s`);
  await mongoose.disconnect();
  console.log('✅ Listo. Bye.');
})().catch(async (err) => {
  console.error('❌ Error crítico:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

/**
 * RESET DE LOTES DEL ALMACÉN
 *
 * Uso:
 *   node tools/reset-almacen-lotes.js --dry-run
 *   node tools/reset-almacen-lotes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Producto = require('../models/Producto');
const InventarioFisico = require('../models/InventarioFisico');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

const DRY_RUN = process.argv.includes('--dry-run');

const FECHA_CADUCIDAD = new Date('2026-12-31T00:00:00.000Z');
const LOTE = 'LOTE-01';

async function run() {
  console.log('🔌 Conectando a MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado');

  // -------------------------------
  // PASO 1️⃣ Borrar TODOS los lotes
  // -------------------------------
  if (DRY_RUN) {
    const total = await Producto.countDocuments({ lotes: { $exists: true, $ne: [] } });
    console.log(`🧪 DRY-RUN: Se borrarían lotes de ${total} productos`);
  } else {
    const res = await Producto.updateMany({}, { $set: { lotes: [] } });
    console.log(`🧹 Lotes borrados en ${res.modifiedCount} productos`);
  }

  // -------------------------------
  // PASO 2️⃣ Leer inventario físico del almacén
  // -------------------------------
  const inventarios = await InventarioFisico.find({
    farmaNombre: 'Almacén'
  }).lean();

  console.log(`📦 Inventarios físicos del almacén encontrados: ${inventarios.length}`);

  let afectados = 0;

  // -------------------------------
  // PASO 3️⃣ Re-crear lotes
  // -------------------------------
  for (const inv of inventarios) {
    if (!inv.producto) continue;
    if (Number(inv.existenciaFisica) <= 0) continue;

    afectados++;

    if (DRY_RUN) {
      console.log(
        `🧪 DRY-RUN Producto ${inv.producto} -> ${inv.existenciaFisica}`
      );
      continue;
    }

    await Producto.updateOne(
      { _id: inv.producto },
      {
        $set: {
          lotes: [{
            lote: LOTE,
            fechaCaducidad: FECHA_CADUCIDAD,
            cantidad: Number(inv.existenciaFisica)
          }]
        }
      }
    );
  }

  console.log(`✅ Productos del almacén actualizados: ${afectados}`);
  console.log('🎯 Proceso terminado');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error en el script:', err);
  process.exit(1);
});

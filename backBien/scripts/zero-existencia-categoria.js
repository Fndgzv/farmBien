// tools/zero-antibioticos-productos.js
// Uso:
//   node tools/zero-antibioticos-productos.js --dry-run   (solo muestra lo que haría)
//   node tools/zero-antibioticos-productos.js             (aplica los cambios)
//
// Requiere variable MONGO_URI o MONGODB_URI en .env. Si no existe, usa localhost.

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

const DRY_RUN = process.argv.includes('--dry-run');

// Modelo mínimo ad-hoc (no rompe tu esquema real)
const ProductoSchema = new mongoose.Schema(
  {
    nombre: String,
    categoria: String,
    existencia: Number,
    lotes: [
      {
        lote: String,
        fechaCaducidad: Date,
        cantidad: Number,
      },
    ],
  },
  { collection: 'productos', strict: false }
);
const Producto = mongoose.model('Producto', ProductoSchema);

(async () => {
  console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
  await mongoose.connect(MONGO, { autoIndex: false });

  try {
    // Filtro exacto: SOLO categoría "a elegir
    const filtro = { categoria: /^Antibió/i };

    // Nuevo estado deseado
    const nuevoLote = {
      lote: 'único',
      fechaCaducidad: new Date('2027-06-30T00:00:00.000Z'),
      cantidad: 0,
    };
    const setObj = {
      existencia: 0,
      lotes: [nuevoLote],
    };

    // Conteo previo
    const totalObjetivo = await Producto.countDocuments(filtro);
    console.log(`> Documentos en categoría "Antibió": ${totalObjetivo}`);

    // Muestra previa (debug)
    const muestraAntes = await Producto.find(filtro)
      .select({ nombre: 1, existencia: 1, lotes: 1 })
      .limit(5)
      .lean();

    if (muestraAntes.length) {
      console.log('> Ejemplos (máx 5) ANTES del cambio:');
      for (const doc of muestraAntes) {
        console.log({
          _id: doc._id,
          nombre: doc.nombre,
          existencia: doc.existencia,
          lotesPrimer: doc.lotes?.[0] ?? null,
          lotesCount: Array.isArray(doc.lotes) ? doc.lotes.length : 0,
        });
      }
    } else {
      console.log('> No hay documentos que coincidan con el filtro.');
    }

    if (DRY_RUN) {
      console.log('\n[DRY-RUN] No se aplicaron cambios. Así quedaría el $set:\n', { $set: setObj });
      return;
    }

    // Aplicar actualización masiva
    const r = await Producto.updateMany(filtro, { $set: setObj });
    console.log(`\n> updateMany: matched=${r.matchedCount ?? r.n}, modified=${r.modifiedCount ?? r.nModified}`);

    // Verificación rápida post-cambio
    const muestraDespues = await Producto.find(filtro)
      .select({ nombre: 1, existencia: 1, lotes: 1 })
      .limit(5)
      .lean();

    if (muestraDespues.length) {
      console.log('> Ejemplos (máx 5) DESPUÉS del cambio:');
      for (const doc of muestraDespues) {
        console.log({
          _id: doc._id,
          nombre: doc.nombre,
          existencia: doc.existencia,
          lotesPrimer: doc.lotes?.[0] ?? null,
          lotesCount: Array.isArray(doc.lotes) ? doc.lotes.length : 0,
        });
      }
    }

    console.log('\n✅ Terminado.');
  } catch (err) {
    console.error('❌ Error en el script:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();

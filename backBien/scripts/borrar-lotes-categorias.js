// scripts/borrar-lotes-categorias.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

const ProductoSchema = new mongoose.Schema(
  {
    nombre: String,
    categoria: String,
    lotes: Array,
    existencia: Number,
  },
  { collection: 'productos', strict: false }
);
const Producto = mongoose.model('Producto', ProductoSchema);

(async () => {
  console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
  await mongoose.connect(MONGO, { autoIndex: false });

  try {
    const filtro = {
      $or: [
        { categoria: 'Antibiótico' },
        { categoria: 'Antibiotico' },
        { categoria: 'Suplementos' },
        { categoria: 'SUPLEMENTOS' },
        { categoria: 'IV' },
        { categoria: 'VI' },
        { categoria: /^VI / } // empieza con VI + espacio
      ]
    };

    const productos = await Producto.find(filtro).select('_id nombre categoria').lean();
    console.log(`🎯 Productos encontrados: ${productos.length}`);

    if (productos.length === 0) {
      console.log('⚠️  No hay productos que coincidan con el filtro.');
      return;
    }

    const ids = productos.map(p => p._id);

    const r = await Producto.updateMany(
      { _id: { $in: ids } },
      { $set: { existencia: 0, lotes: [] } }
    );

    console.log(`✅ Productos actualizados: ${r.modifiedCount ?? r.nModified}`);
  } catch (err) {
    console.error('❌ ERROR:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();

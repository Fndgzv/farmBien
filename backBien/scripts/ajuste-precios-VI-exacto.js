// scripts/ajuste-precios-VI-exacto.js

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

const idFarmacia = new mongoose.Types.ObjectId('6901b8db573b04d722ea9963');

const InventarioSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Types.ObjectId, ref: 'productos' },
    farmacia: mongoose.Types.ObjectId,
    precioVenta: Number,
  },
  { collection: 'inventariofarmacias', strict: false }
);

const ProductoSchema = new mongoose.Schema(
  {
    nombre: String,
    categoria: String,
  },
  { collection: 'productos', strict: false }
);

const Inventario = mongoose.model('InventarioFarmacia', InventarioSchema);
const Producto = mongoose.model('Producto', ProductoSchema);

(async () => {
  console.log('> Conectando a MongoDB:', MONGO.replace(/\/\/.*@/, '//***@'));
  await mongoose.connect(MONGO, { autoIndex: false });

  try {
    const inventarios = await Inventario.find({ farmacia: idFarmacia }).lean();

    let total = 0;

    for (const inv of inventarios) {
      const prod = await Producto.findById(inv.producto).lean();
      if (!prod || !prod.categoria) continue;

      const cat = prod.categoria.trim();

      if (cat === 'VI') {
        const anterior = inv.precioVenta || 0;
        const nuevo = Math.round(anterior * 1.10);

        await Inventario.updateOne(
          { _id: inv._id },
          { $set: { precioVenta: nuevo } }
        );

        console.log(`✅ ${prod.nombre} | ${cat} | $${anterior} → $${nuevo}`);
        total++;
      }
    }

    console.log(`\n🎯 TOTAL ACTUALIZADOS CON CATEGORÍA EXACTA "VI": ${total}`);
  } catch (err) {
    console.error('❌ ERROR:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();

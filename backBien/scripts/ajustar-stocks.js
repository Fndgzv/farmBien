// scripts/ajustar-stocks.js
// ---------------------------------------------------------
// Actualiza stockMin y stockMax en inventariofarmacias
// Solo para la farmacia indicada, donde stockMax=3 y stockMin=2
// Nuevos valores: stockMax=1, stockMin=0
// ---------------------------------------------------------

require('dotenv').config();
const mongoose = require('mongoose');

// ✅ Conexión a tu BD local o al cluster Atlas
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017/farmaciaDB';

// ✅ Modelo ad-hoc para la colección inventariofarmacias
const InventarioFarmacia = mongoose.model(
  'InventarioFarmacia',
  new mongoose.Schema(
    {
      farmacia: mongoose.Schema.Types.ObjectId,
      producto: mongoose.Schema.Types.ObjectId,
      existencia: Number,
      stockMax: Number,
      stockMin: Number,
      precioVenta: Number,
    },
    { collection: 'inventariofarmacias' }
  )
);

(async () => {
  try {
    console.log('Conectando a MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado correctamente.\n');

    const farmaciaId = new mongoose.Types.ObjectId('6901b8db573b04d722ea9963');

    // Filtro exacto
    const filtro = { farmacia: farmaciaId, stockMax: 3, stockMin: 2 };

    // Ver cuántos hay antes
    const countAntes = await InventarioFarmacia.countDocuments(filtro);
    console.log(`🔎 Documentos que cumplen condición: ${countAntes}`);

    if (countAntes === 0) {
      console.log('⚠️  No se encontraron documentos para actualizar.');
    } else {
      const resultado = await InventarioFarmacia.updateMany(filtro, {
        $set: { stockMax: 1, stockMin: 0 },
      });

      console.log(`✅ Actualizados ${resultado.modifiedCount} documentos.`);
    }
  } catch (err) {
    console.error('❌ Error al ejecutar el script:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔚 Conexión cerrada.');
  }
})();

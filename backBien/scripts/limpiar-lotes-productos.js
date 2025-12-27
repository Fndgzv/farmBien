/**
 * ⚠️ SCRIPT PELIGROSO – USAR SOLO CUANDO SEA NECESARIO
 * Limpia TODOS los lotes de TODOS los productos
 * Resultado: existencia = 0 para todos
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Producto = require('../models/Producto');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://127.0.0.1:27017/farmBien';

async function limpiarLotes() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGO_URI, {
      autoIndex: false,
    });

    console.log('✅ Conectado');

    console.log('🧹 Limpiando lotes de TODOS los productos...');

    const result = await Producto.updateMany(
      {},                // todos los documentos
      { $set: { lotes: [] } }
    );

    console.log('🎯 Proceso terminado');
    console.log('📦 Productos modificados:', result.modifiedCount);

  } catch (err) {
    console.error('❌ Error al limpiar lotes:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Conexión cerrada');
    process.exit(0);
  }
}

limpiarLotes();

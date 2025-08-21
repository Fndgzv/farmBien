// scripts/limpiarInventarioFarmacia.js
require('dotenv').config();
const mongoose = require('mongoose');
const InventarioFarmacia = require('../models/InventarioFarmacia');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const farmaciaId = '67d73b3a6348d5c1f9b74313';
  const res = await InventarioFarmacia.deleteMany({ farmacia: farmaciaId });
  console.log(`✅ Documentos borrados: ${res.deletedCount}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});

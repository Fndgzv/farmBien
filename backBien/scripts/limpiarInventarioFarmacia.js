// scripts/limpiarInventarioFarmacia.js
require('dotenv').config();
const mongoose = require('mongoose');
const InventarioFarmacia = require('../models/InventarioFarmacia');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const farmaciaId = '682637c3574950176d1d9c7c';
  const res = await InventarioFarmacia.deleteMany({ farmacia: farmaciaId });
  console.log(`✅ Documentos borrados: ${res.deletedCount}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});

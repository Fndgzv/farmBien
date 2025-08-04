// scripts/actualizarStockInventario.js
require('dotenv').config();
const mongoose = require('mongoose');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  // Configuración por farmacia
  const ajustes = [
    {
      farmaciaId: '67d73b3a6348d5c1f9b74313',
      stockMax:   20,
      stockMin:   8
    },
    {
      farmaciaId: '682637c3574950176d1d9c7c',
      stockMax:   10,
      stockMin:   4
    }
  ];

  for (const { farmaciaId, stockMax, stockMin } of ajustes) {
    console.log(`\nActualizando inventario para farmacia ${farmaciaId}…`);

    // 1) Cargamos todos los inventarios de esa farmacia, con la categoría del producto
    const inventarios = await InventarioFarmacia
      .find({ farmacia: farmaciaId })
      .populate('producto', 'categoria');

    let cont = 0;
    for (const inv of inventarios) {
      // 2) Si es recarga, stock = 0
      if (inv.producto.categoria === 'Recargas') {
        inv.stockMax = 0;
        inv.stockMin = 0;
      } else {
        // 3) Si no es recarga, usamos los valores definidos
        inv.stockMax = stockMax;
        inv.stockMin = stockMin;
      }
      await inv.save();
      cont++;
    }

    console.log(`  → Procesados ${cont} registros para farmacia ${farmaciaId}.`);
  }

  await mongoose.disconnect();
  console.log('\n¡Listo! Inventarios actualizados.\n');
}

run().catch(err => {
  console.error('Error al actualizar inventarios:', err);
  mongoose.disconnect();
  process.exit(1);
});

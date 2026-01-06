// scripts/exportar-naucalpan-productos.js
require('dotenv').config();
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const fs = require('fs');

// Configuración de conexión
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/farmBien';
const ID_NAUCALPAN = new mongoose.Types.ObjectId('6901b8db573b04d722ea9963');

// Conexión y ejecución
(async () => {
  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(MONGO);

    const db = mongoose.connection.db;

    const data = await db.collection('inventariofarmacias').aggregate([
      { $match: { farmacia: ID_NAUCALPAN } },
      {
        $lookup: {
          from: 'productos',
          localField: 'producto',
          foreignField: '_id',
          as: 'producto'
        }
      },
      { $unwind: '$producto' },
      {
        $lookup: {
          from: 'farmacias',
          localField: 'farmacia',
          foreignField: '_id',
          as: 'farmacia'
        }
      },
      { $unwind: '$farmacia' },
      {
        $project: {
          nombre: '$producto.nombre',
          codigoBarras: '$producto.codigoBarras',
          costo: '$producto.costo',
          categoria: '$producto.categoria',
          existencia: 1,
          precioVenta: 1,
          ubicacionFarmacia: 1,
          nombreFarmacia: '$farmacia.nombre'
        }
      }
    ]).toArray();

    if (!data.length) {
      console.log('⚠️ No se encontraron datos.');
      return;
    }

    // Crear libro Excel
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Inventario Naucalpan');

    const nombreArchivo = 'inventario_naucalpan.xlsx';
    xlsx.writeFile(wb, nombreArchivo);

    console.log(`✅ Exportación completada: ${nombreArchivo}`);
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await mongoose.disconnect();
  }
})();

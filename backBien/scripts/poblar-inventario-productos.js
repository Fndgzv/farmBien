/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { crearReglasSinInventario } = require('../utils/controlInventario');

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;
  require('dotenv').config({ path: envPath });
  break;
}

const commit = process.argv.includes('--commit');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

// Se respetan exclusivamente los tres prefijos indicados y la categoría exacta.
const reglasSinInventario = crearReglasSinInventario();
const filtroSinInventario = { $or: reglasSinInventario };
const filtroConInventario = { $nor: reglasSinInventario };

async function main() {
  if (!uri) {
    throw new Error('Falta MONGO_URI o MONGODB_URI; no se modificó ninguna base de datos.');
  }

  await mongoose.connect(uri, { autoIndex: false });
  const productos = mongoose.connection.collection('productos');

  const [total, debenSerFalse, debenSerTrue, pendientesFalse, pendientesTrue] = await Promise.all([
    productos.countDocuments({}),
    productos.countDocuments(filtroSinInventario),
    productos.countDocuments(filtroConInventario),
    productos.countDocuments({ $and: [filtroSinInventario, { inventario: { $ne: false } }] }),
    productos.countDocuments({ $and: [filtroConInventario, { inventario: { $ne: true } }] }),
  ]);

  console.log(`Base de datos: ${mongoose.connection.name}`);
  console.log(`Productos totales: ${total}`);
  console.log(`Deben quedar con inventario=false: ${debenSerFalse} (pendientes: ${pendientesFalse})`);
  console.log(`Deben quedar con inventario=true: ${debenSerTrue} (pendientes: ${pendientesTrue})`);

  if (!commit) {
    console.log('Simulación terminada. Ejecuta de nuevo con --commit para aplicar el poblado.');
    return;
  }

  const resultado = await productos.bulkWrite([
    {
      updateMany: {
        filter: filtroSinInventario,
        update: { $set: { inventario: false } },
      },
    },
    {
      updateMany: {
        filter: filtroConInventario,
        update: { $set: { inventario: true } },
      },
    },
  ], { ordered: true });

  const [incorrectosFalse, incorrectosTrue] = await Promise.all([
    productos.countDocuments({ $and: [filtroSinInventario, { inventario: { $ne: false } }] }),
    productos.countDocuments({ $and: [filtroConInventario, { inventario: { $ne: true } }] }),
  ]);

  console.log(`Documentos modificados: ${resultado.modifiedCount || 0}`);
  console.log(`Verificación inventario=false incorrecta: ${incorrectosFalse}`);
  console.log(`Verificación inventario=true incorrecta: ${incorrectosTrue}`);

  if (incorrectosFalse || incorrectosTrue) {
    throw new Error('La verificación posterior al poblado encontró documentos incorrectos.');
  }
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

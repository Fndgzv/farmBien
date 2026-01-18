/* backBien/scripts/poblar_ingreActivo.js */
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/farmBien";

// Normalización igual a tu modelo
function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  console.log("Conectando a MongoDB...");
  await mongoose.connect(MONGO, { autoIndex: false });
  console.log("Conectado:", MONGO);

  const Producto = require("../models/Producto");

  // Condición de categoría:
  // - Antibiótico (exacto)
  // - IV (exacto o empieza con "IV ")
  // - VI (exacto o empieza con "VI ")
  const filtroCategoria = {
    $or: [
      { categoria: "Antibiótico" },
      { categoria: /^IV( |$)/ },
      { categoria: /^VI( |$)/ },
    ],
  };

  // Solo poblar si ingreActivo no existe o está vacío
  const filtro = {
    ...filtroCategoria,
    $or: [
      { ingreActivo: { $exists: false } },
      { ingreActivo: null },
      { ingreActivo: "" },
    ],
  };

  const total = await Producto.countDocuments(filtro);
  console.log("Productos a poblar:", total);

  if (!total) {
    console.log("No hay nada que actualizar. Fin.");
    await mongoose.disconnect();
    return;
  }

  const cursor = Producto.find(filtro, { _id: 1, nombre: 1 })
    .lean()
    .cursor();

  const BATCH = 1000;
  let ops = [];
  let procesados = 0;
  let actualizados = 0;

  for await (const doc of cursor) {
    procesados++;

    const ingreActivo = doc.nombre ?? "";
    const ingreActivoNorm = norm(ingreActivo);

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            ingreActivo,
            ingreActivoNorm,
          },
        },
      },
    });

    if (ops.length >= BATCH) {
      const res = await Producto.bulkWrite(ops, { ordered: false });
      actualizados += res.modifiedCount || 0;
      console.log(`Batch OK. Procesados: ${procesados} | Modificados: ${actualizados}`);
      ops = [];
    }
  }

  if (ops.length) {
    const res = await Producto.bulkWrite(ops, { ordered: false });
    actualizados += res.modifiedCount || 0;
  }

  console.log("====================================");
  console.log("Procesados:", procesados);
  console.log("Modificados:", actualizados);
  console.log("Listo.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("ERROR:", err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

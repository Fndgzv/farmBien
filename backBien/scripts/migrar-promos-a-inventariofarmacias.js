/**
 * Script: migrar-promos-a-inventariofarmacias.js
 * - Naucalpan: copia promoLunes + descuentoINAPAM a InventarioFarmacia
 *              SOLO para productos que tengan promoLunes o descuentoINAPAM en Producto
 * - Tlazala: copia TODAS las promociones desde Producto hacia InventarioFarmacia
 *
 * Ejecutar:
 *   node scripts/migrar-promos-a-inventariofarmacias.js
 */

const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Producto = require("../models/Producto");
const InventarioFarmacia = require("../models/InventarioFarmacia");

const NAUCALPAN_ID = "6901b8db573b04d722ea9963";
const TLAZALA_ID = "67d73b3a6348d5c1f9b74313";

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/farmBien";

// ===== Helpers =====
function hasAnyValue(obj) {
  if (!obj || typeof obj !== "object") return false;
  return Object.values(obj).some((v) => v !== undefined && v !== null);
}

function normalizePromoObj(promo) {
  if (!promo) return null;
  const out = {
    porcentaje: promo.porcentaje ?? null,
    inicio: promo.inicio ?? null,
    fin: promo.fin ?? null,
    monedero: promo.monedero ?? null,
  };
  return hasAnyValue(out) ? out : null;
}

async function bulkWriteInChunks(model, ops, chunkSize = 1000) {
  let totalModified = 0;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const slice = ops.slice(i, i + chunkSize);
    if (slice.length === 0) continue;
    const res = await model.bulkWrite(slice, { ordered: false });
    totalModified += res.modifiedCount || 0;
    console.log(
      `   - bulk ${Math.floor(i / chunkSize) + 1}: matched=${res.matchedCount || 0}, modified=${res.modifiedCount || 0}`
    );
  }
  return totalModified;
}

async function migrarNaucalpanLunesMasInapam() {
  console.log("\n=== 1) NAUCALPAN: copiar promoLunes + descuentoINAPAM ===");

  // Productos que tengan promoLunes "real" O descuentoINAPAM=true
  const productos = await Producto.find(
    {
      $or: [
        { descuentoINAPAM: true },
        { "promoLunes.porcentaje": { $ne: null } },
        { "promoLunes.inicio": { $ne: null } },
        { "promoLunes.fin": { $ne: null } },
        { "promoLunes.monedero": { $ne: null } },
      ],
    },
    { _id: 1, promoLunes: 1, descuentoINAPAM: 1 }
  ).lean();

  console.log(`Productos con promoLunes o INAPAM en "productos": ${productos.length}`);

  if (productos.length === 0) {
    console.log("No hay nada que migrar para Naucalpan.");
    return;
  }

  const ops = [];
  for (const p of productos) {
    const promoLunes = normalizePromoObj(p.promoLunes);

    // En Naucalpan solo seteamos:
    // - promoLunes (si existe)
    // - descuentoINAPAM (true/false según producto)
    const set = {
      descuentoINAPAM: !!p.descuentoINAPAM,
    };

    if (promoLunes) set.promoLunes = promoLunes;

    ops.push({
      updateMany: {
        filter: { farmacia: NAUCALPAN_ID, producto: p._id },
        update: { $set: set },
      },
    });
  }

  console.log(`Operaciones a ejecutar (updateMany): ${ops.length}`);
  await bulkWriteInChunks(InventarioFarmacia, ops, 1000);

  console.log("✅ Naucalpan listo.");
}

async function migrarTlazalaTodasLasPromos() {
  console.log("\n=== 2) TLAZALA: copiar TODAS las promociones ===");
  console.log(`Tlazala ID: ${TLAZALA_ID}`);

  const productos = await Producto.find(
    {},
    {
      _id: 1,
      promoLunes: 1,
      promoMartes: 1,
      promoMiercoles: 1,
      promoJueves: 1,
      promoViernes: 1,
      promoSabado: 1,
      promoDomingo: 1,
      promoCantidadRequerida: 1,
      inicioPromoCantidad: 1,
      finPromoCantidad: 1,
      descuentoINAPAM: 1,
      promoDeTemporada: 1,
    }
  ).lean();

  console.log(`Productos a procesar para Tlazala: ${productos.length}`);

  const ops = [];
  for (const p of productos) {
    const set = {
      promoLunes: normalizePromoObj(p.promoLunes),
      promoMartes: normalizePromoObj(p.promoMartes),
      promoMiercoles: normalizePromoObj(p.promoMiercoles),
      promoJueves: normalizePromoObj(p.promoJueves),
      promoViernes: normalizePromoObj(p.promoViernes),
      promoSabado: normalizePromoObj(p.promoSabado),
      promoDomingo: normalizePromoObj(p.promoDomingo),

      promoCantidadRequerida: p.promoCantidadRequerida ?? null,
      inicioPromoCantidad: p.inicioPromoCantidad ?? null,
      finPromoCantidad: p.finPromoCantidad ?? null,

      descuentoINAPAM: !!p.descuentoINAPAM,

      promoDeTemporada: normalizePromoObj(p.promoDeTemporada),
    };

    ops.push({
      updateMany: {
        filter: { farmacia: TLAZALA_ID, producto: p._id },
        update: { $set: set },
      },
    });
  }

  console.log(`Operaciones a ejecutar (updateMany): ${ops.length}`);
  await bulkWriteInChunks(InventarioFarmacia, ops, 1000);

  console.log("✅ Tlazala listo.");
}

// ===== MAIN =====
(async () => {
  try {
    console.log("Conectando a MongoDB:", MONGO);

    await mongoose.connect(MONGO, { autoIndex: false });
    console.log("✅ Conectado.\n");

    await migrarNaucalpanLunesMasInapam();
    await migrarTlazalaTodasLasPromos();

    console.log("\n🎉 Migración terminada.");
  } catch (err) {
    console.error("❌ Error en migración:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();

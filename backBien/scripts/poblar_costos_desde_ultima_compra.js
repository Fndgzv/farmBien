/* backBien/scripts/poblar_costos_desde_ultima_compra.js */
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/farmBien";

async function main() {
  console.log("Conectando a MongoDB...");
  await mongoose.connect(MONGO, { autoIndex: false });
  console.log("Conectado:", MONGO);

  const Producto = require("../models/Producto");
  const Compra = require("../models/Compra");

  // Guardaremos el “último dato” por producto (la compra más reciente)
  // recorriendo compras de más nueva a más vieja.
  const visto = new Set(); // productoId ya resuelto
  const BATCH_UPDATES = 1000;

  let ops = [];
  let comprasProcesadas = 0;
  let itemsProcesados = 0;
  let productosMarcados = 0;
  let productosActualizados = 0;

  // Compras de más reciente a más antigua
  const cursor = Compra.find(
    {},
    { proveedor: 1, fecha: 1, productos: 1 } // proyección mínima
  )
    .sort({ fecha: -1, _id: -1 })
    .lean()
    .cursor();

  console.log("Leyendo compras (más reciente → más antigua) ...");

  for await (const compra of cursor) {
    comprasProcesadas++;

    const proveedorId = compra.proveedor || null;
    const compraFecha = compra.fecha || null;
    const compraId = compra._id;

    const items = Array.isArray(compra.productos) ? compra.productos : [];
    for (const item of items) {
      itemsProcesados++;

      const prodId = item?.producto?.toString?.() ? item.producto.toString() : null;
      if (!prodId) continue;

      // Si ya resolvimos este producto con una compra más reciente, lo saltamos
      if (visto.has(prodId)) continue;

      // costoUnitario es el valor fuente
      const costoUnitario = Number(item?.costoUnitario ?? NaN);
      if (!Number.isFinite(costoUnitario)) {
        // lo marcamos como visto para no intentarlo con compras más viejas?
        // NO: mejor permitir que una compra anterior sí tenga costoUnitario válido.
        continue;
      }

      visto.add(prodId);
      productosMarcados++;

      ops.push({
        updateOne: {
          filter: { _id: prodId },
          update: {
            $set: {
              costo: costoUnitario,
              ultimoProveedorId: proveedorId,
              ultimaCompraAt: compraFecha,
              ultimaCompraId: compraId,
              ultimoCostoCompra: costoUnitario,
            },
          },
        },
      });

      if (ops.length >= BATCH_UPDATES) {
        const res = await Producto.bulkWrite(ops, { ordered: false });
        productosActualizados += res.modifiedCount || 0;
        console.log(
          `Batch OK | Compras: ${comprasProcesadas} | Items: ${itemsProcesados} | Productos (mapeados): ${productosMarcados} | Modificados: ${productosActualizados}`
        );
        ops = [];
      }
    }
  }

  if (ops.length) {
    const res = await Producto.bulkWrite(ops, { ordered: false });
    productosActualizados += res.modifiedCount || 0;
  }

  console.log("====================================");
  console.log("Compras procesadas:", comprasProcesadas);
  console.log("Items procesados:", itemsProcesados);
  console.log("Productos con última compra detectada:", productosMarcados);
  console.log("Productos modificados:", productosActualizados);
  console.log("Listo.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("ERROR:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

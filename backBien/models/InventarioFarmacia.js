// backBien/models/InventarioFarmacia.js
const mongoose = require("mongoose");
require('./Producto');
const InventarioFisico = require("./InventarioFisico");
const Producto = require("./Producto");

const InventarioFarmaciaSchema = new mongoose.Schema({
  farmacia: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmacia' },
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
  existencia: { type: Number, default: 0 },

  stockMax: { type: Number, default: 0 },
  stockMin: { type: Number, default: 0 },
  precioVenta: { type: Number, required: true },
  ubicacionFarmacia: { type: String, trim: true, default: '' }
}, { timestamps: true });

/* ============================================================
   ÍNDICES
============================================================ */
InventarioFarmaciaSchema.index({ producto: 1 });
InventarioFarmaciaSchema.index({ farmacia: 1, existencia: 1 });
InventarioFarmaciaSchema.index({ farmacia: 1, producto: 1 });

/* ============================================================
   🧠 MIDDLEWARE para registrar Inventario Físico en FARMACIAS
============================================================ */
InventarioFarmaciaSchema.post("findOneAndUpdate", async function (doc) {
  if (!doc) return;

  try {
    // Nueva existencia (ya actualizada)
    const nuevaExistencia = doc.existencia;

    // Buscar existencia previa desde el historial
    const ultimo = await InventarioFisico.findOne({
      producto: doc.producto,
      farmaNombre: doc.farmacia.toString()
    }).sort({ fechaInv: -1 });

    const existenciaAnterior = ultimo?.existenciaFisica ?? 0;

    // Si no hubo cambio → no registrar
    if (existenciaAnterior === nuevaExistencia) return;

    // Obtener costo del producto
    const prod = await Producto.findById(doc.producto).select("costo");
    const costo = prod?.costo ?? 0;

    const diferencia = nuevaExistencia - existenciaAnterior;
    const perdida = diferencia * costo;

    await InventarioFisico.create({
      fechaInv: new Date(),
      farmaNombre: doc.farmacia.toString(), 
      producto: doc.producto,
      existenciaSistema: existenciaAnterior,
      existenciaFisica: nuevaExistencia,
      diferencia,
      perdida
    });

    console.log("📌 Registro inventario físico (farmacia) creado");

  } catch (err) {
    console.error("❌ Error registrando inventario físico farmacia:", err);
  }
});

module.exports = mongoose.model("InventarioFarmacia", InventarioFarmaciaSchema);

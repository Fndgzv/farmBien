// backBien/models/InventarioFarmacia.js
const mongoose = require("mongoose");
require("./Producto");
const InventarioFisico = require("./InventarioFisico");
const Producto = require("./Producto");

const { Schema } = mongoose;

/* ===================== Sub-schema reutilizable: promo día/temporada ===================== */
const PromoSchema = new Schema(
  {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  { _id: false } // para que NO cree _id dentro del subdocumento
);

const InventarioFarmaciaSchema = new Schema(
  {
    farmacia: { type: Schema.Types.ObjectId, ref: "Farmacia" },
    producto: { type: Schema.Types.ObjectId, ref: "Producto" },

    existencia: { type: Number, default: 0 },
    stockMax: { type: Number, default: 0 },
    stockMin: { type: Number, default: 0 },

    precioVenta: { type: Number, required: true },
    ubicacionFarmacia: { type: String, trim: true, default: "" },

    /* =====================================================================
       ✅ PROMOCIONES (migradas desde Producto, ahora por farmacia)
       (por ahora solo agregamos campos; NO quitamos nada de Producto)
    ===================================================================== */

    // Promos por día
    promoLunes: PromoSchema,
    promoMartes: PromoSchema,
    promoMiercoles: PromoSchema,
    promoJueves: PromoSchema,
    promoViernes: PromoSchema,
    promoSabado: PromoSchema,
    promoDomingo: PromoSchema,

    // Promos por cantidad (4x3, 3x2, 2x1)
    promoCantidadRequerida: { type: Number, enum: [4, 3, 2] },
    inicioPromoCantidad: { type: Date },
    finPromoCantidad: { type: Date },

    // INAPAM
    descuentoINAPAM: { type: Boolean, default: false },

    // Promo de temporada
    promoDeTemporada: PromoSchema,
  },
  { timestamps: true }
);

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
      farmaNombre: doc.farmacia.toString(),
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
      perdida,
    });

    console.log("📌 Registro inventario físico (farmacia) creado");
  } catch (err) {
    console.error("❌ Error registrando inventario físico farmacia:", err);
  }
});

module.exports =
  mongoose.models.InventarioFarmacia ||
  mongoose.model("InventarioFarmacia", InventarioFarmaciaSchema);

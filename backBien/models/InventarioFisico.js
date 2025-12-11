// backBien/models/InventarioFisico.js
const mongoose = require("mongoose");

// *** ESTA ES LA CORRECCIÓN ***
const Producto = mongoose.model("Producto");

const InventarioFisicoSchema = new mongoose.Schema(
  {
    fechaInv: { type: Date, default: Date.now },
    farmaNombre: String,

    producto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Producto",
      required: true
    },

    existenciaSistema: { type: Number, default: 0 },
    existenciaFisica: { type: Number, default: 0 },

    diferencia: { type: Number, default: 0 },
    perdida: { type: Number, default: 0 },

    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  },
  { collection: "inventariosfisicos" }
);


/* ===========================================================
   FUNCION DE CÁLCULO
=========================================================== */
async function calcularCampos(doc) {
  if (!doc.producto) return;

  // Obtener costo del producto (YA FUNCIONA)
  const prod = await Producto.findById(doc.producto).lean();
  const costo = prod?.costo ?? 0;

  const dif = Number(doc.existenciaFisica) - Number(doc.existenciaSistema);
  doc.diferencia = dif;
  doc.perdida = dif * costo;
}


/* PRE-SAVE */
InventarioFisicoSchema.pre("save", async function (next) {
  await calcularCampos(this);
  next();
});

/* PRE-UPDATE */
InventarioFisicoSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();
  const docActual = await this.model.findOne(this.getQuery());

  if (!docActual) return next();

  const temp = { ...docActual.toObject(), ...update.$set };
  await calcularCampos(temp);

  this.set({
    $set: {
      diferencia: temp.diferencia,
      perdida: temp.perdida
    }
  });

  next();
});

module.exports = mongoose.model("InventarioFisico", InventarioFisicoSchema);

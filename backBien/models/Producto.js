// backBien/models/Producto.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// === Helper de normalización (sin acentos, minúsculas, espacios colapsados) ===
function norm(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// === Subdocumento de lotes ===
const LoteSchema = new Schema({
  lote: { type: String, trim: true },
  fechaCaducidad: { type: Date },
  cantidad: { type: Number } // Se irá restando conforme se vendan productos
});

// === Producto ===
const ProductoSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  ingreActivo: { type: String, trim: true },

  codigoBarras: { type: String, trim: true },
  unidad: { type: String, required: true, trim: true },
  precio: { type: Number, required: true },
  costo: { type: Number, required: true },
  iva: { type: Boolean },

  stockMinimo: { type: Number, required: true, default: 50 },
  stockMaximo: { type: Number, required: true, default: 100 },
  ubicacion: { type: String, trim: true },

  categoria: { type: String, required: true, trim: true },
  generico: { type: Boolean, default: false },
  renglon1: { type: String, trim: true },
  renglon2: { type: String, trim: true },

  // === NUEVOS: campos normalizados para búsquedas sin acentos y más rápidas ===
  nombreNorm: { type: String, default: "" },
  categoriaNorm: { type: String, default: "" },
  ingreActivoNorm: { type: String, default: "" },

  ultimoProveedorId: { type: Schema.Types.ObjectId, ref: "Proveedor", default: null, index: true },
  ultimaCompraAt: { type: Date, default: null, index: true },
  ultimaCompraId: { type: Schema.Types.ObjectId, ref: "Compra", default: null },
  ultimoCostoCompra: { type: Number, default: 0, min: 0 },

  promoLunes: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  promoMartes: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  promoMiercoles: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  promoJueves: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  promoViernes: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  promoSabado: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },
  promoDomingo: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },

  promoCantidadRequerida: { type: Number, enum: [4, 3, 2] }, // 4x3, 3x2, 2x1
  inicioPromoCantidad: { type: Date },
  finPromoCantidad: { type: Date },

  descuentoINAPAM: { type: Boolean, default: false }, // Descuento del 5% para adultos mayores

  promoDeTemporada: {
    porcentaje: { type: Number, min: 0, max: 100 },
    inicio: { type: Date },
    fin: { type: Date },
    monedero: { type: Boolean },
  },

  lotes: [LoteSchema], // Inventario controlado por lotes
  imagen: { type: String, trim: true, default: null }
}, { timestamps: true });

/* ===================== Middlewares de normalización ===================== */
function applyNormToDoc(doc) {
  if (doc.isNew || doc.isModified("nombre")) {
    doc.nombreNorm = norm(doc.nombre);
  }
  if (doc.isNew || doc.isModified("categoria")) {
    doc.categoriaNorm = norm(doc.categoria);
  }
  if (doc.isNew || doc.isModified("ingreActivo")) {
    doc.ingreActivoNorm = norm(doc.ingreActivo);
  }
}

function applyNormToUpdate(update) {
  if (!update) return;

  if (!update.$set) update.$set = {};

  const $set = update.$set || {};
  const $soi = update.$setOnInsert || {};
  const $unset = update.$unset || {};

  const pick = (key) =>
    $set[key] !== undefined ? $set[key]
      : $soi[key] !== undefined ? $soi[key]
        : update[key];

  const nombre = pick("nombre");
  const categoria = pick("categoria");
  const ingreActivo = pick("ingreActivo");

  if (nombre !== undefined) update.$set.nombreNorm = norm(nombre);
  if (categoria !== undefined) update.$set.categoriaNorm = norm(categoria);
  if (ingreActivo !== undefined) update.$set.ingreActivoNorm = norm(ingreActivo);

  // Si lo están “borrando”
  if ($unset && $unset.ingreActivo !== undefined) {
    update.$set.ingreActivoNorm = "";
  }
}


// Save / create
ProductoSchema.pre("save", function (next) {
  applyNormToDoc(this);
  next();
});

// insertMany (bulk)
ProductoSchema.pre("insertMany", function (next, docs) {
  for (const d of docs) {
    d.nombreNorm = norm(d.nombre);
    d.categoriaNorm = norm(d.categoria);
    d.ingreActivoNorm = norm(d.ingreActivo);
  }
  next();
});

// Updates por query
ProductoSchema.pre("findOneAndUpdate", function (next) {
  applyNormToUpdate(this.getUpdate());
  next();
});
ProductoSchema.pre("updateOne", function (next) {
  applyNormToUpdate(this.getUpdate());
  next();
});
ProductoSchema.pre("updateMany", function (next) {
  applyNormToUpdate(this.getUpdate());
  next();
});
ProductoSchema.pre("replaceOne", function (next) {
  applyNormToUpdate(this.getUpdate());
  next();
});

/* =========================== Índices útiles ============================ */
ProductoSchema.index({ codigoBarras: 1 }, { sparse: true });
ProductoSchema.index({ nombre: 1 });
ProductoSchema.index({ categoria: 1 });       // opcional, útil para orden/lookup
ProductoSchema.index({ ingreActivo: 1 });       // opcional, útil para orden/lookup
ProductoSchema.index({ nombreNorm: 1 });      // clave para búsquedas sin acentos
ProductoSchema.index({ categoriaNorm: 1 });   // clave para búsquedas sin acentos
ProductoSchema.index({ ingreActivoNorm: 1 });   // clave para búsquedas sin acentos
ProductoSchema.index({ categoriaNorm: 1, nombreNorm: 1 });

module.exports = mongoose.models.Producto || mongoose.model("Producto", ProductoSchema);

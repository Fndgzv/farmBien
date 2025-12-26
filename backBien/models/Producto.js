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
}

function applyNormToUpdate(update) {
  if (!update) return;

  // Garantiza $set
  if (!update.$set) update.$set = {};

  // Detecta valores venidos en $set o top-level (por seguridad)
  const nombre = (update.$set && update.$set.nombre) !== undefined ? update.$set.nombre : update.nombre;
  const categoria = (update.$set && update.$set.categoria) !== undefined ? update.$set.categoria : update.categoria;

  if (nombre !== undefined) {
    update.$set.nombreNorm = norm(nombre);
  }
  if (categoria !== undefined) {
    update.$set.categoriaNorm = norm(categoria);
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
ProductoSchema.index({ nombreNorm: 1 });      // clave para búsquedas sin acentos
ProductoSchema.index({ categoriaNorm: 1 });   // clave para búsquedas sin acentos
ProductoSchema.index({ categoriaNorm: 1, nombreNorm: 1 });

module.exports = mongoose.models.Producto || mongoose.model("Producto", ProductoSchema);

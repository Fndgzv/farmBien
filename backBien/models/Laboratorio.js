const mongoose = require("mongoose");
const { Schema } = mongoose;

function normalizarLaboratorio(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const LaboratorioSchema = new Schema({
  laboratorio: { type: String, required: true, trim: true },
  laboratorioNorm: { type: String, required: true, unique: true, index: true },
}, {
  timestamps: true,
  collection: "laboratorios",
});

LaboratorioSchema.pre("validate", function (next) {
  this.laboratorio = String(this.laboratorio ?? "").replace(/\s+/g, " ").trim();
  this.laboratorioNorm = normalizarLaboratorio(this.laboratorio);
  next();
});

const Laboratorio = mongoose.models.Laboratorio || mongoose.model("Laboratorio", LaboratorioSchema);
Laboratorio.normalizarLaboratorio = normalizarLaboratorio;

module.exports = Laboratorio;

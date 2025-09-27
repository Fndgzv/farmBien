// Pedido.js
const mongoose = require("mongoose");

const PedidoSchema = new mongoose.Schema({
  folio: { type: String, required: true },
  farmacia: { type: mongoose.Schema.Types.ObjectId, ref: "Farmacia", required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
  usuarioPidio: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  usuarioSurtio: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  usuarioCancelo: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  descripcion: { type: String, required: true },
  costo: { type: Number, default: 0 },
  total: { type: Number, required: true },
  aCuenta: { type: Number, required: true },
  resta: { type: Number },
  pagoACuenta: {
    efectivo: { type: Number, default: 0 },
    tarjeta: { type: Number, default: 0 },
    transferencia: { type: Number, default: 0 },
    vale: { type: Number, default: 0 },
  },
  pagoResta: {
    efectivo: { type: Number, default: 0 },
    tarjeta: { type: Number, default: 0 },
    transferencia: { type: Number, default: 0 },
    vale: { type: Number, default: 0 },
  },
  fechaPedido: { type: Date, default: Date.now },
  fechaEntrega: { type: Date },
  fechaCancelacion: { type: Date },
  estado: { type: String, default: 'inicial', required: true, enum: ["inicial", "entregado", "cancelado" ]}
}, { timestamps: true })

PedidoSchema.pre('save', function (next) {
  this.resta = this.total - 
  (this.aCuenta + this.pagoResta.efectivo + this.pagoResta.tarjeta + this.pagoResta.transferencia + this.pagoResta.vale);
  next();
});

PedidoSchema.index({ fechaPedido: 1, farmacia: 1, usuarioPidio: 1, estado: 1 });
PedidoSchema.index({ folio: 1 });
PedidoSchema.index({ fechaPedido: -1, farmacia: 1, estado: 1 }); // filtro + sort
PedidoSchema.index({ estado: 1 });
PedidoSchema.index({ farmacia: 1 });
PedidoSchema.index({ descripcion: 'text' })

module.exports = mongoose.model("Pedido", PedidoSchema);

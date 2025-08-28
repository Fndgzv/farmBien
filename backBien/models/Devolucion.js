const mongoose = require("mongoose");

const DevolucionSchema = new mongoose.Schema({
  venta: { type: mongoose.Schema.Types.ObjectId, ref: "Venta", required: true },
  farmacia: { type: mongoose.Schema.Types.ObjectId, ref: "Farmacia", required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
  productosDevueltos: [{
    producto: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", required: true },
    cantidad: { type: Number, required: true },
    motivo: {
      type: String,
      required: true,
      enum: [
        "Cliente cambió de opinión",
        "Error en la receta médica",
        "Presentación incorrecta",
        "Cantidad errónea entregada",
        "Producto duplicado en la venta",
        "Precio incorrecto en ticket",
        "Producto caducado", "Producto en mal estado", "Producto no surtible", "Error en producto entregado", // devuelven en efectivo
      ]
    },
    precioXCantidad: { type: Number, required: true },
  }],
  dineroDevuelto: { type: Number, required: true },
  valeDevuelto: { type: Number, required: true },
  totalDevuelto: { type: Number, required: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  fecha: { type: Date, default: Date.now }
}, { collection: 'devoluciones' }
);

DevolucionSchema.index({ fecha: 1, farmacia: 1 });

module.exports = mongoose.model("Devolucion", DevolucionSchema);

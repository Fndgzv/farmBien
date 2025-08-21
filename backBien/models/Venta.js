// backBien\models\Venta.js
const mongoose = require("mongoose");

// Subesquema para los productos de la venta
const DetalleVentaSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", required: true },
  categoria: { type: String, default: '' },
  cantidad: { type: Number, required: true },
  precio: { type: Number, required: true },
  totalRen: { type: Number, required: true },
  precioOriginal: { type: Number, required: true },
  costo: { type: Number, required: true },
  iva: { type: Number, required: true },
  descuento: { type: Number, default: 0 },
  cadenaDescuento: { type: String, default: '' },
  monederoCliente: { type: Number, default: 0 },
  tipoDescuento: {
    type: String,
    enum: [
      "Ninguno", "INAPAM", "Temporada", "Cliente",
      "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
      "2x1", "3x2", "4x3", "2x1-Gratis", "3x2-Gratis", "4x3-Gratis",
      "Temporada-INAPAM",
      "Lunes-INAPAM", "Martes-INAPAM", "Miércoles-INAPAM", "Jueves-INAPAM", "Viernes-INAPAM", "Sábado-INAPAM", "Domingo-INAPAM",
      "2x1-INAPAM", "3x2-INAPAM", "4x3-INAPAM",
      "INAPAM-Cliente", "Temporada-Cliente",
      "Lunes-Cliente", "Martes-Cliente", "Miércoles-Cliente", "Jueves-Cliente", "Viernes-Cliente", "Sábado-Cliente", "Domingo-Cliente",
      "2x1-Cliente", "3x2-Cliente", "4x3-Cliente",
      "Temporada-INAPAM-Cliente",
      "Lunes-INAPAM-Cliente", "Martes-INAPAM-Cliente", "Miércoles-INAPAM-Cliente", "Jueves-INAPAM-Cliente", "Viernes-INAPAM-Cliente", "Sábado-INAPAM-Cliente", "Domingo-INAPAM-Cliente",
      "2x1-INAPAM-Cliente", "3x2-INAPAM-Cliente", "4x3-INAPAM-Cliente"
    ],
    default: "Ninguno"
  },

}, { _id: false }); // Para evitar que cree _id para cada producto

const VentaSchema = new mongoose.Schema({
  folio: {
    type: String,
    required: true,
    unique: true
  },
  farmacia: { type: mongoose.Schema.Types.ObjectId, ref: "Farmacia", required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  productos: [DetalleVentaSchema],
  cantidadProductos: { type: Number, required: true },
  total: { type: Number, required: true },
  totalDescuento: { type: Number, default: 0 },
  totalMonederoCliente: { type: Number, default: 0 },
  formaPago: {
    efectivo: { type: Number, default: 0 },
    tarjeta: { type: Number, default: 0 },
    transferencia: { type: Number, default: 0 },
    vale: { type: Number, default: 0 },
  },
  fecha: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Venta", VentaSchema);

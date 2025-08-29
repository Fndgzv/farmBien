// Cliente.js 
const mongoose = require("mongoose");

const HistorialCompraSchema = new mongoose.Schema({
    venta: { type: mongoose.Schema.Types.ObjectId, ref: "Venta" },
    pedido: { type: mongoose.Schema.Types.ObjectId, ref: "Pedido" },
    devolucion: { type: mongoose.Schema.Types.ObjectId, ref: "Devolucion" },
    cancelacion: { type: mongoose.Schema.Types.ObjectId, ref: "Cancelacion" }
}, { _id: false });

// Subdocumento para cada movimiento del monedero
const MonederoSchema = new mongoose.Schema({
    fechaUso: { type: Date, required: true },
    montoIngreso: { type: Number, default: 0 },
    montoEgreso: { type: Number, default: 0 },
    motivo: {
        type: String,
        enum: [
            "Pago venta", "Pago pedido", "Devolución venta", "Cancelación pedido", "Premio", "Premio-Pago venta"
        ],
    },
    farmaciaUso: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmacia', required: true }
}, { _id: false });

const ClienteSchema = new mongoose.Schema({
    telefono: {
        type: String,
        required: true,
        unique: true,
        validate: {
            validator: function (v) {
                return /^\d{10}$/.test(v);
            },
            message: "El teléfono debe contener exactamente 10 dígitos numéricos."
        }
    },
    password: { type: String, required: true },
    nombre: { type: String, required: true },
    email: { type: String },
    domicilio: { type: String },
    historialCompras: [HistorialCompraSchema],
    monedero: [MonederoSchema],
    totalMonedero: { type: Number, require: true, default: 0 },
    historialMedico: [
        // 🚧 Pendiente de definir la estructura exacta cuando se cuente con la especificación de la receta médica.
        {
            receta: {
                medico: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
                medicamentos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Producto" }],
                indicaciones: String,
                diagnostico: String,
                fecha: Date,
                // otros campos necesarios
            }
        }
    ]
}, { timestamps: true });

// Índices para optimizar búsquedas
ClienteSchema.index({ "historialCompras.producto": 1, "historialCompras.fechaCompra": 1 });

module.exports = mongoose.model("Cliente", ClienteSchema);

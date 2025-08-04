// models/SurtidoFarmacia.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const SurtidoItemSchema = new Schema({
  producto: {
    type: Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  lote: {
    type: String,
    required: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 1
  },
  // precio de venta al momento del surtido
  precioUnitario: {
    type: Number
  }
}, { _id: false });

const SurtidoFarmaciaSchema = new Schema({
  farmacia: {
    type: Schema.Types.ObjectId,
    ref: 'Farmacia',
    required: true
  },
  // Usuario que hace el surtido
  usuarioSurtio: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  fechaSurtido: {
    type: Date,
    default: Date.now
  },
  tipoMovimiento: {
    type: String,
    enum: ['surtido', 'ajuste', 'devolución'],
    default: 'surtido'
  },
  // Aquí van todos los productos incluidos en este envío
  items: {
    type: [SurtidoItemSchema],
    required: true,
    validate: items => items.length > 0
  }
}, { timestamps: true });

module.exports = mongoose.model('SurtidoFarmacia', SurtidoFarmaciaSchema);

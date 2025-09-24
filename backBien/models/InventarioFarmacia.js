const mongoose = require("mongoose");
const InventarioFarmaciaSchema = new mongoose.Schema({
    farmacia: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmacia' },
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
    existencia: { type: Number, default: 0 },
    stockMax: { type: Number, default: 0 },
    stockMin: { type: Number, default: 0 },
    precioVenta: { type: Number, required: true }
}, { timestamps: true });

InventarioFarmaciaSchema.index({ producto: 1 });

module.exports = mongoose.model('InventarioFarmacia', InventarioFarmaciaSchema);
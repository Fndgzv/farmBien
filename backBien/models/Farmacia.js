const mongoose = require('mongoose');

const FarmaciaSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    direccion: String,
    telefono: String,
    contacto: String,
    firma: { type: String, required: true },
    activo: { type: Boolean, default: true } // 🟢 Eliminación lógica
}, { timestamps: true });

module.exports = mongoose.model('Farmacia', FarmaciaSchema);
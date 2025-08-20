// backBien\models\Farmacia.js

const mongoose = require('mongoose');

const FarmaciaSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    direccion: String,
    telefono: String,
    contacto: String,
    firmaHash: { type: String, required: true },
    activo: { type: Boolean, default: true }, // 🟢 Eliminación lógica
    firmaUpdatedAt: { type: Date },
    firmaUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    firmaVersion: { type: Number, default: 1 },
}, { timestamps: true });

// Ocultar firmaHash en respuestas JSON
FarmaciaSchema.set('toJSON', {
    transform: (_doc, ret) => {
        delete ret.firmaHash;
        return ret;
    }
});

module.exports = mongoose.model('Farmacia', FarmaciaSchema);
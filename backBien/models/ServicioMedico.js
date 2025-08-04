
const mongoose = require('mongoose');

const RecetaSchema = new mongoose.Schema({
    medicamento: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    dosis: String
});

const ServicioMedicoSchema = new mongoose.Schema({
    farmacia: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmacia' },
    medico: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: false }, // Asociar paciente con cliente si aplica
    servicio: String,
    precio: Number,
    fecha: { type: Date, default: Date.now },
    receta: [RecetaSchema] // Lista de medicamentos recetados
}, { timestamps: true });

module.exports = mongoose.model('ServicioMedico', ServicioMedicoSchema);
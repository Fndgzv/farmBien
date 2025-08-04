const mongoose = require('mongoose');
const ProveedorSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    contacto: String,
    telefono: String,
    domicilio: String
}, { timestamps: true,
    collection: 'proveedores'
 });

module.exports = mongoose.model('Proveedor', ProveedorSchema);
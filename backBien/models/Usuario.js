// Usuario.js (Usuarios administrativos, médicos o empleados)

const mongoose = require("mongoose");

const UsuarioSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    telefono: {
        type: String,
        validate: {
            validator: function (v) {
                return !v || /^\d{10}$/.test(v);  // ✅ permite vacío o bien 10 dígitos
            },
            message: "El teléfono debe contener exactamente 10 dígitos numéricos."
        }
    },
    password: { type: String, required: true },
    nombre: { type: String, required: true },
    email: { type: String, unique: true },
    domicilio: { type: String },
    rol: { type: String, enum: ["admin", "empleado", "medico"] },
    farmacia: {
        type: mongoose.Schema.Types.ObjectId, ref: "Farmacia",
        required: function () {
            return this.rol === "medico" || this.rol === "empleado";
        },
    },
    cedulaProfesional: {
        type: String,
        required: function () {
            return this.rol === "medico";
        },
    },
}, { timestamps: true });

module.exports = mongoose.model("Usuario", UsuarioSchema);

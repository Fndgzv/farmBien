// Usuario.js (Usuarios administrativos, médicos, empleados y ajustadores)
const mongoose = require("mongoose");

const UsuarioSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },

    telefono: {
        type: String,
        validate: {
            validator: function (v) {
                return !v || /^\d{10}$/.test(v);
            },
            message: "El teléfono debe contener exactamente 10 dígitos numéricos."
        }
    },

    password: { type: String, required: true },
    nombre: { type: String, required: true },
    email: { type: String, unique: true },
    domicilio: { type: String },

    rol: {
        type: String,
        enum: ["admin", "empleado", "medico", "ajustaAlmacen", "ajustaFarma", "ajustaSoloAlmacen"],
        required: true
    },

    farmacia: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmacia",
        required: function () {
            return this.rol === "empleado" ||
                   this.rol === "medico" ||
                   this.rol === "ajustaFarma";
        }
    },

    cedulaProfesional: {
        type: String,
        required: function () {
            return this.rol === "medico";
        }
    }
}, { timestamps: true });

module.exports = mongoose.model("Usuario", UsuarioSchema);

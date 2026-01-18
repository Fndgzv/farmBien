// backBien/models/Receta.js
const mongoose = require("mongoose");
const { Schema } = mongoose;
const { VIAS_ADMIN } = require("../constants/viasAdmin");

const MedicamentoRecetadoSchema = new Schema(
    {
        // Si es del catálogo, guardas referencia; si no, texto libre
        productoId: { type: Schema.Types.ObjectId, ref: "Producto" },
        nombreLibre: { type: String, trim: true },

        dosis: { type: String, trim: true },        // ej. 500 mg
        via: { type: String, enum: VIAS_ADMIN, required: true },
        viaOtra: { type: String, trim: true }, // solo si via === "OTRA"
        frecuencia: { type: String, trim: true },   // c/8h, cada 24h...
        duracion: { type: String, trim: true },     // 7 días, 1 mes...
        cantidad: { type: Number, min: 0 },         // opcional
        indicaciones: { type: String, trim: true }, // “tomar con alimentos…”
        esControlado: { type: Boolean, default: false }, // útil para reglas/alertas
    },
    { _id: false }
);

const RecetaSchema = new Schema(
    {
        folio: { type: String, trim: true, index: true }, // si quieres folio humano
        fecha: { type: Date, default: Date.now, index: true },

        pacienteId: { type: Schema.Types.ObjectId, ref: "Paciente", required: true, index: true },
        medicoId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
        farmaciaId: { type: Schema.Types.ObjectId, ref: "Farmacia", required: true, index: true },

        motivoConsulta: { type: String, trim: true },
        diagnosticos: [{ type: String, trim: true }], // o ICD-10
        observaciones: { type: String, trim: true },

        medicamentos: { type: [MedicamentoRecetadoSchema], default: [] },

        indicacionesGenerales: { type: String, trim: true }, // dieta, reposo, etc.
        citaSeguimiento: { type: Date },

        // Si se surtió: referencia a tu venta/pedido (opcional)
        ventaId: { type: Schema.Types.ObjectId, ref: "Venta" },

        estado: { type: String, enum: ["activa", "cancelada"], default: "activa", index: true },

        // Auditoría simple
        creadaPor: { type: Schema.Types.ObjectId, ref: "Usuario" },
        canceladaPor: { type: Schema.Types.ObjectId, ref: "Usuario" },
        motivoCancelacion: { type: String, trim: true },
        fechaCancelacion: { type: Date },
    },
    { timestamps: true }
);

RecetaSchema.index({ pacienteId: 1, fecha: -1 });
RecetaSchema.index({ medicoId: 1, fecha: -1 });
RecetaSchema.index({ farmaciaId: 1, fecha: -1 });

module.exports = mongoose.model("Receta", RecetaSchema);

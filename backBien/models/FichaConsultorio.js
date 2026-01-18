// backBien/models/FichaConsultorio.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ServicioEnFichaSchema = new Schema(
  {
    productoId: { type: Schema.Types.ObjectId, ref: "Producto", required: true },

    // snapshots (para que si cambias el producto/precio después, no se rompa el historial)
    nombre: { type: String, trim: true, required: true },
    codigoBarras: { type: String, trim: true },
    precio: { type: Number, min: 0, required: true },

    cantidad: { type: Number, min: 1, default: 1 },
    notas: { type: String, trim: true },
  },
  { _id: false }
);

const FichaConsultorioSchema = new Schema(
  {
    folio: { type: String, trim: true, index: true },

    farmaciaId: { type: Schema.Types.ObjectId, ref: "Farmacia", required: true, index: true },

    pacienteNombre: { type: String, required: true, trim: true, index: true },
    pacienteNombreNorm: { type: String, trim: true, index: true },
    pacienteTelefono: { type: String, trim: true, index: true },
    pacienteId: { type: Schema.Types.ObjectId, ref: "Paciente" },

    llegadaAt: { type: Date, default: Date.now, index: true },
    urgencia: { type: Boolean, default: false, index: true },
    motivo: { type: String, trim: true },

    estado: {
      type: String,
      enum: ["EN_ESPERA", "EN_ATENCION", "LISTA_PARA_COBRO", "EN_COBRO", "ATENDIDA", "CANCELADA"],
      default: "EN_ESPERA",
      index: true,
    },

    // Atención
    medicoId: { type: Schema.Types.ObjectId, ref: "Usuario", index: true },
    llamadoAt: { type: Date },
    inicioAtencionAt: { type: Date },
    finAtencionAt: { type: Date },

    // Servicios capturados por el médico
    servicios: { type: [ServicioEnFichaSchema], default: [] },
    serviciosTotal: { type: Number, min: 0, default: 0 }, // 👈 opcional pero útil
    notasMedico: { type: String, trim: true },

    // Cobro / Venta
    ventaId: { type: Schema.Types.ObjectId, ref: "Venta", index: true },
    cobradaAt: { type: Date },

    cobroPor: { type: Schema.Types.ObjectId, ref: "Usuario" },
    cobroAt: { type: Date }, // 👈 faltaba

    // Auditoría
    creadaPor: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    actualizadaPor: { type: Schema.Types.ObjectId, ref: "Usuario" },
  },
  { timestamps: true }
);

FichaConsultorioSchema.index({ farmaciaId: 1, estado: 1, urgencia: -1, llegadaAt: 1 });

FichaConsultorioSchema.pre("save", function (next) {
  const full = `${this.pacienteNombre ?? ""}`.trim();
  this.pacienteNombreNorm = full
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // recalcula total (snapshot)
  if (Array.isArray(this.servicios)) {
    this.serviciosTotal = this.servicios.reduce((acc, s) => {
      const precio = Number(s.precio ?? 0);
      const cantidad = Number(s.cantidad ?? 0);
      return acc + precio * cantidad;
    }, 0);
  } else {
    this.serviciosTotal = 0;
  }

  next();
});

// Validaciones suaves de consistencia de estado
FichaConsultorioSchema.pre("validate", function (next) {
  if (this.estado === "EN_COBRO") {
    if (!this.cobroPor) this.invalidate("cobroPor", "cobroPor es requerido cuando estado=EN_COBRO");
    if (!this.cobroAt) this.invalidate("cobroAt", "cobroAt es requerido cuando estado=EN_COBRO");
  }

  if (this.cobradaAt && !this.ventaId) {
    this.invalidate("ventaId", "ventaId es requerido cuando cobradaAt está definido");
  }

  next();
});

module.exports = mongoose.model("FichaConsultorio", FichaConsultorioSchema);

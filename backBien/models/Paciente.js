// backBien/models/Paciente.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ContactoSchema = new Schema(
  {
    telefono: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    direccion: { type: String, trim: true },
    emergencia: {
      nombre: { type: String, trim: true },
      telefono: { type: String, trim: true },
      parentesco: { type: String, trim: true },
    },
  },
  { _id: false }
);

const DatosGeneralesSchema = new Schema(
  {
    fechaNacimiento: { type: Date },
    sexo: { type: String, enum: ["M", "F", "Otro", "NoEspecifica"], default: "NoEspecifica" },
    curp: { type: String, trim: true, uppercase: true },
    ocupacion: { type: String, trim: true },
    escolaridad: { type: String, trim: true },
  },
  { _id: false }
);


const AntecedentesSchema = new Schema(
  {
    alergias: [{ type: String, trim: true }],
    enfermedadesCronicas: [{ type: String, trim: true }], // ej. DM2, HAS, Asma...
    cirugiasPrevias: [{ type: String, trim: true }],
    medicamentosActuales: [{ type: String, trim: true }],
    antecedentesFamiliares: [{ type: String, trim: true }],
    tabaquismo: { type: String, enum: ["No", "Si", "Ex"], default: "No" },
    alcohol: { type: String, enum: ["No", "Si", "Ocasional"], default: "No" },
  },
  { _id: false }
);

const SignosVitalesSchema = new Schema(
  {
    fecha: { type: Date, default: Date.now, index: true },
    pesoKg: { type: Number, min: 0 },
    tallaCm: { type: Number, min: 0 },
    imc: { type: Number, min: 0 },
    temperatura: { type: Number },
    presionSis: { type: Number },
    presionDia: { type: Number },
    fc: { type: Number },
    fr: { type: Number },
    spo2: { type: Number },
    glucosaCapilar: { type: Number },
    notas: { type: String, trim: true },
    tomadoPor: { type: Schema.Types.ObjectId, ref: "Usuario" }, // enfermería/medico
    farmaciaId: { type: Schema.Types.ObjectId, ref: "Farmacia" }, // dónde fue la toma
  },
  { _id: false }
);

const NotaClinicaSchema = new Schema(
  {
    fecha: { type: Date, default: Date.now, index: true },
    motivoConsulta: { type: String, trim: true },
    padecimientoActual: { type: String, trim: true },
    exploracionFisica: { type: String, trim: true },
    diagnosticos: [{ type: String, trim: true }], // o luego ICD-10
    plan: { type: String, trim: true },
    medicoId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    farmaciaId: { type: Schema.Types.ObjectId, ref: "Farmacia", required: true },
  },
  { _id: false }
);

// “Snapshot” opcional para cargar rápido sin ir a Recetas
const RecetaResumenSchema = new Schema(
  {
    recetaId: { type: Schema.Types.ObjectId, ref: "Receta", required: true },
    fecha: { type: Date, required: true },
    medicoId: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    diagnosticoPrincipal: { type: String, trim: true },
  },
  { _id: false }
);

const PacienteSchema = new Schema(
  {
    // Identidad
    nombre: { type: String, required: true, trim: true },
    apellidos: { type: String, trim: true },
    nombreCompletoNorm: { type: String, trim: true }, // para búsqueda (lower/sin acentos)
    contacto: { type: ContactoSchema, default: {} },
    datosGenerales: { type: DatosGeneralesSchema, default: {} },

    // Relación con farmacias (por si atiendes en varias)
    farmaciasVinculadas: [{ type: Schema.Types.ObjectId, ref: "Farmacia", index: true }],

    // Historial médico (mínimo por ahora)
    antecedentes: { type: AntecedentesSchema, default: {} },

    // Expediente
    signosVitales: { type: [SignosVitalesSchema], default: [] },
    notasClinicas: { type: [NotaClinicaSchema], default: [] },

    // Historial de recetas (referencias)
    recetas: [{ type: Schema.Types.ObjectId, ref: "Receta", index: true }],

    // Resumen rápido (últimas N recetas)
    ultimasRecetas: { type: [RecetaResumenSchema], default: [] },

    // Estado
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Índices útiles
PacienteSchema.index({ "contacto.telefono": 1 });
PacienteSchema.index({ "datosGenerales.curp": 1 }, { sparse: true });
PacienteSchema.index({ nombreCompletoNorm: 1 });

// Pre-save: generar normalizado (puedes reemplazar con tu helper real)
PacienteSchema.pre("save", function (next) {
  const full = `${this.nombre ?? ""} ${this.apellidos ?? ""}`.trim();
  this.nombreCompletoNorm = full
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  next();
});

module.exports = mongoose.model("Paciente", PacienteSchema);

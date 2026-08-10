const mongoose = require("mongoose");

const { Schema } = mongoose;

const FAMILIARES = [
  "Padre",
  "Madre",
  "Abuelo paterno",
  "Abuela paterna",
  "Abuelo materno",
  "Abuela materna",
];

const VALORES_DIENTE = ["S", "C", "O", "A", "P", "M", "B"];

const DIENTES = [
  "D18", "D17", "D16", "D15", "D14", "D13", "D12", "D11",
  "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28",
  "D55", "D54", "D53", "D52", "D51",
  "D61", "D62", "D63", "D64", "D65",
  "D85", "D84", "D83", "D82", "D81",
  "D71", "D72", "D73", "D74", "D75",
  "D48", "D47", "D46", "D45", "D44", "D43", "D42", "D41",
  "D31", "D32", "D33", "D34", "D35", "D36", "D37", "D38",
];

function esFechaDiaValida(value) {
  if (value == null || value === "") return true;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

const fechaDiaSchema = {
  type: String,
  trim: true,
  validate: {
    validator: esFechaDiaValida,
    message: "La fecha debe tener formato YYYY-MM-DD.",
  },
};

const familiaresSchema = () => ({
  type: [{ type: String, enum: FAMILIARES }],
  default: [],
});

const opcionTextoSchema = new Schema(
  {
    activo: { type: Boolean, default: false },
    texto: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const otrasHereditariasSchema = new Schema(
  {
    familiares: familiaresSchema(),
    texto: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const antecedentesHereditariosSchema = new Schema(
  {
    diabetes: familiaresSchema(),
    hipertension: familiaresSchema(),
    obesidad: familiaresSchema(),
    convulsiones: familiaresSchema(),
    hemofilicos: familiaresSchema(),
    respiratorios: familiaresSchema(),
    hepatitis: familiaresSchema(),
    oncologicos: familiaresSchema(),
    otras: { type: otrasHereditariasSchema, default: () => ({}) },
    niegaAntecedentes: { type: Boolean, default: false },
  },
  { _id: false }
);

// Compatibilidad de lectura con certificados creados cuando este campo era un arreglo.
// El cast se limita a esta ruta: [] -> false y un arreglo con familiares -> true.
const castBoolean = Schema.Types.Boolean.cast();
antecedentesHereditariosSchema.path("niegaAntecedentes").castFunction(value => (
  Array.isArray(value) ? value.length > 0 : castBoolean(value)
));

const antecedentesPersonalesSchema = new Schema(
  {
    alergias: { type: String, trim: true, default: "" },
    obesidad: { type: Boolean, default: false },
    diabetes: { type: Boolean, default: false },
    hipertension: { type: Boolean, default: false },
    hepatitis: { type: Boolean, default: false },
    convulsiones: { type: Boolean, default: false },
    alcoholismo: { type: Boolean, default: false },
    tabaquismo: { type: Boolean, default: false },
    otros: { type: opcionTextoSchema, default: () => ({}) },
    niegaAntecedentes: { type: Boolean, default: false },
  },
  { _id: false }
);

const estadoNutricionalSchema = new Schema(
  {
    normal: { type: Boolean, default: false },
    malnutricion: { type: Boolean, default: false },
    sobrepeso: { type: Boolean, default: false },
    obesidad: { type: Boolean, default: false },
    otra: { type: opcionTextoSchema, default: () => ({}) },
  },
  { _id: false }
);

const agudezaVisualSchema = new Schema(
  {
    graduacion: { type: String, trim: true, default: "" },
    normal: { type: Boolean, default: false },
    lentes: { type: Boolean, default: false },
    disminuida: { type: Boolean, default: false },
    otra: { type: opcionTextoSchema, default: () => ({}) },
  },
  { _id: false }
);

const problemasDesarrolloSchema = new Schema(
  {
    maltrato: { type: Boolean, default: false },
    problemasConducta: { type: Boolean, default: false },
    problemasAprendizaje: { type: Boolean, default: false },
    problemasLenguaje: { type: Boolean, default: false },
    ninguno: { type: Boolean, default: false },
  },
  { _id: false }
);

const cardiovascularSchema = new Schema(
  {
    normal: { type: Boolean, default: false },
    sFisiologico: { type: Boolean, default: false },
    sOrganico: { type: Boolean, default: false },
    arritmias: { type: Boolean, default: false },
    bradicardias: { type: Boolean, default: false },
  },
  { _id: false }
);

const pielSchema = new Schema(
  {
    normal: { type: Boolean, default: false },
    piodermias: { type: Boolean, default: false },
    pAlba: { type: Boolean, default: false },
    micosis: { type: Boolean, default: false },
    escabiasis: { type: Boolean, default: false },
  },
  { _id: false }
);

const muscularSchema = new Schema(
  {
    normal: { type: Boolean, default: false },
    dColumna: { type: Boolean, default: false },
    piePlano: { type: Boolean, default: false },
    gValgo: { type: Boolean, default: false },
    tratamiento: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const respiratorioSchema = new Schema(
  {
    normal: { type: Boolean, default: false },
    resfriadoC: { type: Boolean, default: false },
    otitis: { type: Boolean, default: false },
    bronquitis: { type: Boolean, default: false },
    asma: { type: Boolean, default: false },
  },
  { _id: false }
);

const examenFisicoSchema = new Schema(
  {
    talla: { type: String, trim: true, default: "" },
    fr: { type: String, trim: true, default: "" },
    temperatura: { type: String, trim: true, default: "" },
    tensionArterial: { type: String, trim: true, default: "" },
    peso: { type: String, trim: true, default: "" },
    fc: { type: String, trim: true, default: "" },
    imc: { type: String, trim: true, default: "" },
    grupoSanguineo: { type: String, trim: true, default: "" },
    esquemaInmunizaciones: {
      type: String,
      enum: ["COMPLETO", "INCOMPLETO", "NULO", null],
      default: null,
    },
    limitantesFisicasIntelectuales: { type: String, trim: true, default: "" },
    estadoNutricional: { type: estadoNutricionalSchema, default: () => ({}) },
    agudezaVisual: { type: agudezaVisualSchema, default: () => ({}) },
    problemasDesarrollo: { type: problemasDesarrolloSchema, default: () => ({}) },
    cardiovascular: { type: cardiovascularSchema, default: () => ({}) },
    piel: { type: pielSchema, default: () => ({}) },
    muscular: { type: muscularSchema, default: () => ({}) },
    respiratorio: { type: respiratorioSchema, default: () => ({}) },
  },
  { _id: false }
);

const dientesDefinicion = Object.fromEntries(
  DIENTES.map((diente) => [
    diente,
    { type: String, enum: VALORES_DIENTE, default: "S" },
  ])
);

const dientesSchema = new Schema(dientesDefinicion, { _id: false });

const saludBucalSchema = new Schema(
  {
    dientes: { type: dientesSchema, default: () => ({}) },
    observaciones: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const medicoSnapshotSchema = new Schema(
  {
    nombre: { type: String, trim: true, default: "" },
    cedulaProfesional: { type: String, trim: true, default: "" },
    titulo: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const CertificadosMedicoSchema = new Schema(
  {
    farmacia: { type: Schema.Types.ObjectId, ref: "Farmacia", required: true, index: true },
    medico: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    fichaConsultorio: { type: Schema.Types.ObjectId, ref: "FichaConsultorio" },

    fechaRevision: { ...fechaDiaSchema, required: true, index: true },
    tipo: { type: String, enum: ["ESCOLAR", "LABORAL"], required: true },
    nombreInstituto: { type: String, trim: true, default: "" },
    turno: { type: String, trim: true, default: "" },
    grado: { type: String, trim: true, default: "" },
    nivelEscolar: { type: String, trim: true, default: "" },
    nombre: { type: String, trim: true, required: true, index: true },
    genero: { type: String, trim: true, default: "" },
    fechaNacimiento: fechaDiaSchema,
    curp: { type: String, trim: true, uppercase: true, default: "" },
    edad: { type: Number, min: 0, max: 150 },
    responsable: { type: String, trim: true, default: "", index: true },
    domicilio: { type: String, trim: true, default: "" },
    telefono: { type: String, trim: true, default: "" },

    antecedentesHereditarios: { type: antecedentesHereditariosSchema, default: () => ({}) },
    antecedentesPersonales: { type: antecedentesPersonalesSchema, default: () => ({}) },
    examenFisico: { type: examenFisicoSchema, default: () => ({}) },
    saludBucal: { type: saludBucalSchema, default: () => ({}) },

    aptoLaboresEscolares: { type: Boolean, default: null },
    aptoLaboresFisicas: { type: Boolean, default: null },
    vigenciaDesde: fechaDiaSchema,
    vigenciaHasta: fechaDiaSchema,
    diagnosticoObservaciones: { type: String, trim: true, default: "" },
    medicoSnapshot: { type: medicoSnapshotSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: "certificadosMedicos",
  }
);

CertificadosMedicoSchema.index(
  { fichaConsultorio: 1 },
  {
    unique: true,
    partialFilterExpression: { fichaConsultorio: { $type: "objectId" } },
    name: "certificado_unico_por_ficha",
  }
);

CertificadosMedicoSchema.index({ farmacia: 1, fechaRevision: -1, nombre: 1 });
CertificadosMedicoSchema.index({ medico: 1, fechaRevision: -1, nombre: 1 });

CertificadosMedicoSchema.statics.DIENTES = DIENTES;
CertificadosMedicoSchema.statics.FAMILIARES = FAMILIARES;
CertificadosMedicoSchema.statics.VALORES_DIENTE = VALORES_DIENTE;

module.exports = mongoose.model("CertificadosMedico", CertificadosMedicoSchema);

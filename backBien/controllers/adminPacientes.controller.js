// backBien/controllers/adminPacientes.controller.js
const mongoose = require("mongoose");
const Paciente = require("../models/Paciente");

const SEXOS_VALIDOS = ["M", "F", "Otro", "NoEspecifica"];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const cleanStr = (value) => String(value ?? "").trim();

const normUpper = (value) =>
  cleanStr(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const normLower = (value) =>
  cleanStr(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const escapeRegex = (value) => cleanStr(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pacienteListaSelect = [
  "_id",
  "nombre",
  "apPaterno",
  "apMaterno",
  "nombreCompletoNorm",
  "datosGenerales.fechaNacimiento",
  "datosGenerales.sexo",
  "datosGenerales.curp",
  "datosGenerales.entidadNacimiento",
  "datosGenerales.ocupacion",
  "datosGenerales.escolaridad",
  "contacto.telefono",
  "contacto.email",
  "contacto.direccion",
  "contacto.emergencia.nombre",
  "contacto.emergencia.telefono",
  "contacto.emergencia.parentesco",
  "farmaciasVinculadas",
  "activo",
  "createdAt",
  "updatedAt",
].join(" ");

function fechaDesdeInput(value) {
  const raw = cleanStr(value);
  if (!raw) return null;

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);

  return Number.isNaN(fecha.getTime()) ? "__INVALID__" : fecha;
}

function finDiaDesdeInput(value) {
  const raw = cleanStr(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T23:59:59.999Z`);
  }

  const fecha = new Date(raw);
  if (Number.isNaN(fecha.getTime())) return "__INVALID__";
  fecha.setUTCHours(23, 59, 59, 999);
  return fecha;
}

function setStringIfPresent(source, sourceKey, targetPath, set, transform = cleanStr) {
  if (!source || typeof source !== "object" || !hasOwn(source, sourceKey)) return;
  set[targetPath] = transform(source[sourceKey]);
}

function buildNombreCompletoNorm(actual, set) {
  const nombre = hasOwn(set, "nombre") ? set.nombre : cleanStr(actual?.nombre);
  const apPaterno = hasOwn(set, "apPaterno") ? set.apPaterno : cleanStr(actual?.apPaterno);
  const apMaterno = hasOwn(set, "apMaterno") ? set.apMaterno : cleanStr(actual?.apMaterno);
  return normLower(`${nombre} ${apPaterno} ${apMaterno}`.trim());
}

exports.listarPacientes = async (req, res) => {
  try {
    const filtro = {};

    const q = cleanStr(req.query.q);
    if (q) {
      const qRegex = escapeRegex(q);
      filtro.$or = [
        { nombreCompletoNorm: { $regex: escapeRegex(normLower(q)), $options: "i" } },
        { "datosGenerales.curp": { $regex: escapeRegex(normUpper(q)), $options: "i" } },
        { "contacto.telefono": { $regex: qRegex, $options: "i" } },
        { "contacto.emergencia.telefono": { $regex: qRegex, $options: "i" } },
        { "contacto.email": { $regex: qRegex, $options: "i" } },
      ];
    }

    const sexo = cleanStr(req.query.sexo);
    if (sexo && SEXOS_VALIDOS.includes(sexo)) {
      filtro["datosGenerales.sexo"] = sexo;
    }

    const fechaNacimientoInicial = fechaDesdeInput(req.query.fechaNacimientoInicial);
    const fechaNacimientoFinal = finDiaDesdeInput(req.query.fechaNacimientoFinal);

    if (fechaNacimientoInicial === "__INVALID__" || fechaNacimientoFinal === "__INVALID__") {
      return res.status(400).json({ ok: false, msg: "Rango de fecha de nacimiento invalido" });
    }

    if (fechaNacimientoInicial || fechaNacimientoFinal) {
      filtro["datosGenerales.fechaNacimiento"] = {};
      if (fechaNacimientoInicial) filtro["datosGenerales.fechaNacimiento"].$gte = fechaNacimientoInicial;
      if (fechaNacimientoFinal) filtro["datosGenerales.fechaNacimiento"].$lte = fechaNacimientoFinal;
    }

    const farmaciaId = cleanStr(req.query.farmaciaId);
    if (farmaciaId) {
      if (!mongoose.isValidObjectId(farmaciaId)) {
        return res.status(400).json({ ok: false, msg: "farmaciaId invalido" });
      }
      filtro.farmaciasVinculadas = new mongoose.Types.ObjectId(farmaciaId);
    }

    const pacientes = await Paciente.find(filtro)
      .select(pacienteListaSelect)
      .populate("farmaciasVinculadas", "nombre direccion telefono")
      .sort({ nombreCompletoNorm: 1, nombre: 1, apPaterno: 1 })
      .lean();

    return res.json({ ok: true, pacientes });
  } catch (err) {
    console.error("[adminPacientes][listarPacientes]", err);
    return res.status(500).json({ ok: false, msg: "Error al listar pacientes" });
  }
};

exports.obtenerPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, msg: "ID invalido" });
    }

    const paciente = await Paciente.findById(id)
      .select("-__v")
      .populate("farmaciasVinculadas", "nombre direccion telefono")
      .populate("signosVitales.farmaciaId", "nombre direccion telefono")
      .populate("signosVitales.tomadoPor", "nombre usuario rol")
      .populate("notasClinicas.medicoId", "nombre usuario rol")
      .populate("notasClinicas.farmaciaId", "nombre direccion telefono")
      .populate({
        path: "recetas",
        select: "-__v",
        options: { sort: { fecha: -1 } },
        populate: [
          { path: "medicoId", select: "nombre usuario rol" },
          { path: "farmaciaId", select: "nombre direccion telefono" },
          { path: "medicamentos.productoId", select: "nombre codigoBarras ingreActivo" },
        ],
      })
      .populate("ultimasRecetas.medicoId", "nombre usuario rol")
      .lean();

    if (!paciente) {
      return res.status(404).json({ ok: false, msg: "Paciente no encontrado" });
    }

    return res.json({ ok: true, paciente });
  } catch (err) {
    console.error("[adminPacientes][obtenerPaciente]", err);
    return res.status(500).json({ ok: false, msg: "Error al obtener expediente" });
  }
};

exports.actualizarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, msg: "ID invalido" });
    }

    const body = req.body || {};
    const set = {};
    const unset = {};

    if (hasOwn(body, "nombre")) {
      const nombre = cleanStr(body.nombre);
      if (!nombre) return res.status(400).json({ ok: false, msg: "nombre es requerido" });
      set.nombre = nombre;
    }

    setStringIfPresent(body, "apPaterno", "apPaterno", set);
    setStringIfPresent(body, "apMaterno", "apMaterno", set);

    if (body.datosGenerales && typeof body.datosGenerales === "object") {
      const dg = body.datosGenerales;

      if (hasOwn(dg, "fechaNacimiento")) {
        if (cleanStr(dg.fechaNacimiento)) {
          const fecha = fechaDesdeInput(dg.fechaNacimiento);
          if (fecha === "__INVALID__") {
            return res.status(400).json({ ok: false, msg: "fechaNacimiento invalida" });
          }
          set["datosGenerales.fechaNacimiento"] = fecha;
        } else {
          unset["datosGenerales.fechaNacimiento"] = 1;
        }
      }

      if (hasOwn(dg, "sexo")) {
        const sexo = cleanStr(dg.sexo) || "NoEspecifica";
        if (!SEXOS_VALIDOS.includes(sexo)) {
          return res.status(400).json({ ok: false, msg: "sexo invalido" });
        }
        set["datosGenerales.sexo"] = sexo;
      }

      if (hasOwn(dg, "curp")) {
        const curp = normUpper(dg.curp);
        if (curp) set["datosGenerales.curp"] = curp;
        else unset["datosGenerales.curp"] = 1;
      }

      setStringIfPresent(dg, "entidadNacimiento", "datosGenerales.entidadNacimiento", set, normUpper);
      setStringIfPresent(dg, "ocupacion", "datosGenerales.ocupacion", set);
      setStringIfPresent(dg, "escolaridad", "datosGenerales.escolaridad", set);
    }

    if (body.contacto && typeof body.contacto === "object") {
      const contacto = body.contacto;
      setStringIfPresent(contacto, "telefono", "contacto.telefono", set);
      setStringIfPresent(contacto, "email", "contacto.email", set, (v) => cleanStr(v).toLowerCase());
      setStringIfPresent(contacto, "direccion", "contacto.direccion", set);

      if (contacto.emergencia && typeof contacto.emergencia === "object") {
        const emergencia = contacto.emergencia;
        setStringIfPresent(emergencia, "nombre", "contacto.emergencia.nombre", set);
        setStringIfPresent(emergencia, "telefono", "contacto.emergencia.telefono", set);
        setStringIfPresent(emergencia, "parentesco", "contacto.emergencia.parentesco", set);
      }
    }

    const hayCamposPermitidos = Object.keys(set).length > 0 || Object.keys(unset).length > 0;
    if (!hayCamposPermitidos) {
      return res.status(400).json({ ok: false, msg: "No hay campos permitidos para actualizar" });
    }

    const actual = await Paciente.findById(id)
      .select("nombre apPaterno apMaterno")
      .lean();

    if (!actual) {
      return res.status(404).json({ ok: false, msg: "Paciente no encontrado" });
    }

    if (hasOwn(set, "nombre") || hasOwn(set, "apPaterno") || hasOwn(set, "apMaterno")) {
      set.nombreCompletoNorm = buildNombreCompletoNorm(actual, set);
    }

    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;

    const paciente = await Paciente.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .select(pacienteListaSelect)
      .populate("farmaciasVinculadas", "nombre direccion telefono")
      .lean();

    return res.json({ ok: true, paciente });
  } catch (err) {
    console.error("[adminPacientes][actualizarPaciente]", err);
    return res.status(500).json({ ok: false, msg: "Error al actualizar paciente" });
  }
};

exports.eliminarPaciente = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, msg: "ID invalido" });
    }

    const paciente = await Paciente.findByIdAndDelete(id).select("_id").lean();
    if (!paciente) {
      return res.status(404).json({ ok: false, msg: "Paciente no encontrado" });
    }

    return res.json({ ok: true, eliminado: true, id });
  } catch (err) {
    console.error("[adminPacientes][eliminarPaciente]", err);
    return res.status(500).json({ ok: false, msg: "Error al eliminar paciente" });
  }
};

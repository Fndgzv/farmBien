const mongoose = require("mongoose");
const Laboratorio = require("../models/Laboratorio");

const escapeRegExp = (valor = "") => String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function limpiarNombre(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

exports.obtenerLaboratorios = async (req, res) => {
  try {
    const laboratorio = limpiarNombre(req.query?.laboratorio);
    const tipoBusqueda = req.query?.tipoBusqueda === "comienza" ? "comienza" : "incluye";
    const filtro = {};

    if (laboratorio) {
      const normalizado = Laboratorio.normalizarLaboratorio(laboratorio);
      const patron = tipoBusqueda === "comienza"
        ? `^${escapeRegExp(normalizado)}`
        : escapeRegExp(normalizado);

      filtro.laboratorioNorm = { $regex: patron };
    }

    const laboratorios = await Laboratorio.find(filtro)
      .sort({ laboratorioNorm: 1 })
      .lean();

    return res.json(laboratorios);
  } catch (error) {
    console.error("[laboratorios][obtener]", error);
    return res.status(500).json({ mensaje: "Error al obtener laboratorios" });
  }
};

exports.crearLaboratorio = async (req, res) => {
  try {
    const laboratorio = limpiarNombre(req.body?.laboratorio);
    const laboratorioNorm = Laboratorio.normalizarLaboratorio(laboratorio);

    if (!laboratorio || !laboratorioNorm) {
      return res.status(400).json({ mensaje: "El laboratorio es obligatorio." });
    }

    const duplicado = await Laboratorio.findOne({ laboratorioNorm }).lean();
    if (duplicado) {
      return res.status(409).json({ mensaje: "Ya existe un laboratorio con ese nombre." });
    }

    const nuevoLaboratorio = await Laboratorio.create({ laboratorio });
    return res.status(201).json({
      mensaje: "Laboratorio creado correctamente",
      laboratorio: nuevoLaboratorio,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ mensaje: "Ya existe un laboratorio con ese nombre." });
    }

    console.error("[laboratorios][crear]", error);
    return res.status(500).json({ mensaje: "Error al crear laboratorio" });
  }
};

exports.actualizarLaboratorio = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ mensaje: "ID de laboratorio invalido." });
    }

    const laboratorio = limpiarNombre(req.body?.laboratorio);
    const laboratorioNorm = Laboratorio.normalizarLaboratorio(laboratorio);

    if (!laboratorio || !laboratorioNorm) {
      return res.status(400).json({ mensaje: "El laboratorio es obligatorio." });
    }

    const duplicado = await Laboratorio.findOne({
      _id: { $ne: id },
      laboratorioNorm,
    }).lean();

    if (duplicado) {
      return res.status(409).json({ mensaje: "Ya existe un laboratorio con ese nombre." });
    }

    const laboratorioActual = await Laboratorio.findById(id);
    if (!laboratorioActual) {
      return res.status(404).json({ mensaje: "Laboratorio no encontrado." });
    }

    laboratorioActual.laboratorio = laboratorio;
    await laboratorioActual.save();

    return res.json({
      mensaje: "Laboratorio actualizado correctamente",
      laboratorio: laboratorioActual,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ mensaje: "Ya existe un laboratorio con ese nombre." });
    }

    console.error("[laboratorios][actualizar]", error);
    return res.status(500).json({ mensaje: "Error al actualizar laboratorio" });
  }
};

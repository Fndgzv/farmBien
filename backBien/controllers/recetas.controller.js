const mongoose = require("mongoose");
const Receta = require("../models/Receta");
const Paciente = require("../models/Paciente");

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromHeader || fromUser;
  if (!farmaciaId) return null;
  return String(farmaciaId);
}

exports.crear = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const medicoId = req.usuario?._id;
    if (!medicoId) return res.status(401).json({ msg: "Usuario no válido" });

    const {
      pacienteId,
      motivoConsulta,
      diagnosticos = [],
      observaciones,
      medicamentos = [],
      indicacionesGenerales,
      citaSeguimiento,
      // opcional
      ventaId
    } = req.body;

    if (!pacienteId || !mongoose.isValidObjectId(pacienteId)) {
      return res.status(400).json({ msg: "pacienteId inválido" });
    }

    // Verifica paciente existe
    const paciente = await Paciente.findById(pacienteId).select("_id nombre apellidos").lean();
    if (!paciente) return res.status(404).json({ msg: "Paciente no encontrado" });

    // Crea receta
    const receta = await Receta.create({
      fecha: new Date(),
      pacienteId,
      medicoId,
      farmaciaId,
      motivoConsulta: (motivoConsulta || "").trim(),
      diagnosticos: Array.isArray(diagnosticos) ? diagnosticos.map(d => String(d).trim()).filter(Boolean) : [],
      observaciones: (observaciones || "").trim(),
      medicamentos,
      indicacionesGenerales: (indicacionesGenerales || "").trim(),
      citaSeguimiento: citaSeguimiento || null,
      ventaId: ventaId || undefined,
      creadaPor: medicoId,
    });

    // Vincula en paciente (y guarda resumen rápido)
    const diagPrincipal = Array.isArray(diagnosticos) && diagnosticos.length ? String(diagnosticos[0]).trim() : "";

    await Paciente.findByIdAndUpdate(
      pacienteId,
      {
        $addToSet: { recetas: receta._id },
        $push: {
          ultimasRecetas: {
            $each: [{
              recetaId: receta._id,
              fecha: receta.fecha,
              medicoId,
              diagnosticoPrincipal: diagPrincipal
            }],
            $position: 0,
            $slice: 10
          }
        }
      }
    );

    return res.status(201).json({ ok: true, receta });
  } catch (err) {
    console.error("crear receta:", err);
    return res.status(500).json({ msg: "Error al crear receta" });
  }
};

exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: "ID inválido" });

    const receta = await Receta.findById(id)
      .populate("pacienteId", "nombre apellidos contacto.telefono datosGenerales.curp")
      .populate("medicoId", "nombre")
      .populate("farmaciaId", "nombre direccion telefono")
      .lean();

    if (!receta) return res.status(404).json({ msg: "Receta no encontrada" });

    return res.json({ ok: true, receta });
  } catch (err) {
    console.error("obtener receta:", err);
    return res.status(500).json({ msg: "Error al obtener receta" });
  }
};

exports.listarPorPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    if (!mongoose.isValidObjectId(pacienteId)) return res.status(400).json({ msg: "pacienteId inválido" });

    const recetas = await Receta.find({ pacienteId, estado: "activa" })
      .sort({ fecha: -1 })
      .limit(50)
      .lean();

    return res.json({ ok: true, recetas });
  } catch (err) {
    console.error("listarPorPaciente:", err);
    return res.status(500).json({ msg: "Error al listar recetas" });
  }
};

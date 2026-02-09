// backBien\controllers\recetas.controller.js
const mongoose = require("mongoose");
const Receta = require("../models/Receta");
const Paciente = require("../models/Paciente");
const Farmacia = require("../models/Farmacia");
const Usuario = require("../models/Usuario");

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromHeader || fromUser;
  return farmaciaId ? String(farmaciaId) : null;
}

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromHeader || fromUser;
  return farmaciaId ? String(farmaciaId) : null;
}

exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const receta = await Receta.findOne({ _id: id, farmaciaId })
      .populate({ path: "pacienteId", select: "nombre apellidos contacto datosGenerales" })
      .populate({ path: "medicoId", select: "nombre apellidos cedula titulo1 titulo2" })
      .populate({ path: "farmaciaId", select: "nombre titulo1 titulo2 direccion telefono imagen" })
      .populate({ path: "medicamentos.productoId", select: "nombre ingreActivo codigoBarras" })
      .lean();

    if (!receta) return res.status(404).json({ msg: "Receta no encontrada" });

    const pacienteId = receta?.pacienteId?._id || receta?.pacienteId;

    let extraPaciente = { alergias: [], ultimoSV: null };

    if (pacienteId) {
      const p = await Paciente.findById(pacienteId)
        .select("antecedentes signosVitales")
        .lean();

      extraPaciente.alergias = p?.antecedentes?.alergias || [];

      // ✅ como se guarda con $position:0, el más reciente queda en [0]
      extraPaciente.ultimoSV =
        Array.isArray(p?.signosVitales) && p.signosVitales.length ? p.signosVitales[0] : null;
    }

    return res.json({ ok: true, receta, extraPaciente });
  } catch (err) {
    console.error("obtenerPorId receta:", err);
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


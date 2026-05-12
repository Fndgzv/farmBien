// backBien/controllers/recetas.controller.js
const mongoose = require("mongoose");
const Receta = require("../models/Receta");
const Paciente = require("../models/Paciente");

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromHeader || fromUser;
  return farmaciaId ? String(farmaciaId) : null;
}

const cleanStr = (value) => String(value || "").trim();

const cleanArr = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanStr(item)).filter(Boolean);
};

const toObjectIdOrNull = (value) => {
  const raw = cleanStr(value);
  if (!raw) return null;
  if (!mongoose.isValidObjectId(raw)) return "__INVALID__";
  return new mongoose.Types.ObjectId(raw);
};

async function upsertResumenRecetaPaciente({
  pacienteId,
  recetaId,
  fecha,
  medicoId,
  diagnosticoPrincipal,
  fichaConsultorioId,
}) {
  await Paciente.findByIdAndUpdate(pacienteId, {
    $addToSet: { recetas: recetaId },
  });

  const updateExisting = await Paciente.updateOne(
    { _id: pacienteId, "ultimasRecetas.recetaId": recetaId },
    {
      $set: {
        "ultimasRecetas.$.fecha": fecha,
        "ultimasRecetas.$.medicoId": medicoId,
        "ultimasRecetas.$.diagnosticoPrincipal": diagnosticoPrincipal,
        ...(fichaConsultorioId ? { "ultimasRecetas.$.fichaConsultorioId": fichaConsultorioId } : {}),
      },
    }
  );

  if (updateExisting?.matchedCount) return;

  await Paciente.findByIdAndUpdate(
    pacienteId,
    {
      $push: {
        ultimasRecetas: {
          $each: [{
            recetaId,
            fichaConsultorioId: fichaConsultorioId || undefined,
            fecha,
            medicoId,
            diagnosticoPrincipal,
          }],
          $position: 0,
          $slice: 10,
        },
      },
    }
  );
}

exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const receta = await Receta.findOne({ _id: id, farmaciaId })
      .populate({ path: "pacienteId", select: "nombre apPaterno apMaterno contacto datosGenerales" })
      .populate({ path: "medicoId", select: "nombre cedulaProfesional titulo escuela" })
      .populate({ path: "farmaciaId", select: "nombre titulo1 titulo2 direccion telefono imagen" })
      .populate({ path: "medicamentos.productoId", select: "nombre ingreActivo codigoBarras categoria" })
      .lean();

    if (!receta) return res.status(404).json({ msg: "Receta no encontrada" });

    const pacienteId = receta?.pacienteId?._id || receta?.pacienteId;
    const fichaConsultorioId = cleanStr(receta?.fichaConsultorioId);

    let extraPaciente = { alergias: [], ultimoSV: null };

    if (pacienteId) {
      const p = await Paciente.findById(pacienteId)
        .select("antecedentes signosVitales")
        .lean();

      const alergiasReceta = cleanArr(receta?.alergias);
      const alergiasPaciente = cleanArr(p?.antecedentes?.alergias);
      extraPaciente.alergias = alergiasReceta.length ? alergiasReceta : alergiasPaciente;

      const signos = Array.isArray(p?.signosVitales) ? p.signosVitales : [];
      let signoFicha = null;

      if (fichaConsultorioId) {
        const candidatos = signos
          .filter((sv) => cleanStr(sv?.fichaConsultorioId) === fichaConsultorioId)
          .sort((a, b) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime());
        signoFicha = candidatos[0] || null;
      }

      // compatibilidad con historico sin fichaConsultorioId
      extraPaciente.ultimoSV = signoFicha || (signos.length ? signos[0] : null);
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
    if (!mongoose.isValidObjectId(pacienteId)) return res.status(400).json({ msg: "pacienteId invalido" });

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
    if (!medicoId) return res.status(401).json({ msg: "Usuario no valido" });

    const {
      pacienteId,
      diagnosticos = [],
      observaciones,
      medicamentos = [],
      indicacionesGenerales,
      citaSeguimiento,
      alergias = [],
      fichaConsultorioId: fichaConsultorioIdRaw,
      recetaId: recetaIdRaw,
      // opcional
      ventaId,
    } = req.body || {};

    if (!pacienteId || !mongoose.isValidObjectId(pacienteId)) {
      return res.status(400).json({ msg: "pacienteId invalido" });
    }

    const paciente = await Paciente.findById(pacienteId).select("_id").lean();
    if (!paciente) return res.status(404).json({ msg: "Paciente no encontrado" });

    const fichaConsultorioId = toObjectIdOrNull(fichaConsultorioIdRaw);
    if (fichaConsultorioId === "__INVALID__") {
      return res.status(400).json({ msg: "fichaConsultorioId invalido" });
    }

    const recetaId = toObjectIdOrNull(recetaIdRaw);
    if (recetaId === "__INVALID__") {
      return res.status(400).json({ msg: "recetaId invalido" });
    }

    const diagnosticosNormalizados = cleanArr(diagnosticos);
    const recetaPayload = {
      fecha: new Date(),
      pacienteId,
      fichaConsultorioId: fichaConsultorioId || undefined,
      medicoId,
      farmaciaId,
      diagnosticos: diagnosticosNormalizados,
      alergias: cleanArr(alergias),
      observaciones: cleanStr(observaciones),
      medicamentos: Array.isArray(medicamentos) ? medicamentos : [],
      indicacionesGenerales: cleanStr(indicacionesGenerales),
      citaSeguimiento: citaSeguimiento || null,
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "ventaId")
        ? { ventaId: ventaId || null }
        : {}),
    };

    let recetaExistente = null;

    if (recetaId) {
      recetaExistente = await Receta.findOne({
        _id: recetaId,
        pacienteId,
        farmaciaId,
      }).lean();
    }

    if (!recetaExistente && fichaConsultorioId) {
      recetaExistente = await Receta.findOne({
        pacienteId,
        farmaciaId,
        fichaConsultorioId,
        estado: "activa",
      })
        .sort({ fecha: -1 })
        .lean();
    }

    let receta = null;
    let creado = false;

    if (recetaExistente?._id) {
      receta = await Receta.findByIdAndUpdate(
        recetaExistente._id,
        { $set: recetaPayload },
        { new: true, runValidators: true }
      ).lean();
    } else {
      receta = await Receta.create({
        ...recetaPayload,
        creadaPor: medicoId,
      });
      creado = true;
    }

    const diagnosticoPrincipal = diagnosticosNormalizados.length
      ? diagnosticosNormalizados[0]
      : "";

    await upsertResumenRecetaPaciente({
      pacienteId,
      recetaId: receta._id,
      fecha: receta.fecha,
      medicoId,
      diagnosticoPrincipal,
      fichaConsultorioId: fichaConsultorioId || undefined,
    });

    return res.status(creado ? 201 : 200).json({
      ok: true,
      receta,
      creado,
      actualizado: !creado,
    });
  } catch (err) {
    console.error("crear receta:", err);
    return res.status(500).json({ msg: "Error al crear receta" });
  }
};

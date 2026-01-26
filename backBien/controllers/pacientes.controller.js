// backBien\controllers\pacientes.controller.js
const mongoose = require("mongoose");
const Paciente = require("../models/Paciente");

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromHeader || fromUser;
  return farmaciaId ? String(farmaciaId) : null;
}

const norm = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();

exports.buscar = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ msg: "Falta q" });

    // 1) si parece CURP (>= 10 chars), buscamos exacto
    const qUp = q.toUpperCase();

    // busca por CURP
    const byCurp = await Paciente.findOne({ "datosGenerales.curp": qUp })
      .select("nombre apellidos contacto.telefono datosGenerales.curp")
      .lean();

    if (byCurp) return res.json({ ok: true, paciente: byCurp });

    // 2) búsqueda por nombre (normalizado) limitada
    const qNorm = norm(q);

    const pacientes = await Paciente.find({
      activo: true,
      // opcional: si quieres filtrar por farmacia vinculada
      // farmaciasVinculadas: farmaciaId,
      nombreCompletoNorm: { $regex: qNorm, $options: "i" },
    })
      .limit(20)
      .select("nombre apellidos contacto.telefono datosGenerales.curp")
      .lean();

    return res.json({ ok: true, pacientes });
  } catch (err) {
    console.error("buscarPaciente:", err);
    return res.status(500).json({ msg: "Error al buscar paciente" });
  }
};

exports.crearBasico = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    const { nombre, apellidos = "", telefono = "", curp = "" } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ msg: "nombre es requerido" });

    const curpUp = curp ? String(curp).trim().toUpperCase() : "";

    if (curpUp) {
      const existe = await Paciente.findOne({ "datosGenerales.curp": curpUp });
      if (existe) return res.json({ ok: true, paciente: existe, yaExistia: true });
    }

    const paciente = await Paciente.create({
      nombre: nombre.trim(),
      apellidos: apellidos.trim(),
      contacto: { telefono: telefono.trim() },
      datosGenerales: { curp: curpUp || undefined },
      farmaciasVinculadas: farmaciaId ? [farmaciaId] : [],
      antecedentes: {},
      signosVitales: [],
      notasClinicas: [],
      recetas: [],
      ultimasRecetas: [],
      activo: true,
    });

    return res.json({ ok: true, paciente });
  } catch (err) {
    console.error("crearPacienteBasico:", err);
    if (err?.code === 11000) return res.status(400).json({ msg: "Ya existe un paciente con ese CURP" });
    return res.status(500).json({ msg: "Error al crear paciente" });
  }
};

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;
  const fromHeader = req.headers["x-farmacia-id"];
  const farmaciaId = fromHeader || fromUser;
  return farmaciaId ? String(farmaciaId) : null;
}

exports.obtenerExpediente = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: "ID inválido" });

    const p = await Paciente.findById(id)
      .select("nombre apellidos contacto datosGenerales antecedentes signosVitales notasClinicas ultimasRecetas activo")
      .lean();

    if (!p) return res.status(404).json({ msg: "Paciente no encontrado" });

    // ✅ últimos signos vitales (últimos 5)
    const sv = Array.isArray(p.signosVitales) ? [...p.signosVitales] : [];
    sv.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    const signosVitalesRecientes = sv.slice(0, 5);

    // ✅ últimas notas clínicas (últimas 5)
    const nc = Array.isArray(p.notasClinicas) ? [...p.notasClinicas] : [];
    nc.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    const notasClinicasRecientes = nc.slice(0, 5);

    return res.json({
      ok: true,
      paciente: {
        _id: p._id,
        nombre: p.nombre,
        apellidos: p.apellidos,
        contacto: p.contacto,
        datosGenerales: p.datosGenerales,
        antecedentes: p.antecedentes,
        activo: p.activo,
      },
      signosVitalesRecientes,
      notasClinicasRecientes,
      ultimasRecetas: p.ultimasRecetas || [],
    });
  } catch (err) {
    console.error("obtenerExpediente:", err);
    return res.status(500).json({ msg: "Error al obtener expediente" });
  }
};

exports.agregarSignosVitales = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    const medicoId = req.usuario?._id;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: "ID inválido" });

    const body = req.body || {};

    // cálculo simple IMC si vienen peso/talla
    const pesoKg = body.pesoKg != null ? Number(body.pesoKg) : null;
    const tallaCm = body.tallaCm != null ? Number(body.tallaCm) : null;
    let imc = body.imc != null ? Number(body.imc) : null;
    if ((pesoKg && tallaCm) && !imc) {
      const m = tallaCm / 100;
      imc = m > 0 ? +(pesoKg / (m * m)).toFixed(2) : null;
    }

    const sv = {
      fecha: new Date(),
      pesoKg: pesoKg ?? undefined,
      tallaCm: tallaCm ?? undefined,
      imc: imc ?? undefined,
      temperatura: body.temperatura ?? undefined,
      presionSis: body.presionSis ?? undefined,
      presionDia: body.presionDia ?? undefined,
      fc: body.fc ?? undefined,
      fr: body.fr ?? undefined,
      spo2: body.spo2 ?? undefined,
      glucosaCapilar: body.glucosaCapilar ?? undefined,
      notas: (body.notas || "").trim(),
      tomadoPor: medicoId,
      farmaciaId: farmaciaId || undefined,
    };

    const paciente = await Paciente.findByIdAndUpdate(
      id,
      { $push: { signosVitales: { $each: [sv], $position: 0, $slice: 50 } } }, // guarda últimos 50
      { new: true }
    ).select("_id");

    if (!paciente) return res.status(404).json({ msg: "Paciente no encontrado" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("agregarSignosVitales:", err);
    return res.status(500).json({ msg: "Error al guardar signos vitales" });
  }
}

  exports.agregarNotaClinica = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    const medicoId = req.usuario?._id;

    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: "ID inválido" });
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const {
      motivoConsulta,
      padecimientoActual,
      exploracionFisica,
      diagnosticos = [],
      plan,
    } = req.body || {};

    const nota = {
      fecha: new Date(),
      motivoConsulta: (motivoConsulta || "").trim(),
      padecimientoActual: (padecimientoActual || "").trim(),
      exploracionFisica: (exploracionFisica || "").trim(),
      diagnosticos: Array.isArray(diagnosticos) ? diagnosticos.map(x => String(x).trim()).filter(Boolean) : [],
      plan: (plan || "").trim(),
      medicoId,
      farmaciaId,
    };

    const paciente = await Paciente.findByIdAndUpdate(
      id,
      { $push: { notasClinicas: { $each: [nota], $position: 0, $slice: 50 } } },
      { new: true }
    ).select("_id");

    if (!paciente) return res.status(404).json({ msg: "Paciente no encontrado" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("agregarNotaClinica:", err);
    return res.status(500).json({ msg: "Error al guardar nota clínica" });
  }
};


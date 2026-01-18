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

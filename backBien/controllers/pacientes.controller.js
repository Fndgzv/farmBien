// backBien/controllers/pacientes.controller.js
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const normLower = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function soloLetras(s = "") {
  return norm(s).replace(/[^A-ZÑ\s]/g, "").trim();
}

function primeraVocalInterna(str = "") {
  const s = soloLetras(str).slice(1);
  const m = s.match(/[AEIOU]/);
  return m ? m[0] : "X";
}

function primeraConsonanteInterna(str = "") {
  const s = soloLetras(str).slice(1);
  const m = s.match(/[BCDFGHJKLMNÑPQRSTVWXYZ]/);
  return m ? m[0] : "X";
}

function primerNombreUsable(nombre = "") {
  const partes = soloLetras(nombre).split(/\s+/).filter(Boolean);
  if (partes.length >= 2 && ["JOSE", "MARIA", "MA"].includes(partes[0])) {
    return partes[1];
  }
  return partes[0] || "X";
}

function fechaYYMMDD(fechaNacimiento) {
  const d = new Date(fechaNacimiento);
  if (isNaN(d.getTime())) return null;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// Claves CURP de entidad
const ENTIDADES_CURP = {
  AGUASCALIENTES: "AS",
  "BAJA CALIFORNIA": "BC",
  "BAJA CALIFORNIA SUR": "BS",
  CAMPECHE: "CC",
  COAHUILA: "CL",
  COLIMA: "CM",
  CHIAPAS: "CS",
  CHIHUAHUA: "CH",
  "CIUDAD DE MEXICO": "DF",
  DURANGO: "DG",
  GUANAJUATO: "GT",
  GUERRERO: "GR",
  HIDALGO: "HG",
  JALISCO: "JC",
  MEXICO: "MC",
  MICHOACAN: "MN",
  MORELOS: "MS",
  NAYARIT: "NT",
  "NUEVO LEON": "NL",
  OAXACA: "OC",
  PUEBLA: "PL",
  QUERETARO: "QT",
  "QUINTANA ROO": "QR",
  "SAN LUIS POTOSI": "SP",
  SINALOA: "SL",
  SONORA: "SR",
  TABASCO: "TC",
  TAMAULIPAS: "TS",
  TLAXCALA: "TL",
  VERACRUZ: "VZ",
  YUCATAN: "YN",
  ZACATECAS: "ZS",
  EXTRANJERO: "NE",
};

function sexoCURP(sexo = "") {
  // Tu frontend usa M/F para sexo biológico en paciente
  // CURP usa H = hombre, M = mujer
  if (sexo === "M") return "H";
  if (sexo === "F") return "M";
  return "X";
}

function entidadCURP(entidadNacimiento = "") {
  const key = soloLetras(entidadNacimiento);
  return ENTIDADES_CURP[key] || (/^[A-Z]{2}$/.test(key) ? key : "NE");
}

function generarCurpProvisional({
  nombre,
  apPaterno,
  apMaterno,
  fechaNacimiento,
  sexo,
  entidadNacimiento
}) {
  const n = primerNombreUsable(nombre);
  const ap = soloLetras(apPaterno || "X");
  const am = soloLetras(apMaterno || "X");

  const p1 = ap[0] || "X";
  const p2 = primeraVocalInterna(ap);
  const p3 = am[0] || "X";
  const p4 = n[0] || "X";

  const fecha = fechaYYMMDD(fechaNacimiento);
  if (!fecha) return null;

  const sx = sexoCURP(sexo);
  const ent = entidadCURP(entidadNacimiento);

  const c1 = primeraConsonanteInterna(ap);
  const c2 = primeraConsonanteInterna(am);
  const c3 = primeraConsonanteInterna(n);

  // CURP provisional interna
  return `${p1}${p2}${p3}${p4}${fecha}${sx}${ent}${c1}${c2}${c3}00`;
}

const SEXOS_VALIDOS = ["M", "F", "Otro", "NoEspecifica"];
const TABAQUISMO_VALIDO = ["No", "Si", "Ex"];
const ALCOHOL_VALIDO = ["No", "Si", "Ocasional"];

const cleanStr = (v) => String(v ?? "").trim();

const cleanArr = (v) => {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => cleanStr(item))
    .filter(Boolean);
};

function buildAntecedentesDoc(antRaw = {}) {
  const tabaquismo = cleanStr(antRaw?.tabaquismo);
  const alcohol = cleanStr(antRaw?.alcohol);

  return {
    alergias: cleanArr(antRaw?.alergias),
    enfermedadesCronicas: cleanArr(antRaw?.enfermedadesCronicas),
    cirugiasPrevias: cleanArr(antRaw?.cirugiasPrevias),
    medicamentosActuales: cleanArr(antRaw?.medicamentosActuales),
    antecedentesFamiliares: cleanArr(antRaw?.antecedentesFamiliares),
    tabaquismo: TABAQUISMO_VALIDO.includes(tabaquismo) ? tabaquismo : "No",
    alcohol: ALCOHOL_VALIDO.includes(alcohol) ? alcohol : "No",
  };
}

exports.buscar = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ msg: "Falta q" });

    const qUp = norm(q);

    // 1) CURP exacta
    const byCurp = await Paciente.findOne({
      activo: true,
      "datosGenerales.curp": qUp
    })
      .select("nombre apPaterno apMaterno contacto.telefono contacto.email datosGenerales.curp datosGenerales.curpEsProvisional datosGenerales.fechaNacimiento datosGenerales.sexo datosGenerales.entidadNacimiento")
      .lean();

    if (byCurp) return res.json({ ok: true, paciente: byCurp });

    // 2) búsqueda por nombre completo normalizado
    const qNorm = normLower(q);

    const pacientes = await Paciente.find({
      activo: true,
      nombreCompletoNorm: { $regex: qNorm, $options: "i" },
    })
      .limit(20)
      .select("nombre apPaterno apMaterno contacto.telefono contacto.email datosGenerales.curp datosGenerales.curpEsProvisional datosGenerales.fechaNacimiento datosGenerales.sexo datosGenerales.entidadNacimiento")
      .lean();

    return res.json({ ok: true, pacientes });
  } catch (err) {
    console.error("buscarPaciente:", err);
    return res.status(500).json({ msg: "Error al buscar paciente" });
  }
};

exports.crearConsultorio = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);

    const {
      nombre,
      apPaterno,
      apMaterno = "",
      telefono = "",
      fechaNacimiento,
      sexo = "NoEspecifica",
      entidadNacimiento = "",
      curp = "",
      generarCurp = false,
    } = req.body || {};

    const nombreTxt = String(nombre || "").trim();
    const apPatTxt = String(apPaterno || "").trim();
    const apMatTxt = String(apMaterno || "").trim();
    const telTxt = String(telefono || "").trim();
    const curpManual = norm(curp);

    if (!nombreTxt) {
      return res.status(400).json({ msg: "nombre es requerido" });
    }

    if (!apPatTxt) {
      return res.status(400).json({ msg: "apPaterno es requerido" });
    }

    let curpFinal = curpManual;
    let curpEsProvisional = false;
    const entidadFinal = entidadCURP(entidadNacimiento);

    if (!curpFinal) {
      if (!fechaNacimiento) {
        return res.status(400).json({ msg: "fechaNacimiento es requerida para generar CURP provisional" });
      }
      if (!sexo || sexo === "NoEspecifica") {
        return res.status(400).json({ msg: "sexo es requerido para generar CURP provisional" });
      }
      if (!entidadNacimiento) {
        return res.status(400).json({ msg: "entidadNacimiento es requerida para generar CURP provisional" });
      }
      if (!generarCurp) {
        return res.status(400).json({ msg: "Debes proporcionar CURP o solicitar generación provisional" });
      }

      curpFinal = generarCurpProvisional({
        nombre: nombreTxt,
        apPaterno: apPatTxt,
        apMaterno: apMatTxt,
        fechaNacimiento,
        sexo,
        entidadNacimiento,
      });

      if (!curpFinal) {
        return res.status(400).json({ msg: "No se pudo generar CURP provisional" });
      }

      curpEsProvisional = true;
    }

    const existe = await Paciente.findOne({
      "datosGenerales.curp": curpFinal
    })
      .select("_id nombre apPaterno apMaterno datosGenerales.curp")
      .lean();

    if (existe) {
      return res.json({ ok: true, paciente: existe, yaExistia: true });
    }

    const paciente = await Paciente.create({
      nombre: nombreTxt,
      apPaterno: apPatTxt,
      apMaterno: apMatTxt,
      contacto: {
        telefono: telTxt
      },
      datosGenerales: {
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : undefined,
        sexo,
        curp: curpFinal,
        curpEsProvisional,
        entidadNacimiento: entidadFinal,
      },
      farmaciasVinculadas: farmaciaId ? [farmaciaId] : [],
      antecedentes: {},
      signosVitales: [],
      notasClinicas: [],
      recetas: [],
      ultimasRecetas: [],
      activo: true,
    });

    return res.json({ ok: true, paciente, yaExistia: false });
  } catch (err) {
    console.error("crearPacienteConsultorio:", err);
    if (err?.code === 11000) {
      return res.status(400).json({ msg: "Ya existe un paciente con ese CURP" });
    }
    return res.status(500).json({ msg: "Error al crear paciente" });
  }
};

exports.obtenerExpediente = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ msg: "ID inválido" });
    }

    const p = await Paciente.findById(id)
      .select("nombre apPaterno apMaterno contacto datosGenerales antecedentes signosVitales notasClinicas ultimasRecetas activo")
      .lean();

    if (!p) return res.status(404).json({ msg: "Paciente no encontrado" });

    const sv = Array.isArray(p.signosVitales) ? [...p.signosVitales] : [];
    sv.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    const signosVitalesRecientes = sv.slice(0, 5);

    const nc = Array.isArray(p.notasClinicas) ? [...p.notasClinicas] : [];
    nc.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    const notasClinicasRecientes = nc.slice(0, 5);

    return res.json({
      ok: true,
      paciente: {
        _id: p._id,
        nombre: p.nombre,
        apPaterno: p.apPaterno,
        apMaterno: p.apMaterno,
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
      tomadoPor: medicoId,
      farmaciaId: farmaciaId || undefined,
    };

    const paciente = await Paciente.findByIdAndUpdate(
      id,
      { $push: { signosVitales: { $each: [sv], $position: 0, $slice: 50 } } },
      { new: true }
    ).select("_id");

    if (!paciente) return res.status(404).json({ msg: "Paciente no encontrado" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("agregarSignosVitales:", err);
    return res.status(500).json({ msg: "Error al guardar signos vitales" });
  }
};

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

exports.actualizarPaciente = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ msg: "ID inválido" });
    }

    const body = req.body || {};
    const set = {};
    const unset = {};

    const actual = await Paciente.findById(id)
      .select("nombre apPaterno apMaterno contacto datosGenerales antecedentes activo")
      .lean();

    if (!actual) {
      return res.status(404).json({ msg: "Paciente no encontrado" });
    }

    if (Object.prototype.hasOwnProperty.call(body, "nombre")) {
      const nombre = cleanStr(body.nombre);
      if (!nombre) return res.status(400).json({ msg: "nombre es requerido" });
      set["nombre"] = nombre;
    }

    if (Object.prototype.hasOwnProperty.call(body, "apPaterno")) {
      const apPaterno = cleanStr(body.apPaterno);
      if (!apPaterno) return res.status(400).json({ msg: "apPaterno es requerido" });
      set["apPaterno"] = apPaterno;
    }

    if (Object.prototype.hasOwnProperty.call(body, "apMaterno")) {
      set["apMaterno"] = cleanStr(body.apMaterno);
    }

    if (body.contacto && typeof body.contacto === "object") {
      const c = body.contacto;

      if (Object.prototype.hasOwnProperty.call(c, "telefono")) {
        set["contacto.telefono"] = cleanStr(c.telefono);
      }
      if (Object.prototype.hasOwnProperty.call(c, "email")) {
        set["contacto.email"] = cleanStr(c.email).toLowerCase();
      }
      if (Object.prototype.hasOwnProperty.call(c, "direccion")) {
        set["contacto.direccion"] = cleanStr(c.direccion);
      }

      if (c.emergencia && typeof c.emergencia === "object") {
        const e = c.emergencia;
        if (Object.prototype.hasOwnProperty.call(e, "nombre")) {
          set["contacto.emergencia.nombre"] = cleanStr(e.nombre);
        }
        if (Object.prototype.hasOwnProperty.call(e, "telefono")) {
          set["contacto.emergencia.telefono"] = cleanStr(e.telefono);
        }
        if (Object.prototype.hasOwnProperty.call(e, "parentesco")) {
          set["contacto.emergencia.parentesco"] = cleanStr(e.parentesco);
        }
      }
    }

    if (body.datosGenerales && typeof body.datosGenerales === "object") {
      const dg = body.datosGenerales;

      if (Object.prototype.hasOwnProperty.call(dg, "fechaNacimiento")) {
        if (dg.fechaNacimiento) {
          const fecha = new Date(dg.fechaNacimiento);
          if (isNaN(fecha.getTime())) {
            return res.status(400).json({ msg: "fechaNacimiento inválida" });
          }
          set["datosGenerales.fechaNacimiento"] = fecha;
        } else {
          unset["datosGenerales.fechaNacimiento"] = 1;
        }
      }

      if (Object.prototype.hasOwnProperty.call(dg, "sexo")) {
        const sexo = cleanStr(dg.sexo) || "NoEspecifica";
        if (!SEXOS_VALIDOS.includes(sexo)) {
          return res.status(400).json({ msg: "sexo inválido" });
        }
        set["datosGenerales.sexo"] = sexo;
      }

      if (Object.prototype.hasOwnProperty.call(dg, "curp")) {
        const curp = norm(dg.curp);
        if (curp) {
          set["datosGenerales.curp"] = curp;
        } else {
          unset["datosGenerales.curp"] = 1;
        }
      }

      if (Object.prototype.hasOwnProperty.call(dg, "curpEsProvisional")) {
        set["datosGenerales.curpEsProvisional"] = !!dg.curpEsProvisional;
      }

      if (Object.prototype.hasOwnProperty.call(dg, "entidadNacimiento")) {
        const entidadNacimiento = cleanStr(dg.entidadNacimiento);
        set["datosGenerales.entidadNacimiento"] = entidadNacimiento ? entidadCURP(entidadNacimiento) : "";
      }

      if (Object.prototype.hasOwnProperty.call(dg, "ocupacion")) {
        set["datosGenerales.ocupacion"] = cleanStr(dg.ocupacion);
      }

      if (Object.prototype.hasOwnProperty.call(dg, "escolaridad")) {
        set["datosGenerales.escolaridad"] = cleanStr(dg.escolaridad);
      }
    }

    if (body.antecedentes && typeof body.antecedentes === "object") {
      set["antecedentes"] = buildAntecedentesDoc(body.antecedentes);
    }

    const nombreFinal = Object.prototype.hasOwnProperty.call(set, "nombre")
      ? set["nombre"]
      : cleanStr(actual.nombre);
    const apPaternoFinal = Object.prototype.hasOwnProperty.call(set, "apPaterno")
      ? set["apPaterno"]
      : cleanStr(actual.apPaterno);
    const apMaternoFinal = Object.prototype.hasOwnProperty.call(set, "apMaterno")
      ? set["apMaterno"]
      : cleanStr(actual.apMaterno);

    const full = `${nombreFinal} ${apPaternoFinal} ${apMaternoFinal}`.trim();
    set["nombreCompletoNorm"] = normLower(full);

    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;
    if (Object.keys(unset).length > 0) update.$unset = unset;
    if (farmaciaId) update.$addToSet = { farmaciasVinculadas: farmaciaId };

    const paciente = await Paciente.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .select("nombre apPaterno apMaterno contacto datosGenerales antecedentes activo")
      .lean();

    return res.json({ ok: true, paciente });
  } catch (err) {
    console.error("actualizarPaciente:", err);
    if (err?.code === 11000) {
      return res.status(400).json({ msg: "Ya existe un paciente con ese CURP" });
    }
    return res.status(500).json({ msg: "Error al actualizar paciente" });
  }
};

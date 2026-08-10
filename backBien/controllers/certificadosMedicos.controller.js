const mongoose = require("mongoose");

const CertificadosMedico = require("../models/CertificadosMedico");
const Farmacia = require("../models/Farmacia");
const Usuario = require("../models/Usuario");
const FichaConsultorio = require("../models/FichaConsultorio");

const CAMPOS_EDITABLES = [
  "fechaRevision",
  "tipo",
  "nombreInstituto",
  "turno",
  "grado",
  "nivelEscolar",
  "nombre",
  "genero",
  "fechaNacimiento",
  "curp",
  "edad",
  "responsable",
  "domicilio",
  "telefono",
  "antecedentesHereditarios",
  "antecedentesPersonales",
  "examenFisico",
  "saludBucal",
  "aptoLaboresEscolares",
  "aptoLaboresFisicas",
  "vigenciaDesde",
  "vigenciaHasta",
  "diagnosticoObservaciones",
];

const ID_VACIO = Symbol("ID_VACIO");

function esAdmin(req) {
  return req.usuario?.rol === "admin";
}

function idTexto(valor) {
  if (valor && typeof valor === "object" && valor._id) return String(valor._id);
  return String(valor ?? "").trim();
}

function idValido(valor, { opcional = false } = {}) {
  const texto = idTexto(valor);
  if (!texto && opcional) return ID_VACIO;
  return texto && mongoose.isValidObjectId(texto) ? texto : null;
}

function tienePropiedad(obj, propiedad) {
  return Object.prototype.hasOwnProperty.call(obj || {}, propiedad);
}

function normalizarNiegaAntecedentes(valor) {
  if (Array.isArray(valor)) return valor.length > 0;
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function extraerDatosEditables(body = {}) {
  const datos = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (tienePropiedad(body, campo)) datos[campo] = body[campo];
  }

  if (datos.edad === "") datos.edad = null;
  if (tienePropiedad(datos.antecedentesHereditarios, "niegaAntecedentes")) {
    datos.antecedentesHereditarios = {
      ...datos.antecedentesHereditarios,
      niegaAntecedentes: normalizarNiegaAntecedentes(
        datos.antecedentesHereditarios.niegaAntecedentes
      ),
    };
  }
  return datos;
}

function obtenerIdBody(body, campo, alias) {
  if (tienePropiedad(body, campo)) return body[campo];
  if (alias && tienePropiedad(body, alias)) return body[alias];
  return undefined;
}

function snapshotMedico(medico) {
  return {
    nombre: String(medico?.nombre || "").trim(),
    cedulaProfesional: String(medico?.cedulaProfesional || "").trim(),
    titulo: String(medico?.titulo || "").trim(),
  };
}

async function validarFarmaciaYMedico(farmaciaIdRaw, medicoIdRaw) {
  const farmaciaId = idValido(farmaciaIdRaw);
  const medicoId = idValido(medicoIdRaw);

  if (!farmaciaId) {
    return { error: { status: 400, mensaje: "farmaciaId inválido o faltante." } };
  }
  if (!medicoId) {
    return { error: { status: 400, mensaje: "medicoId inválido o faltante." } };
  }

  const [farmacia, medico] = await Promise.all([
    Farmacia.findById(farmaciaId).select("nombre activo imagen imagen2 titulo1 titulo2 direccion telefono"),
    Usuario.findById(medicoId).select("nombre rol farmacia activo cedulaProfesional titulo escuela logoescuela"),
  ]);

  if (!farmacia || farmacia.activo === false) {
    return { error: { status: 404, mensaje: "Farmacia no encontrada o inactiva." } };
  }
  if (!medico) {
    return { error: { status: 404, mensaje: "Médico no encontrado." } };
  }
  if (medico.rol !== "medico") {
    return { error: { status: 400, mensaje: "El usuario seleccionado no tiene rol médico." } };
  }
  if (medico.activo === false) {
    return { error: { status: 400, mensaje: "El médico seleccionado está inactivo." } };
  }
  if (idTexto(medico.farmacia) !== farmaciaId) {
    return { error: { status: 400, mensaje: "El médico no está asociado a la farmacia seleccionada." } };
  }

  return { farmaciaId, medicoId, farmacia, medico };
}

async function resolverRelaciones(req, body, certificadoActual = null) {
  if (!esAdmin(req)) {
    const farmaciaAutorizada = idTexto(req.usuario?.farmacia);
    const medicoAutorizado = idTexto(req.usuario?._id);

    if (!farmaciaAutorizada) {
      return { error: { status: 403, mensaje: "El médico autenticado no tiene farmacia asociada." } };
    }

    if (certificadoActual) {
      if (idTexto(certificadoActual.medico) !== medicoAutorizado) {
        return { error: { status: 403, mensaje: "No tienes permiso para modificar este certificado." } };
      }
      if (idTexto(certificadoActual.farmacia) !== farmaciaAutorizada) {
        return { error: { status: 403, mensaje: "El certificado pertenece a otra farmacia." } };
      }

      const farmaciaBody = obtenerIdBody(body, "farmaciaId", "farmacia");
      const medicoBody = obtenerIdBody(body, "medicoId", "medico");
      if (farmaciaBody !== undefined && idTexto(farmaciaBody) !== idTexto(certificadoActual.farmacia)) {
        return { error: { status: 403, mensaje: "Un médico no puede cambiar la farmacia del certificado." } };
      }
      if (medicoBody !== undefined && idTexto(medicoBody) !== medicoAutorizado) {
        return { error: { status: 403, mensaje: "Un médico no puede cambiar al responsable del certificado." } };
      }
    }

    return validarFarmaciaYMedico(farmaciaAutorizada, medicoAutorizado);
  }

  const farmaciaRaw = obtenerIdBody(body, "farmaciaId", "farmacia") ?? certificadoActual?.farmacia;
  const medicoRaw = obtenerIdBody(body, "medicoId", "medico") ?? certificadoActual?.medico;
  return validarFarmaciaYMedico(farmaciaRaw, medicoRaw);
}

async function validarFicha(req, fichaRaw, farmaciaId, medicoId, { requerida = false } = {}) {
  const fichaId = idValido(fichaRaw, { opcional: !requerida });

  if (fichaId === ID_VACIO) return { fichaId: null, ficha: null };
  if (!fichaId) {
    return { error: { status: 400, mensaje: "fichaConsultorio inválida." } };
  }

  const ficha = await FichaConsultorio.findById(fichaId).select("farmaciaId medicoId pacienteId pacienteNombre estado");
  if (!ficha) {
    return { error: { status: 404, mensaje: "Ficha de consultorio no encontrada." } };
  }
  if (idTexto(ficha.farmaciaId) !== idTexto(farmaciaId)) {
    return { error: { status: 400, mensaje: "La ficha no pertenece a la farmacia seleccionada." } };
  }
  if (!esAdmin(req) && ficha.medicoId && idTexto(ficha.medicoId) !== idTexto(medicoId)) {
    return { error: { status: 403, mensaje: "La ficha está asignada a otro médico." } };
  }

  return { fichaId, ficha };
}

function responderError(res, error) {
  return res.status(error.status).json({ ok: false, mensaje: error.mensaje });
}

function errorMongoose(res, error, operacion) {
  const duplicadoFicha = error?.code === 11000 && (
    error?.keyPattern?.fichaConsultorio ||
    error?.keyValue?.fichaConsultorio ||
    String(error?.message || "").includes("certificado_unico_por_ficha")
  );
  if (duplicadoFicha) {
    return res.status(409).json({
      ok: false,
      mensaje: "Ya existe un certificado médico asociado a esta ficha.",
    });
  }
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({
      ok: false,
      mensaje: error.message || "Datos inválidos.",
    });
  }

  console.error(`${operacion}:`, error);
  return res.status(500).json({ ok: false, mensaje: "Error interno del servidor." });
}

function escaparRegex(texto) {
  return String(texto || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectIdQuery(valor, nombre) {
  if (valor == null || String(valor).trim() === "") return { valor: null };
  const id = idValido(valor);
  if (!id) return { error: { status: 400, mensaje: `${nombre} inválido.` } };
  return { valor: new mongoose.Types.ObjectId(id) };
}

function parsePaginacion(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function sortListado(sortByRaw, sortDirRaw) {
  const sortBy = ["farmacia", "nombre", "responsable", "medico", "fechaRevision"].includes(sortByRaw)
    ? sortByRaw
    : "fechaRevision";
  const dir = String(sortDirRaw || "desc").toLowerCase() === "asc" ? 1 : -1;

  if (sortBy === "farmacia") {
    return { sortBy, dir, sort: { "farmaciaDetalle.nombre": dir, fechaRevision: dir, nombre: dir, _id: 1 } };
  }
  if (sortBy === "medico") {
    return { sortBy, dir, sort: { "medicoDetalle.nombre": dir, fechaRevision: dir, nombre: dir, _id: 1 } };
  }
  if (sortBy === "fechaRevision") {
    return { sortBy, dir, sort: { fechaRevision: dir, nombre: dir, _id: 1 } };
  }
  return { sortBy, dir, sort: { [sortBy]: dir, fechaRevision: dir, nombre: dir, _id: 1 } };
}

async function obtenerDetalle(id) {
  return CertificadosMedico.findById(id)
    .populate("farmacia", "nombre titulo1 titulo2 direccion telefono imagen imagen2")
    .populate("medico", "nombre cedulaProfesional titulo escuela logoescuela farmacia activo")
    .populate("fichaConsultorio", "folio pacienteNombre pacienteId farmaciaId medicoId estado")
    .lean();
}

exports.agregarCertificadoMedico = async (req, res) => {
  try {
    const relaciones = await resolverRelaciones(req, req.body || {});
    if (relaciones.error) return responderError(res, relaciones.error);

    const fichaRaw = obtenerIdBody(req.body, "fichaConsultorio", "fichaConsultorioId");
    const fichaResultado = await validarFicha(
      req,
      fichaRaw,
      relaciones.farmaciaId,
      relaciones.medicoId
    );
    if (fichaResultado.error) return responderError(res, fichaResultado.error);

    if (fichaResultado.fichaId) {
      const existente = await CertificadosMedico.exists({ fichaConsultorio: fichaResultado.fichaId });
      if (existente) {
        return res.status(409).json({
          ok: false,
          mensaje: "Ya existe un certificado médico asociado a esta ficha.",
        });
      }
    }

    const datos = extraerDatosEditables(req.body || {});
    const creado = await CertificadosMedico.create({
      ...datos,
      farmacia: relaciones.farmaciaId,
      medico: relaciones.medicoId,
      fichaConsultorio: fichaResultado.fichaId || undefined,
      medicoSnapshot: snapshotMedico(relaciones.medico),
    });

    const certificado = await obtenerDetalle(creado._id);
    return res.status(201).json({
      ok: true,
      mensaje: "Certificado médico guardado correctamente.",
      certificado,
    });
  } catch (error) {
    return errorMongoose(res, error, "agregarCertificadoMedico");
  }
};

exports.editarCertificadoMedico = async (req, res) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mensaje: "ID de certificado inválido." });

    const actual = await CertificadosMedico.findById(id);
    if (!actual) return res.status(404).json({ ok: false, mensaje: "Certificado médico no encontrado." });

    if (!esAdmin(req) && idTexto(actual.medico) !== idTexto(req.usuario?._id)) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para editar este certificado." });
    }

    const relaciones = await resolverRelaciones(req, req.body || {}, actual);
    if (relaciones.error) return responderError(res, relaciones.error);

    const tieneFicha = tienePropiedad(req.body, "fichaConsultorio") || tienePropiedad(req.body, "fichaConsultorioId");
    let fichaId = actual.fichaConsultorio ? idTexto(actual.fichaConsultorio) : null;

    if (tieneFicha) {
      const fichaRaw = obtenerIdBody(req.body, "fichaConsultorio", "fichaConsultorioId");
      if (!esAdmin(req) && idTexto(fichaRaw) !== idTexto(actual.fichaConsultorio)) {
        return res.status(403).json({
          ok: false,
          mensaje: "Un médico no puede cambiar la ficha asociada al certificado.",
        });
      }

      const fichaResultado = await validarFicha(
        req,
        fichaRaw,
        relaciones.farmaciaId,
        relaciones.medicoId
      );
      if (fichaResultado.error) return responderError(res, fichaResultado.error);
      fichaId = fichaResultado.fichaId;
    } else if (fichaId) {
      const fichaResultado = await validarFicha(
        req,
        fichaId,
        relaciones.farmaciaId,
        relaciones.medicoId,
        { requerida: true }
      );
      if (fichaResultado.error) return responderError(res, fichaResultado.error);
    }

    const medicoAnteriorId = idTexto(actual.medico);
    const datos = extraerDatosEditables(req.body || {});
    Object.assign(actual, datos, {
      farmacia: relaciones.farmaciaId,
      medico: relaciones.medicoId,
    });

    if (fichaId) actual.fichaConsultorio = fichaId;
    else actual.fichaConsultorio = undefined;

    if (esAdmin(req) && medicoAnteriorId !== idTexto(relaciones.medicoId)) {
      actual.medicoSnapshot = snapshotMedico(relaciones.medico);
    } else if (!actual.medicoSnapshot?.nombre) {
      actual.medicoSnapshot = snapshotMedico(relaciones.medico);
    }

    await actual.save();
    const certificado = await obtenerDetalle(actual._id);

    return res.json({
      ok: true,
      mensaje: "Certificado médico actualizado correctamente.",
      certificado,
    });
  } catch (error) {
    return errorMongoose(res, error, "editarCertificadoMedico");
  }
};

exports.eliminarCertificadoMedico = async (req, res) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mensaje: "ID de certificado inválido." });

    const certificado = await CertificadosMedico.findById(id).select("medico");
    if (!certificado) {
      return res.status(404).json({ ok: false, mensaje: "Certificado médico no encontrado." });
    }
    if (!esAdmin(req) && idTexto(certificado.medico) !== idTexto(req.usuario?._id)) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para eliminar este certificado." });
    }

    await certificado.deleteOne();
    return res.json({ ok: true, mensaje: "Certificado médico eliminado correctamente." });
  } catch (error) {
    return errorMongoose(res, error, "eliminarCertificadoMedico");
  }
};

exports.obtenerCertificadosMedicos = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginacion(req.query || {});
    const match = {};

    if (esAdmin(req)) {
      const farmaciaFiltro = objectIdQuery(req.query.farmacia || req.query.farmaciaId, "farmacia");
      if (farmaciaFiltro.error) return responderError(res, farmaciaFiltro.error);
      if (farmaciaFiltro.valor) match.farmacia = farmaciaFiltro.valor;

      const medicoFiltro = objectIdQuery(req.query.medico || req.query.medicoId, "medico");
      if (medicoFiltro.error) return responderError(res, medicoFiltro.error);
      if (medicoFiltro.valor) match.medico = medicoFiltro.valor;
    } else {
      match.medico = new mongoose.Types.ObjectId(idTexto(req.usuario._id));
    }

    const nombre = String(req.query.nombre || "").trim();
    const responsable = String(req.query.responsable || "").trim();
    const fechaRevision = String(req.query.fechaRevision || req.query.fecha || "").trim();

    if (nombre) match.nombre = { $regex: escaparRegex(nombre), $options: "i" };
    if (responsable) match.responsable = { $regex: escaparRegex(responsable), $options: "i" };
    if (fechaRevision) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRevision)) {
        return res.status(400).json({ ok: false, mensaje: "fechaRevision debe tener formato YYYY-MM-DD." });
      }
      match.fechaRevision = fechaRevision;
    }

    const orden = sortListado(String(req.query.sortBy || ""), String(req.query.sortDir || ""));

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: Farmacia.collection.name,
          localField: "farmacia",
          foreignField: "_id",
          as: "farmaciaDetalle",
        },
      },
      { $unwind: { path: "$farmaciaDetalle", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: Usuario.collection.name,
          localField: "medico",
          foreignField: "_id",
          as: "medicoDetalle",
        },
      },
      { $unwind: { path: "$medicoDetalle", preserveNullAndEmptyArrays: true } },
      { $sort: orden.sort },
      {
        $facet: {
          documentos: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                farmacia: {
                  _id: "$farmaciaDetalle._id",
                  nombre: "$farmaciaDetalle.nombre",
                },
                medico: {
                  _id: "$medicoDetalle._id",
                  nombre: "$medicoDetalle.nombre",
                  cedulaProfesional: "$medicoDetalle.cedulaProfesional",
                },
                nombre: 1,
                responsable: 1,
                fechaRevision: 1,
                fichaConsultorio: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          total: [{ $count: "cantidad" }],
        },
      },
    ];

    const [resultado = {}] = await CertificadosMedico.aggregate(pipeline)
      .collation({ locale: "es", strength: 1 })
      .exec();

    const total = Number(resultado.total?.[0]?.cantidad || 0);
    return res.json({
      ok: true,
      certificados: resultado.documentos || [],
      paginacion: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      orden: { sortBy: orden.sortBy, sortDir: orden.dir === 1 ? "asc" : "desc" },
    });
  } catch (error) {
    return errorMongoose(res, error, "obtenerCertificadosMedicos");
  }
};

exports.obtenerCertificadoMedicoPorId = async (req, res) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ ok: false, mensaje: "ID de certificado inválido." });

    const certificado = await obtenerDetalle(id);
    if (!certificado) {
      return res.status(404).json({ ok: false, mensaje: "Certificado médico no encontrado." });
    }
    if (!esAdmin(req) && idTexto(certificado.medico) !== idTexto(req.usuario?._id)) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para consultar este certificado." });
    }

    return res.json({ ok: true, certificado });
  } catch (error) {
    return errorMongoose(res, error, "obtenerCertificadoMedicoPorId");
  }
};

exports.obtenerCertificadoPorFicha = async (req, res) => {
  try {
    const fichaId = idValido(req.params.fichaId);
    if (!fichaId) return res.status(400).json({ ok: false, mensaje: "ID de ficha inválido." });

    const ficha = await FichaConsultorio.findById(fichaId).select("farmaciaId medicoId");
    if (!ficha) return res.status(404).json({ ok: false, mensaje: "Ficha de consultorio no encontrada." });

    if (!esAdmin(req)) {
      if (idTexto(ficha.farmaciaId) !== idTexto(req.usuario?.farmacia)) {
        return res.status(403).json({ ok: false, mensaje: "La ficha pertenece a otra farmacia." });
      }
      if (ficha.medicoId && idTexto(ficha.medicoId) !== idTexto(req.usuario?._id)) {
        return res.status(403).json({ ok: false, mensaje: "La ficha está asignada a otro médico." });
      }
    }

    const encontrado = await CertificadosMedico.findOne({ fichaConsultorio: fichaId }).select("_id medico").lean();
    if (!encontrado) return res.json({ ok: true, certificado: null });

    if (!esAdmin(req) && idTexto(encontrado.medico) !== idTexto(req.usuario?._id)) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para consultar este certificado." });
    }

    const certificado = await obtenerDetalle(encontrado._id);
    return res.json({ ok: true, certificado });
  } catch (error) {
    return errorMongoose(res, error, "obtenerCertificadoPorFicha");
  }
};

exports.__test__ = {
  CAMPOS_EDITABLES,
  normalizarNiegaAntecedentes,
  extraerDatosEditables,
  resolverRelaciones,
  validarFicha,
  sortListado,
};

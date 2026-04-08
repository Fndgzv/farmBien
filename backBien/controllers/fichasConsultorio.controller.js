// backBien/controllers/fichasConsultorio.controller.js
const FichaConsultorio = require("../models/FichaConsultorio");
const Producto = require("../models/Producto");
const Paciente = require("../models/Paciente");
const Receta = require("../models/Receta");

const mongoose = require("mongoose");

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;          // empleado/medico
  const fromHeader = req.headers["x-farmacia-id"]; // admin
  const farmaciaId = fromHeader || fromUser;
  if (!farmaciaId) return null;
  return String(farmaciaId);
}

const cleanStr = (v) => String(v ?? "").trim();

const cleanArr = (v) => {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => cleanStr(x))
    .filter(Boolean);
};


const pickAntecedentes = (antRaw) => {
  if (!antRaw || typeof antRaw !== "object") return null;

  const tabaquismo = cleanStr(antRaw.tabaquismo);
  const alcohol = cleanStr(antRaw.alcohol);

  const ant = {
    alergias: cleanArr(antRaw.alergias),
    enfermedadesCronicas: cleanArr(antRaw.enfermedadesCronicas),
    cirugiasPrevias: cleanArr(antRaw.cirugiasPrevias),
    medicamentosActuales: cleanArr(antRaw.medicamentosActuales),
    antecedentesFamiliares: cleanArr(antRaw.antecedentesFamiliares),

    // enums: si no viene válido, NO lo mandes (para no romper)
    tabaquismo: ["No", "Si", "Ex"].includes(tabaquismo) ? tabaquismo : undefined,
    alcohol: ["No", "Si", "Ocasional"].includes(alcohol) ? alcohol : undefined,
  };

  const hayAlgo =
    ant.alergias.length ||
    ant.enfermedadesCronicas.length ||
    ant.cirugiasPrevias.length ||
    ant.medicamentosActuales.length ||
    ant.antecedentesFamiliares.length ||
    ant.tabaquismo != null ||
    ant.alcohol != null;

  return hayAlgo ? ant : null;
};

/**
 * POST /api/fichas-consultorio
 * Caja crea ficha sin buscar si ya existe el paciente => EN_ESPERA
 */
exports.crearFicha = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) {
      return res.status(400).json({ msg: "Falta farmacia activa" });
    }

    const {
      pacienteNombre,
      pacienteAPaterno,
      pacienteAMaterno,
      pacienteTelefono,
      motivo,
      urgencia = false,
    } = req.body;

    const nombre = (pacienteNombre || "").trim();
    const aPaterno = (pacienteAPaterno || "").trim();
    const aMaterno = (pacienteAMaterno || "").trim();
    const telefono = (pacienteTelefono || "").trim();
    const motivoFinal = (motivo || "").trim();

    if (!nombre) {
      return res.status(400).json({ msg: "El nombre del paciente es requerido" });
    }

    if (!aPaterno) {
      return res.status(400).json({ msg: "El apellido paterno es requerido" });
    }

    const nombreCompleto = [nombre, aPaterno, aMaterno]
      .filter(Boolean)
      .join(" ")
      .trim();

    const ficha = await FichaConsultorio.create({
      farmaciaId,
      pacienteNombre: nombreCompleto,
      pacienteAPaterno: aPaterno,
      pacienteAMaterno: aMaterno,
      pacienteTelefono: telefono,
      motivo: motivoFinal,
      urgencia: !!urgencia,
      creadaPor: req.usuario._id,
      actualizadaPor: req.usuario._id,
    });

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("crearFicha:", err);
    return res.status(500).json({ msg: "Error al crear ficha" });
  }
};

// PATCH /api/fichas-consultorio/:id/servicios
exports.actualizarServicios = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const { servicios = [], notasMedico, motivo, finalizar = false } = req.body;

    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) return res.status(404).json({ msg: "Ficha no encontrada" });

    if (["ATENDIDA", "CANCELADA"].includes(ficha.estado)) {
      return res.status(400).json({ msg: "La ficha ya no se puede modificar" });
    }

    if (ficha.estado === "EN_COBRO") {
      return res.status(400).json({ msg: "La ficha ya está en cobro, no se puede modificar" });
    }

    if (!Array.isArray(servicios)) {
      return res.status(400).json({ msg: "Servicios inválidos" });
    }

    // =========================
    // 1) Construir snapshots NUEVOS de servicios médicos
    // =========================
    let serviciosSnapshot = [];

    if (servicios.length > 0) {
      const productoIds = servicios.map((s) => s.productoId).filter(Boolean);

      if (productoIds.length === 0) {
        return res.status(400).json({ msg: "Servicios inválidos: faltan productoId" });
      }

      const productos = await Producto.find({ _id: { $in: productoIds } })
        .select("nombre codigoBarras categoria precioVenta")
        .lean();

      const map = new Map(productos.map((p) => [String(p._id), p]));

      for (const s of servicios) {
        const p = map.get(String(s.productoId));
        if (!p) {
          return res.status(400).json({ msg: `Producto no existe: ${s.productoId}` });
        }

        const cat = (p.categoria || "").trim();
        if (cat !== "Servicio Médico") {
          return res.status(400).json({
            msg: `El producto ${p.nombre} no es de categoría Servicio Médico`
          });
        }

        const cantidad = Math.max(parseInt(s.cantidad ?? 1, 10) || 1, 1);

        serviciosSnapshot.push({
          productoId: p._id,
          nombre: p.nombre,
          codigoBarras: p.codigoBarras,
          categoria: p.categoria || "",
          precio: Number(p.precioVenta ?? 0),
          cantidad,
          notas: (s.notas || "").trim(),
        });
      }
    }

    // =========================
    // 2) Conservar conceptos existentes que NO sean Servicio Médico
    // =========================
    let conceptosNoMedicosExistentes = [];

    if (Array.isArray(ficha.servicios) && ficha.servicios.length > 0) {
      const idsExistentes = ficha.servicios
        .map((x) => x.productoId)
        .filter(Boolean)
        .map((x) => String(x));

      if (idsExistentes.length > 0) {
        const productosExistentes = await Producto.find({ _id: { $in: idsExistentes } })
          .select("_id categoria")
          .lean();

        const categoriaMap = new Map(
          productosExistentes.map((p) => [String(p._id), (p.categoria || "").trim()])
        );

        conceptosNoMedicosExistentes = ficha.servicios.filter((item) => {
          const categoria = categoriaMap.get(String(item.productoId)) || "";
          return categoria !== "Servicio Médico";
        });
      }
    }

    // =========================
    // 3) Unir: conservar no-médicos + reemplazar médicos
    // =========================
    ficha.servicios = [
      ...conceptosNoMedicosExistentes,
      ...serviciosSnapshot
    ];

    // =========================
    // 4) Solo actualizar notas/motivo si vienen en el request
    // =========================
    if (notasMedico != null) {
      ficha.notasMedico = (notasMedico || "").trim();
    }

    if (motivo != null) {
      ficha.motivo = (motivo || "").trim();
    }

    ficha.medicoId = req.usuario._id;
    ficha.inicioAtencionAt = ficha.inicioAtencionAt || new Date();
    ficha.actualizadaPor = req.usuario._id;

    const hayConceptos = Array.isArray(ficha.servicios) && ficha.servicios.length > 0;

    if (finalizar) {
      ficha.finAtencionAt = new Date();
      ficha.estado = hayConceptos ? "LISTA_PARA_COBRO" : "ATENDIDA";
    } else {
      // Si el médico solo guarda sin finalizar, mantenemos la ficha en atención
      ficha.estado = "EN_ATENCION";
      ficha.finAtencionAt = undefined;
    }

    await ficha.save();

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("actualizarServicios:", err);
    return res.status(500).json({ msg: "Error al actualizar servicios" });
  }
};

// PATCH /api/fichas-consultorio/:id/conceptos
exports.actualizarConceptosFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) {
      return res.status(400).json({ msg: "Falta farmacia activa" });
    }

    const {
      servicios = [],
      notasMedico,
      motivo,
      finalizar = false,
      modoAgregar = false,
    } = req.body;

    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) {
      return res.status(404).json({ msg: "Ficha no encontrada" });
    }

    if (["ATENDIDA", "CANCELADA"].includes(ficha.estado)) {
      return res.status(400).json({ msg: "La ficha ya no se puede modificar" });
    }

    if (ficha.estado === "EN_COBRO") {
      return res.status(400).json({ msg: "La ficha ya está en cobro, no se puede modificar" });
    }

    if (!Array.isArray(servicios)) {
      return res.status(400).json({ msg: "Conceptos inválidos" });
    }

    // =========================
    // 1) Construir snapshots NUEVOS de conceptos no médicos
    // =========================
    let conceptosNoMedicosNuevos = [];

    if (servicios.length > 0) {
      const productoIds = servicios.map((s) => s.productoId).filter(Boolean);

      if (productoIds.length === 0) {
        return res.status(400).json({ msg: "Conceptos inválidos: faltan productoId" });
      }

      const productos = await Producto.find({ _id: { $in: productoIds } })
        .select("nombre codigoBarras categoria precioVenta")
        .lean();

      const map = new Map(productos.map((p) => [String(p._id), p]));

      for (const s of servicios) {
        const p = map.get(String(s.productoId));
        if (!p) {
          return res.status(400).json({ msg: `Producto no existe: ${s.productoId}` });
        }

        const cat = (p.categoria || "").trim();
        if (cat === "Servicio Médico") {
          return res.status(400).json({
            msg: `El producto ${p.nombre} pertenece a Servicio Médico; use la captura del médico para ese concepto`
          });
        }

        const cantidad = Math.max(parseInt(s.cantidad ?? 1, 10) || 1, 1);

        conceptosNoMedicosNuevos.push({
          productoId: p._id,
          nombre: p.nombre,
          codigoBarras: p.codigoBarras,
          categoria: p.categoria || "",
          precio: Number(p.precioVenta ?? 0),
          cantidad,
          notas: (s.notas || "").trim(),
        });
      }
    }

    // =========================
    // 2) Separar lo existente en:
    //    - médicos
    //    - no médicos
    // =========================
    let serviciosMedicosExistentes = [];
    let conceptosNoMedicosExistentes = [];

    if (Array.isArray(ficha.servicios) && ficha.servicios.length > 0) {
      const idsExistentes = ficha.servicios
        .map((x) => x.productoId)
        .filter(Boolean)
        .map((x) => String(x));

      if (idsExistentes.length > 0) {
        const productosExistentes = await Producto.find({ _id: { $in: idsExistentes } })
          .select("_id categoria")
          .lean();

        const categoriaMap = new Map(
          productosExistentes.map((p) => [String(p._id), (p.categoria || "").trim()])
        );

        for (const item of ficha.servicios) {
          const categoria = categoriaMap.get(String(item.productoId)) || "";

          if (categoria === "Servicio Médico") {
            serviciosMedicosExistentes.push(item);
          } else {
            conceptosNoMedicosExistentes.push(item);
          }
        }
      }
    }

    // =========================
    // 3) Armar arreglo final
    // =========================
    let conceptosNoMedicosFinales = [];

    if (modoAgregar) {
      conceptosNoMedicosFinales = [
        ...conceptosNoMedicosExistentes,
        ...conceptosNoMedicosNuevos,
      ];
    } else {
      conceptosNoMedicosFinales = conceptosNoMedicosNuevos;
    }

    ficha.servicios = [
      ...serviciosMedicosExistentes,
      ...conceptosNoMedicosFinales,
    ];

    // =========================
    // 4) Notas / motivo solo si vienen
    // =========================
    if (notasMedico != null) {
      ficha.notasMedico = (notasMedico || "").trim();
    }

    if (motivo != null) {
      ficha.motivo = (motivo || "").trim();
    }

    // Solo asignar médico si quien edita es médico y aún no existe
    if (!ficha.medicoId && req.usuario?.rol === "medico") {
      ficha.medicoId = req.usuario._id;
    }

    ficha.inicioAtencionAt = ficha.inicioAtencionAt || new Date();
    ficha.actualizadaPor = req.usuario._id;

    const hayConceptos = Array.isArray(ficha.servicios) && ficha.servicios.length > 0;

    if (finalizar) {
      ficha.finAtencionAt = new Date();
      ficha.estado = hayConceptos ? "LISTA_PARA_COBRO" : "ATENDIDA";
    } else {
      ficha.estado = "EN_ATENCION";
      ficha.finAtencionAt = undefined;
    }

    await ficha.save();

    return res.json({
      ok: true,
      ficha,
    });
  } catch (err) {
    console.error("actualizarConceptosFicha:", err);
    return res.status(500).json({ msg: "Error al actualizar conceptos de la ficha" });
  }
};

/**
 * GET /api/fichas-consultorio/cola
 * - Caja: ?estado=EN_ESPERA
 * - Médico: por defecto EN_ESPERA + su propia EN_ATENCION
 */
exports.obtenerCola = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const userId = String(req.usuario?._id || "");
    const rol = req.usuario?.rol;
    const estado = (req.query.estado || "").trim();

    let filtro = { farmaciaId };

    if (estado) {
      filtro.estado = estado;
    } else {
      const incluirMiAtencion = String(req.query.incluirMiAtencion || "1") === "1";

      const or = [{ estado: "EN_ESPERA" }];

      if (rol === "medico" && incluirMiAtencion) {
        or.push({ estado: "EN_ATENCION", medicoId: userId });
      }

      filtro.$or = or;
    }

    const fichas = await FichaConsultorio.find(filtro)
      .sort({ urgencia: -1, llegadaAt: 1 })
      .select(`
        folio
        pacienteNombre
        pacienteAPaterno
        pacienteAMaterno
        pacienteTelefono
        motivo
        urgencia
        estado
        llegadaAt
        medicoId
        servicios
        serviciosTotal
      `)
      .lean();

    return res.json({ ok: true, fichas });
  } catch (err) {
    console.error("obtenerCola:", err);
    return res.status(500).json({ msg: "Error al obtener cola" });
  }
};

/**
 * POST /api/fichas-consultorio/:id/tomar-para-atencion
 * Médico “toma” una ficha de la cola para atenderla.
 * Evita que dos médicos tomen la misma.
 */
exports.tomarParaAtencion = async (req, res) => {
  try {
    const { id } = req.params;

    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const ficha = await FichaConsultorio.findOneAndUpdate(
      {
        _id: id,
        farmaciaId,
        estado: "EN_ESPERA",
      },
      {
        $set: {
          estado: "EN_ATENCION",
          medicoId: req.usuario._id,
          llamadoAt: new Date(),
          inicioAtencionAt: new Date(),
          actualizadaPor: req.usuario._id,
        },
      },
      { new: true }
    );

    if (!ficha) {
      return res.status(400).json({
        msg: "No se pudo tomar la ficha. Puede que ya no esté en espera o pertenezca a otra farmacia.",
      });
    }

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("tomarParaAtencion:", err);
    return res.status(500).json({ msg: "Error al tomar ficha para atención" });
  }
};

async function medicoOcupado(farmaciaId, medicoId) {
  return await FichaConsultorio.exists({
    farmaciaId,
    medicoId,
    estado: { $in: ["EN_ATENCION"] }, // agrega "LISTA_PARA_COBRO" si aplica
  });
}

exports.llamarFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    // ✅ bloqueo: si ya está atendiendo otra, no puede llamar
    const ocupado = await medicoOcupado(farmaciaId, req.usuario._id);
    if (ocupado) {
      return res.status(409).json({ msg: "Ya estás atendiendo a un paciente. Finaliza o regresa la ficha antes de llamar a otro." });
    }

    const ficha = await FichaConsultorio.findOneAndUpdate(
      { _id: id, farmaciaId, estado: "EN_ESPERA" },
      {
        $set: {
          estado: "EN_ATENCION",
          medicoId: req.usuario._id,
          llamadoAt: new Date(),
          inicioAtencionAt: new Date(),
          actualizadaPor: req.usuario._id,
        },
      },
      { new: true }
    );

    if (!ficha) return res.status(400).json({ msg: "No se pudo llamar: la ficha ya no está en espera." });
    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("llamarFicha:", err);
    return res.status(500).json({ msg: "Error al llamar ficha" });
  }
};

// POST /api/fichas-consultorio/:id/reanudar
exports.reanudarFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const userId = String(req.usuario?._id || "");
    const rol = req.usuario?.rol;

    if (rol !== "medico" && rol !== "admin") {
      return res.status(403).json({ msg: "Sin permisos" });
    }

    const filtro = { _id: id, farmaciaId, estado: "EN_ATENCION" };

    // Si es médico: solo puede reanudar su propia ficha
    if (rol === "medico") filtro.medicoId = userId;

    const ficha = await FichaConsultorio.findOne(filtro).lean();
    if (!ficha) {
      return res.status(404).json({ msg: "No se pudo reanudar: ficha no encontrada o no te pertenece" });
    }

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("reanudarFicha:", err);
    return res.status(500).json({ msg: "Error al reanudar ficha" });
  }
};

exports.regresarAListaDeEspera = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ ok: false, msg: "Falta farmacia activa" });

    const usuario = req.usuario;
    const rol = usuario?.rol;

    // 1) Buscar primero para validar reglas (y tener mensajes claros)
    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) return res.status(404).json({ ok: false, msg: "Ficha no encontrada" });

    // 2) No permitir en estados finales o de cobro
    if (["ATENDIDA", "CANCELADA"].includes(ficha.estado)) {
      return res.status(400).json({ ok: false, msg: `No se puede regresar una ficha en estado ${ficha.estado}` });
    }
    if (ficha.estado === "EN_COBRO") {
      return res.status(400).json({ ok: false, msg: "La ficha está en cobro; primero libérala en caja." });
    }

    // 3) Solo permitir regresar si está en atención o lista para cobro (según tu flujo real)
    const estadosPermitidos = ["EN_ATENCION", "LISTA_PARA_COBRO"];
    if (!estadosPermitidos.includes(ficha.estado)) {
      return res.status(400).json({ ok: false, msg: `No se puede regresar desde estado ${ficha.estado}` });
    }

    // 4) Si es médico, solo si él la tiene tomada (admin puede siempre)
    if (rol === "medico") {
      if (ficha.medicoId && String(ficha.medicoId) !== String(usuario._id)) {
        return res.status(403).json({ ok: false, msg: "Esta ficha está tomada por otro médico." });
      }
    }

    // 5) Actualizar: vuelve a espera y, opcionalmente, al final de la cola
    ficha.estado = "EN_ESPERA";
    ficha.medicoId = null;
    ficha.llamadoAt = null;
    ficha.inicioAtencionAt = null;
    ficha.finAtencionAt = null;

    // ✅ si quieres que vuelva al FINAL de la cola:
    // ficha.llegadaAt = new Date();

    // ✅ recomendado: limpiar servicios/notas si regresa a espera
    ficha.servicios = [];
    ficha.notasMedico = "";

    ficha.actualizadaPor = usuario._id;

    await ficha.save();

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("regresarAListaDeEspera:", err);
    return res.status(500).json({ ok: false, msg: "Error al regresar la ficha a lista de espera" });
  }
};

exports.tomarParaCobro = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const ficha = await FichaConsultorio.findOneAndUpdate(
      {
        _id: id,
        farmaciaId,
        estado: "LISTA_PARA_COBRO",
        ventaId: { $exists: false },
      },
      {
        $set: {
          estado: "EN_COBRO",
          cobroPor: req.usuario._id,
          cobroAt: new Date(),
          actualizadaPor: req.usuario._id,
        },
      },
      { new: true }
    );

    if (!ficha) {
      return res.status(400).json({ msg: "La ficha no está lista para cobro o ya fue tomada/pagada." });
    }

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("tomarParaCobro:", err);
    return res.status(500).json({ msg: "Error al tomar ficha para cobro" });
  }
};


/**
 * POST /api/fichas-consultorio/:id/liberar-cobro
 * Si se cancela el cobro, regresa a LISTA_PARA_COBRO.
 */
exports.liberarCobro = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const ficha = await FichaConsultorio.findOneAndUpdate(
      {
        _id: id,
        farmaciaId,
        estado: "EN_COBRO",
        ventaId: { $exists: false },
      },
      {
        $set: {
          estado: "LISTA_PARA_COBRO",
          actualizadaPor: req.usuario._id,
        },
        $unset: {
          cobroPor: 1,
          cobroAt: 1,
        },
      },
      { new: true }
    );

    if (!ficha) {
      return res.status(400).json({ msg: "No se pudo liberar: no está en cobro o ya fue pagada." });
    }

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("liberarCobro:", err);
    return res.status(500).json({ msg: "Error al liberar cobro" });
  }
};

exports.listasParaCobro = async (req, res) => {
  try {
    const farmaciaId = String(req.usuario?.farmacia || req.headers["x-farmacia-id"] || "");
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const fichas = await FichaConsultorio.find({
      farmaciaId,
      estado: "LISTA_PARA_COBRO",
    })
      .sort({ urgencia: -1, llegadaAt: 1 })
      .select("folio pacienteNombre pacienteTelefono motivo urgencia llegadaAt servicios serviciosTotal medicoId")
      .lean();

    return res.json({ ok: true, fichas });
  } catch (err) {
    console.error("listasParaCobro:", err);
    return res.status(500).json({ msg: "Error al obtener fichas listas para cobro" });
  }
};

// en fichasConsultorio.controller.js
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

exports.cancelarFicha = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const usuario = req.usuario; // viene del authMiddleware
    const rol = usuario?.rol;

    const { motivoCancelacion } = req.body;

    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) return res.status(404).json({ msg: "Ficha no encontrada" });

    // Estados finales
    if (ficha.estado === "ATENDIDA") {
      return res.status(400).json({ msg: "No se puede cancelar una ficha ya cobrada/atendida" });
    }
    if (ficha.estado === "CANCELADA") {
      return res.status(400).json({ msg: "La ficha ya está cancelada" });
    }

    // Reglas por estado EN_COBRO
    if (ficha.estado === "EN_COBRO") {
      if (rol === "medico") {
        return res.status(403).json({ msg: "La ficha ya está en cobro. Debe cancelarla caja." });
      }

      // empleado: solo si él la tomó; admin puede siempre
      if (rol === "empleado") {
        if (ficha.cobroPor && String(ficha.cobroPor) !== String(usuario._id)) {
          return res.status(409).json({ msg: "La ficha está tomada por otro usuario en caja." });
        }
      }

      // ✅ al cancelar, liberamos el cobro para que no quede bloqueada
      ficha.cobroPor = null;
    }

    // Listo: cancelar
    ficha.estado = "CANCELADA";
    ficha.motivoCancelacion = (motivoCancelacion || "").trim();
    ficha.canceladaAt = new Date();
    ficha.canceladaPor = usuario._id;
    ficha.actualizadaPor = usuario._id;

    await ficha.save();

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("cancelarFicha:", err);
    return res.status(500).json({ msg: "Error al cancelar ficha" });
  }
};


exports.buscar = async (req, res) => {
  try {
    const farmaciaId = String(req.usuario?.farmacia || req.headers["x-farmacia-id"] || "");
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ msg: "Falta q" });

    const qNorm = norm(q);

    const filtro = {
      farmaciaId,
      estado: { $in: ["LISTA_PARA_COBRO", "EN_COBRO"] },
      $or: [
        { folio: { $regex: q, $options: "i" } },
        { pacienteTelefono: { $regex: q, $options: "i" } },
        { pacienteNombreNorm: { $regex: qNorm, $options: "i" } },
        { pacienteNombre: { $regex: q, $options: "i" } },
      ],
    };

    const fichas = await FichaConsultorio.find(filtro)
      .sort({ estado: 1, urgencia: -1, llegadaAt: 1 }) // LISTA_PARA_COBRO antes que EN_COBRO
      .select("folio pacienteNombre pacienteTelefono motivo urgencia llegadaAt estado servicios serviciosTotal cobroPor cobroAt medicoId")
      .lean();

    return res.json({ ok: true, fichas });
  } catch (err) {
    console.error("buscar ficha:", err);
    return res.status(500).json({ msg: "Error al buscar ficha" });
  }
};


exports.vincularPaciente = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const { pacienteId } = req.body || {};
    if (!pacienteId || !mongoose.isValidObjectId(pacienteId)) {
      return res.status(400).json({ msg: "pacienteId inválido" });
    }

    const paciente = await Paciente.findById(pacienteId)
      .select("_id nombre apPaterno apMaterno contacto.telefono")
      .lean();

    if (!paciente) return res.status(404).json({ msg: "Paciente no encontrado" });

    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) return res.status(404).json({ msg: "Ficha no encontrada" });

    if (["ATENDIDA", "CANCELADA", "EN_COBRO"].includes(ficha.estado)) {
      return res.status(400).json({ msg: `No se puede vincular paciente en estado ${ficha.estado}` });
    }

    ficha.pacienteId = pacienteId;

    const nombreCompleto = [
      paciente.nombre || "",
      paciente.apPaterno || "",
      paciente.apMaterno || ""
    ].filter(Boolean).join(" ").trim();

    if (nombreCompleto) ficha.pacienteNombre = nombreCompleto;
    ficha.pacienteAPaterno = paciente.apPaterno || "";
    ficha.pacienteAMaterno = paciente.apMaterno || "";

    if (paciente?.contacto?.telefono) {
      ficha.pacienteTelefono = paciente.contacto.telefono;
    }

    ficha.actualizadaPor = req.usuario._id;
    await ficha.save();

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("vincularPaciente:", err);
    return res.status(500).json({ msg: "Error al vincular paciente" });
  }
};

exports.finalizarConsulta = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const medicoId = req.usuario?._id;

    const {
      motivo,
      notasMedico,
      servicios = [],
      signosVitales = null,
      antecedentes = null,
      receta = null,
      paciente = null,
    } = req.body || {};

    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) return res.status(404).json({ msg: "Ficha no encontrada" });

    if (["ATENDIDA", "CANCELADA"].includes(ficha.estado)) {
      return res.status(400).json({ msg: "La ficha ya no se puede modificar" });
    }
    if (ficha.estado === "EN_COBRO") {
      return res.status(400).json({ msg: "La ficha ya está en cobro, no se puede finalizar" });
    }

    // ============================
    // 1) Servicios (snapshot)
    // ============================
    if (!Array.isArray(servicios)) {
      return res.status(400).json({ msg: "Servicios inválidos" });
    }

    let serviciosSnapshot = [];
    if (servicios.length > 0) {
      const productoIds = servicios.map((s) => s.productoId).filter(Boolean);
      if (productoIds.length === 0) {
        return res.status(400).json({ msg: "Servicios inválidos: faltan productoId" });
      }

      const productos = await Producto.find({ _id: { $in: productoIds } })
        .select("nombre codigoBarras categoria precioVenta")
        .lean();

      const map = new Map(productos.map((p) => [String(p._id), p]));

      for (const s of servicios) {
        const p = map.get(String(s.productoId));
        if (!p) return res.status(400).json({ msg: `Producto no existe: ${s.productoId}` });

        const cat = (p.categoria || "").trim();
        if (cat !== "Servicio Médico") {
          return res.status(400).json({
            msg: `El producto ${p.nombre} no es de categoría Servicio Médico`,
          });
        }

        const cantidad = Math.max(parseInt(s.cantidad ?? 1, 10) || 1, 1);

        serviciosSnapshot.push({
          productoId: p._id,
          nombre: p.nombre,
          codigoBarras: p.codigoBarras,
          precio: p.precioVenta ?? 0,
          cantidad,
          notas: (s.notas || "").trim(),
        });
      }
    }

    // ============================
    // 2) Guarda campos en ficha
    // ============================
    if (motivo != null) ficha.motivo = String(motivo || "").trim();
    ficha.notasMedico = String(notasMedico || "").trim();
    ficha.servicios = serviciosSnapshot;

    ficha.medicoId = medicoId;
    ficha.inicioAtencionAt = ficha.inicioAtencionAt || new Date();
    ficha.finAtencionAt = new Date();

    // ============================
    // 3) Signos vitales -> Paciente (si hay pacienteId)
    // ============================
    let signosGuardados = false;

    const pacienteId = ficha.pacienteId ? String(ficha.pacienteId) : null;

    if (signosVitales && pacienteId) {
      const sv = signosVitales || {};
      const hayAlgoSV =
        sv.pesoKg != null ||
        sv.tallaCm != null ||
        sv.imc != null ||
        sv.temperatura != null ||
        sv.presionSis != null ||
        sv.presionDia != null ||
        sv.fc != null ||
        sv.fr != null ||
        sv.spo2 != null ||
        sv.glucosaCapilar != null ||
        String(sv.notas || "").trim();

      if (hayAlgoSV) {
        const pesoKg = sv.pesoKg != null ? Number(sv.pesoKg) : null;
        const tallaCm = sv.tallaCm != null ? Number(sv.tallaCm) : null;
        let imc = sv.imc != null ? Number(sv.imc) : null;

        if ((pesoKg && tallaCm) && !imc) {
          const m = tallaCm / 100;
          imc = m > 0 ? +(pesoKg / (m * m)).toFixed(2) : null;
        }

        const svDoc = {
          fecha: new Date(),
          pesoKg: pesoKg ?? undefined,
          tallaCm: tallaCm ?? undefined,
          imc: imc ?? undefined,
          temperatura: sv.temperatura != null ? Number(sv.temperatura) : undefined,
          presionSis: sv.presionSis != null ? Number(sv.presionSis) : undefined,
          presionDia: sv.presionDia != null ? Number(sv.presionDia) : undefined,
          fc: sv.fc != null ? Number(sv.fc) : undefined,
          fr: sv.fr != null ? Number(sv.fr) : undefined,
          spo2: sv.spo2 != null ? Number(sv.spo2) : undefined,
          glucosaCapilar: sv.glucosaCapilar != null ? Number(sv.glucosaCapilar) : undefined,
          notas: String(sv.notas || "").trim(),
          tomadoPor: medicoId,
          farmaciaId: farmaciaId || undefined,
        };

        await Paciente.findByIdAndUpdate(
          pacienteId,
          { $push: { signosVitales: { $each: [svDoc], $position: 0, $slice: 50 } } },
          { new: true }
        ).select("_id");

        signosGuardados = true;
      }
    }

    // ============================
    // 3.5) Antecedentes -> Paciente (si hay pacienteId)
    // ============================
    let antecedentesGuardados = false;

    if (antecedentes && pacienteId) {
      const ant = pickAntecedentes(antecedentes);

      // ✅ si NO hay nada, NO tocamos antecedentes existentes
      if (ant) {
        await Paciente.findByIdAndUpdate(
          pacienteId,
          { $set: { antecedentes: ant } },
          { new: true }
        ).select("_id");

        antecedentesGuardados = true;
      }
    }

    // ============================
    // 3.7) Datos paciente/contacto -> Paciente (si hay pacienteId)
    // ============================
    let pacienteActualizado = false;

    const normalizeName = (s) =>
      String(s ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (paciente && pacienteId) {
      const p = paciente || {};
      const set = {};

      // nombre/apellidos
      const valStr = (x) => (x == null ? "" : String(x)).trim();
      const hasStr = (x) => valStr(x).length > 0;

      if (hasStr(p.nombre)) set["nombre"] = valStr(p.nombre);
      if (hasStr(p.apPaterno)) set["apPaterno"] = valStr(p.apPaterno);
      if (p.apMaterno != null) set["apMaterno"] = valStr(p.apMaterno);

      // contacto
      if (p.contacto && typeof p.contacto === "object") {
        const c = p.contacto;

        if (c.telefono != null) set["contacto.telefono"] = String(c.telefono).trim();
        if (c.email != null) set["contacto.email"] = String(c.email).trim().toLowerCase();
        if (c.direccion != null) set["contacto.direccion"] = String(c.direccion).trim();

        if (c.emergencia && typeof c.emergencia === "object") {
          const e = c.emergencia;
          if (e.nombre != null) set["contacto.emergencia.nombre"] = String(e.nombre).trim();
          if (e.telefono != null) set["contacto.emergencia.telefono"] = String(e.telefono).trim();
          if (e.parentesco != null) set["contacto.emergencia.parentesco"] = String(e.parentesco).trim();
        }
      }

      // datosGeneralesrecetaIdCreada 
      if (p.datosGenerales && typeof p.datosGenerales === "object") {
        const dg = p.datosGenerales;

        if (dg.fechaNacimiento) set["datosGenerales.fechaNacimiento"] = new Date(dg.fechaNacimiento);
        if (dg.sexo != null) set["datosGenerales.sexo"] = String(dg.sexo).trim();
        if (dg.curp != null) set["datosGenerales.curp"] = String(dg.curp).trim().toUpperCase();
        if (dg.ocupacion != null) set["datosGenerales.ocupacion"] = String(dg.ocupacion).trim();
        if (dg.escolaridad != null) set["datosGenerales.escolaridad"] = String(dg.escolaridad).trim();
      }

      const nombreNuevo = set["nombre"];
      const apPaternoNuevo = set["apPaterno"];
      const apMaternoNuevo = set["apMaterno"];

      if (nombreNuevo != null || apPaternoNuevo != null || apMaternoNuevo != null) {
        const actual = await Paciente.findById(pacienteId).select("nombre apPaterno apMaterno").lean();

        const n = (nombreNuevo != null ? nombreNuevo : (actual?.nombre || "")).trim();
        const ap = (apPaternoNuevo != null ? apPaternoNuevo : (actual?.apPaterno || "")).trim();
        const am = (apMaternoNuevo != null ? apMaternoNuevo : (actual?.apMaterno || "")).trim();

        const full = `${n} ${ap} ${am}`.trim();
        set["nombreCompletoNorm"] = normalizeName(full);
      }

      if (Object.keys(set).length > 0) {
        await Paciente.findByIdAndUpdate(
          pacienteId,
          { $set: set },
          { new: false }
        ).select("_id");
        pacienteActualizado = true;
      }
    }

    // ============================
    // 4) Receta
    // - con pacienteId: guarda en historial
    // - sin pacienteId: arma receta temporal para impresión
    // ============================
    let recetaIdCreada = null;
    let recetaPaso = null;

    if (receta) {
      const r = receta || {};

      const motivoConsulta = String(r.motivoConsulta || "").trim();

      const diagnosticos = Array.isArray(r.diagnosticos)
        ? r.diagnosticos.map(d => String(d).trim()).filter(Boolean)
        : [];

      const medicamentosRaw = Array.isArray(r.medicamentos) ? r.medicamentos : [];

      const prodIds = medicamentosRaw.map(m => m?.productoId).filter(Boolean);

      const productos = prodIds.length
        ? await Producto.find({ _id: { $in: prodIds } })
          .select("nombre ingreActivo codigoBarras")
          .lean()
        : [];

      const prodMap = new Map(productos.map(p => [String(p._id), p]));

      const medicamentosMapeados = medicamentosRaw.map((m) => {
        const via = String(m?.via || "").trim();
        const viaOtra = String(m?.viaOtra || "").trim();

        const prod = m?.productoId ? prodMap.get(String(m.productoId)) : null;

        const nombreFinal = prod
          ? String(prod.nombre || "").trim()
          : String(m?.nombreLibre || "").trim();

        const cantidadNum =
          m?.cantidad == null || m.cantidad === ""
            ? undefined
            : (Number.isFinite(Number(m.cantidad)) ? Number(m.cantidad) : undefined);

        return {
          productoId: m?.productoId || undefined,
          nombreLibre: nombreFinal,
          dosis: String(m?.dosis || "").trim(),
          via,
          viaOtra: via === "OTRA" ? viaOtra : undefined,
          frecuencia: String(m?.frecuencia || "").trim(),
          duracion: String(m?.duracion || "").trim(),
          cantidad: cantidadNum,
          indicaciones: String(m?.indicaciones || "").trim(),
          esControlado: !!m?.esControlado,
        };
      });

      const medicamentosValidos = medicamentosMapeados.filter((m) =>
        !!m.nombreLibre &&
        !!m.via &&
        (m.via !== "OTRA" || !!m.viaOtra)
      );

      const tieneMinimo = medicamentosValidos.length > 0;

      if (tieneMinimo) {
        if (pacienteId) {
          const recetaDoc = await Receta.create({
            fecha: new Date(),
            pacienteId,
            medicoId,
            farmaciaId,
            motivoConsulta,
            diagnosticos,
            observaciones: String(r.observaciones || "").trim(),
            medicamentos: medicamentosValidos,
            indicacionesGenerales: String(r.indicacionesGenerales || "").trim(),
            citaSeguimiento: r.citaSeguimiento ? new Date(r.citaSeguimiento) : null,
            creadaPor: medicoId,
          });

          recetaIdCreada = recetaDoc._id;

          const diagPrincipal = diagnosticos.length
            ? String(diagnosticos[0]).trim()
            : (medicamentosValidos[0]?.nombreLibre || "Receta");

          await Paciente.findByIdAndUpdate(pacienteId, {
            $addToSet: { recetas: recetaDoc._id },
            $push: {
              ultimasRecetas: {
                $each: [{
                  recetaId: recetaDoc._id,
                  fecha: recetaDoc.fecha,
                  medicoId,
                  diagnosticoPrincipal: diagPrincipal
                }],
                $position: 0,
                $slice: 10
              }
            }
          });
        } else {
          // Paciente de paso: no guardamos en historial, solo armamos para impresión
          recetaPaso = {
            fecha: new Date(),
            motivoConsulta,
            diagnosticos,
            observaciones: String(r.observaciones || "").trim(),
            medicamentos: medicamentosValidos,
            indicacionesGenerales: String(r.indicacionesGenerales || "").trim(),
            citaSeguimiento: r.citaSeguimiento ? new Date(r.citaSeguimiento) : null,
          };
        }
      }
    }

    // ============================
    // 5) Estado final de ficha
    // ============================
    const hayServiciosParaCobro = serviciosSnapshot.length > 0;

    ficha.estado = hayServiciosParaCobro ? "LISTA_PARA_COBRO" : "ATENDIDA";
    ficha.actualizadaPor = medicoId;

    await ficha.save();

    return res.json({
      ok: true,
      ficha,
      estadoFinal: ficha.estado,
      recetaId: recetaIdCreada,
      recetaPaso,
      signosGuardados,
      antecedentesGuardados,
      serviciosTotal: ficha.serviciosTotal ?? 0,
      pacienteActualizado,
    });
  } catch (err) {
    console.error("finalizarConsulta:", err);
    return res.status(500).json({ msg: "Error al finalizar la consulta" });
  }
};

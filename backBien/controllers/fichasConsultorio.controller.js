// backBien/controllers/fichasConsultorio.controller.js
const FichaConsultorio = require("../models/FichaConsultorio");
const Producto = require("../models/Producto");
const Paciente = require("../models/Paciente");


function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;          // empleado/medico
  const fromHeader = req.headers["x-farmacia-id"]; // admin
  const farmaciaId = fromHeader || fromUser;
  if (!farmaciaId) return null;
  return String(farmaciaId);
}


/**
 * POST /api/fichas-consultorio
 * Caja crea ficha (sin cobrar) => EN_ESPERA
 */
exports.crearFicha = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const { pacienteNombre, pacienteTelefono, motivo, urgencia = false, pacienteId } = req.body;

    let pacienteNombreFinal = (pacienteNombre || "").trim();
    let pacienteTelefonoFinal = (pacienteTelefono || "").trim();

    if (pacienteId) {
      const p = await Paciente.findById(pacienteId)
        .select("nombre apellidos contacto.telefono")
        .lean();

      if (!p) return res.status(404).json({ msg: "Paciente no encontrado" });

      pacienteNombreFinal = `${p.nombre || ""} ${p.apellidos || ""}`.trim();
      pacienteTelefonoFinal = (p?.contacto?.telefono || pacienteTelefonoFinal || "").trim();
    }

    if (!pacienteNombreFinal) {
      return res.status(400).json({ msg: "pacienteNombre es requerido" });
    }

    const ficha = await FichaConsultorio.create({
      farmaciaId,
      pacienteNombre: pacienteNombreFinal,
      pacienteTelefono: pacienteTelefonoFinal,
      motivo: (motivo || "").trim(),
      urgencia: !!urgencia,
      pacienteId: pacienteId || undefined,
      creadaPor: req.usuario._id,
      actualizadaPor: req.usuario._id,
    });

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("crearFicha:", err);
    return res.status(500).json({ msg: "Error al crear ficha" });
  }
};

/**
 * PATCH /api/fichas-consultorio/:id/servicios
 * Médico captura servicios y deja ficha LISTA_PARA_COBRO
 *
 * Reglas:
 * - servicios deben ser categoría "Servicio Médico"
 */
exports.actualizarServicios = async (req, res) => {
  try {
    const { id } = req.params;
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const { servicios = [], notasMedico } = req.body;

    const ficha = await FichaConsultorio.findOne({ _id: id, farmaciaId });
    if (!ficha) return res.status(404).json({ msg: "Ficha no encontrada" });

    if (["ATENDIDA", "CANCELADA"].includes(ficha.estado)) {
      return res.status(400).json({ msg: "La ficha ya no se puede modificar" });
    }

    if (ficha.estado === "EN_COBRO") {
      return res.status(400).json({ msg: "La ficha ya está en cobro, no se puede modificar" });
    }

    // ✅ Ahora NO es forzoso traer consulta (ni siquiera servicios)
    // Solo validamos que "servicios" sea arreglo
    if (!Array.isArray(servicios)) {
      return res.status(400).json({ msg: "Servicios inválidos" });
    }

    // Si viene vacío, simplemente guardamos vacío (permitido)
    let serviciosSnapshot = [];

    if (servicios.length > 0) {
      const productoIds = servicios.map((s) => s.productoId).filter(Boolean);
      if (productoIds.length === 0) {
        return res.status(400).json({ msg: "Servicios inválidos: faltan productoId" });
      }

      const productos = await Producto.find({ _id: { $in: productoIds } })
        .select("nombre codigoBarras categoria precioVenta");

      const map = new Map(productos.map((p) => [String(p._id), p]));

      serviciosSnapshot = [];

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

    ficha.servicios = serviciosSnapshot;
    ficha.notasMedico = (notasMedico || "").trim();

    ficha.medicoId = req.usuario._id;
    ficha.inicioAtencionAt = ficha.inicioAtencionAt || new Date();
    if (serviciosSnapshot.length > 0) {
      ficha.finAtencionAt = new Date();
      ficha.estado = "LISTA_PARA_COBRO";
    } else {
      // ✅ Si NO hay servicios: se queda en atención y NO toca finAtencionAt
      ficha.estado = "EN_ATENCION";
    }

    ficha.actualizadaPor = req.usuario._id;

    await ficha.save();

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("actualizarServicios:", err);
    return res.status(500).json({ msg: "Error al actualizar servicios" });
  }
};

/**
 * GET /api/fichas-consultorio/cola?estado=EN_ESPERA
 * Lista FIFO con urgencia primero
 */
exports.obtenerCola = async (req, res) => {
  try {
    const farmaciaId = getFarmaciaActiva(req);
    if (!farmaciaId) return res.status(400).json({ msg: "Falta farmacia activa" });

    const estado = req.query.estado || "EN_ESPERA";

    const fichas = await FichaConsultorio.find({ farmaciaId, estado })
      .sort({ urgencia: -1, llegadaAt: 1 })
      .select(
        "pacienteNombre pacienteTelefono motivo urgencia estado llegadaAt medicoId servicios serviciosTotal"
      )
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

exports.llamarFicha = async (req, res) => {
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
      return res.status(400).json({ msg: "No se pudo llamar: la ficha ya no está en espera." });
    }

    return res.json({ ok: true, ficha });
  } catch (err) {
    console.error("llamarFicha:", err);
    return res.status(500).json({ msg: "Error al llamar ficha" });
  }
};


/**
 * POST /api/fichas-consultorio/:id/tomar-para-cobro
 * Caja “toma” una ficha lista para cobro, evita doble cobro.
 * Solo si estado=LISTA_PARA_COBRO y sin ventaId.
 */
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



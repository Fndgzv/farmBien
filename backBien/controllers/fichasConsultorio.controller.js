const FichaConsultorio = require("../models/FichaConsultorio");
const Producto = require("../models/Producto");

/**
 * .env:
 * CONSULTA_PRODUCTO_IDS=ID_CONSULTA_NORMAL,ID_CONSULTA_FIN_SEMANA
 */
const CONSULTA_PRODUCTO_IDS = (process.env.CONSULTA_PRODUCTO_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getFarmaciaActiva(req) {
  const fromUser = req.usuario?.farmacia;          // empleado/medico
  const fromHeader = req.headers["x-farmacia-id"]; // admin
  const farmaciaId = fromHeader || fromUser;
  if (!farmaciaId) return null;
  return String(farmaciaId);
}

function isConsultaProducto(prod) {
  // Preferido: IDs en .env
  if (CONSULTA_PRODUCTO_IDS.length > 0) {
    return CONSULTA_PRODUCTO_IDS.includes(String(prod._id));
  }
  // Fallback si luego agregas campo a Producto
  return prod.tipoServicioMedico === "CONSULTA";
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

    if (!pacienteNombre?.trim()) {
      return res.status(400).json({ msg: "pacienteNombre es requerido" });
    }

    const ficha = await FichaConsultorio.create({
      farmaciaId,
      pacienteNombre: pacienteNombre.trim(),
      pacienteTelefono: (pacienteTelefono || "").trim(),
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
 * - servicios deben ser categoría "Servicios Médicos"
 * - debe incluir al menos UNA consulta (consulta normal o fin de semana)
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

    if (!Array.isArray(servicios) || servicios.length === 0) {
      return res.status(400).json({ msg: "Debes capturar al menos el renglón de consulta" });
    }

    const productoIds = servicios.map((s) => s.productoId).filter(Boolean);
    if (productoIds.length === 0) {
      return res.status(400).json({ msg: "Servicios inválidos: faltan productoId" });
    }

    const productos = await Producto.find({ _id: { $in: productoIds } })
      .select("nombre codigoBarras categoria precioVenta tipoServicioMedico");

    const map = new Map(productos.map((p) => [String(p._id), p]));

    const serviciosSnapshot = [];
    let traeConsulta = false;

    for (const s of servicios) {
      const p = map.get(String(s.productoId));
      if (!p) return res.status(400).json({ msg: `Producto no existe: ${s.productoId}` });

      const cat = (p.categoria || "").trim();
      if (cat !== "Servicios Médicos") {
        return res.status(400).json({
          msg: `El producto ${p.nombre} no es de categoría Servicios Médicos`,
        });
      }

      if (isConsultaProducto(p)) traeConsulta = true;

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

    if (!traeConsulta) {
      return res.status(400).json({
        msg:
          "La ficha debe incluir al menos una CONSULTA (normal o fin de semana). " +
          "Configura CONSULTA_PRODUCTO_IDS en .env con los IDs permitidos.",
      });
    }

    ficha.servicios = serviciosSnapshot;
    ficha.notasMedico = (notasMedico || "").trim();

    ficha.medicoId = req.usuario._id;
    ficha.inicioAtencionAt = ficha.inicioAtencionAt || new Date();
    ficha.finAtencionAt = new Date();

    ficha.estado = "LISTA_PARA_COBRO";
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



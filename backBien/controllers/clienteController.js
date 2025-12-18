// controllers/clienteController.js
const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");
const Cliente = require('../models/Cliente');
const Venta = require('../models/Venta');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');

// Obtener todos los clientes
exports.obtenerClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find();
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener clientes" });
  }
};


exports.obtenerClientePorId = async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId);

    if (!cliente) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    res.json(cliente);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener el cliente" });
  }
};

// 🔹 Buscar cliente por teléfono
exports.buscarClientePorTelefono = async (req, res) => {
  try {
    const { telefono } = req.params;

    // Validar que el teléfono tenga 10 dígitos
    if (!telefono || !/^\d{10}$/.test(telefono)) {
      return res.status(400).json({ mensaje: "Número de teléfono inválido" });
    }

    const cliente = await Cliente.findOne({ telefono }).select("_id nombre telefono totalMonedero");

    if (!cliente) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    res.json(cliente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al buscar cliente por teléfono" });
  }
};

// Interpreta 'YYYY-MM-DD' como medianoche LOCAL de la zona enviada por el front (tz = getTimezoneOffset en minutos)
// Devuelve { gte, lt } en UTC (lt = día siguiente exclusivo)
function dayRangeUtcFromQuery(fechaIni, fechaFin, tzMinParam) {
  const parseYMD = (s, defDate) => {
    if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return { y, m, d };
    }
    return { y: defDate.getFullYear(), m: defDate.getMonth() + 1, d: defDate.getDate() };
  };

  const now = new Date();
  const defIni = new Date(now.getFullYear(), now.getMonth(), 1);
  const defFin = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const { y: yi, m: mi, d: di } = parseYMD(fechaIni, defIni);
  const { y: yf, m: mf, d: df } = parseYMD(fechaFin, defFin);

  // ⚠️ Fallback a CDMX si no llega tz (360). En México ya no hay DST en CDMX.
  const tzMin = Number.isFinite(+tzMinParam) ? +tzMinParam : 360;

  const gteMs = Date.UTC(yi, mi - 1, di) + tzMin * 60000;        // 00:00 local → UTC
  const ltMs  = Date.UTC(yf, mf - 1, df + 1) + tzMin * 60000;    // (fin+1d) local → UTC

  return { gte: new Date(gteMs), lt: new Date(ltMs) };
}

/**
 * GET /api/clientes/buscar?q=texto&limit=20
 * Devuelve una lista (limitada) de clientes cuyo nombre
 * coincide con el texto, ignorando acentos y mayúsculas.
 * Ej: "Noe" coincide con "Noé", "Maria" con "María", etc.
 */
exports.buscarClientesPorNombre = async (req, res) => {
  try {
    const qRaw = String(req.query.q || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));

    if (!qRaw) return res.json({ ok: true, rows: [] });

    // Construye un regex que contempla acentos (tanto si los teclean como si no)
    const rx = buildAccentInsensitiveRegex(qRaw);

    const rows = await Cliente.find(
      { nombre: rx },
      { _id: 1, nombre: 1, telefono: 1, totalMonedero: 1 }
    )
      // NO usamos collation para que el control de acentos dependa del regex
      .sort({ nombre: 1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, rows });
  } catch (e) {
    console.error('[buscarClientesPorNombre][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al buscar clientes' });
  }
};

/**
 * Genera un RegExp que iguala letras con y sin acento (y mayúsc/minúsc).
 * Ej: "Noe" -> /N[oóòöôOÓÒÖÔ]…/i
 */
function buildAccentInsensitiveRegex(text) {
  // Escapa meta-caracteres de regex
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Mapa de variantes acentuadas (incluye mayúsculas)
  const map = {
    a: 'aáàäâAÁÀÄÂ',
    e: 'eéèëêEÉÈËÊ',
    i: 'iíìïîIÍÌÏÎ',
    o: 'oóòöôOÓÒÖÔ',
    u: 'uúùüûUÚÙÜÛ',
    n: 'nñNÑ',
    c: 'cçCÇ',
  };

  // Construye el patrón sumando clases de caracteres
  const pattern = [...text].map(ch => {
    const group = map[ch] || map[ch.toLowerCase()];
    return group ? `[${esc(group)}]` : esc(ch);
  }).join('');

  return new RegExp(pattern, 'i'); // i = case-insensitive
}

// Crear un nuevo cliente, desde una venta, con telefono y nombre
exports.crearClienteDesdeVenta = async (req, res) => {
  try {
    const { nombre, telefono } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ mensaje: "Nombre y teléfono son obligatorios" });
    }

    let clienteExistente = await Cliente.findOne({ telefono });
    if (clienteExistente) {
      return res.status(400).json({ mensaje: "El cliente ya está registrado" });
    }

    // 🔹 Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(telefono, 10);

    const nuevoCliente = new Cliente({
      nombre,
      telefono,
      password: hashedPassword, // Se asigna el teléfono encriptado como contraseña por defecto
    });
    await nuevoCliente.save();
    res.status(201).json(nuevoCliente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al crear cliente" });
  }
};

const okId = id => mongoose.isValidObjectId(id);

// Listar clientes con paginación y filtro por nombre
exports.listarClientes = async (req, res) => {
  try {
    const {
      q = "",           // filtro por nombre
      page = 1,         // página
      limit = 20,       // documentos por página
      sortBy = "nombre",// "nombre" | "totalMonedero"
      sortDir = "asc"   // "asc" | "desc"
    } = req.query;

    const pageNum  = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const skip     = (pageNum - 1) * limitNum;

    // Filtro por nombre (case-insensitive)
    const filtro = q ? { nombre: { $regex: String(q), $options: "i" } } : {};

    // Validación y armado de sort
    const allowed = new Set(["nombre", "totalMonedero"]);
    const sortField = allowed.has(String(sortBy)) ? String(sortBy) : "nombre";
    const dir = String(sortDir).toLowerCase() === "desc" ? -1 : 1;

    // Tiebreaker: si ordenas por totalMonedero, empatados se ordenan por nombre asc
    const sortObj = { [sortField]: dir, ...(sortField !== "nombre" ? { nombre: 1 } : {}) };

    const [rows, total] = await Promise.all([
      Cliente.find(filtro)
        .collation({ locale: "es", strength: 1 })   // orden alfabético español para 'nombre'
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select("nombre telefono email domicilio totalMonedero")
        .lean(),
      Cliente.countDocuments(filtro)
    ]);

    res.json({
      rows,
      paginacion: {
        total,
        page: pageNum,
        limit: limitNum,
        sortBy: sortField,
        sortDir: dir === 1 ? "asc" : "desc"
      }
    });
  } catch (error) {
    console.error("[listarClientes][ERROR]", error);
    res.status(500).json({ mensaje: "Error al listar clientes" });
  }
};


// ===== ALTA RÁPIDA =====
exports.crearClienteBasico = async (req, res) => {
  try {
    const { nombre, telefono, email, domicilio } = req.body || {};
    if (!nombre || !telefono) return res.status(400).json({ ok: false, mensaje: 'Nombre y teléfono son obligatorios' });
    if (!/^\d{10}$/.test(String(telefono))) return res.status(400).json({ ok: false, mensaje: 'Teléfono debe tener 10 dígitos' });

    const existe = await Cliente.findOne({ telefono });
    if (existe) return res.status(400).json({ ok: false, mensaje: 'Ya existe un cliente con ese teléfono' });

    const password = await bcrypt.hash(String(telefono), 10);
    const nuevo = await Cliente.create({ nombre, telefono, email: email || '', domicilio: domicilio || '', password });
    res.status(201).json({ ok: true, cliente: { _id: nuevo._id, nombre, telefono, email: nuevo.email, domicilio: nuevo.domicilio, totalMonedero: nuevo.totalMonedero } });
  } catch (e) {
    console.error('[crearClienteBasico][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al crear cliente' });
  }
};

// ===== UPDATE INLINE =====
exports.actualizarClienteInline = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });

    const patch = {};
    ['nombre', 'telefono', 'email', 'domicilio'].forEach(k => {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    });

    if (patch.telefono && !/^\d{10}$/.test(String(patch.telefono))) {
      return res.status(400).json({ ok: false, mensaje: 'Teléfono debe tener 10 dígitos' });
    }
    // Único por teléfono
    if (patch.telefono) {
      const ya = await Cliente.findOne({ telefono: patch.telefono, _id: { $ne: id } });
      if (ya) return res.status(400).json({ ok: false, mensaje: 'Otro cliente ya usa ese teléfono' });
    }

    const upd = await Cliente.findByIdAndUpdate(id, patch, { new: true, runValidators: true, projection: 'nombre telefono email domicilio totalMonedero' });
    if (!upd) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });

    res.json({ ok: true, cliente: upd });
  } catch (e) {
    console.error('[actualizarClienteInline][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar' });
  }
};

// ===== SUBTABLA: VENTAS =====
exports.subVentas = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });
    }

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin, req.query.tz);

    const match = { cliente: mongoose.Types.ObjectId(id), fecha: { $gte: gte, $lt: lt } };

    const pipeline = [
      { $match: match },

      // costoVenta calculado a partir de productos
      {
        $addFields: {
          costoVenta: {
            $sum: {
              $map: {
                input: { $ifNull: ['$productos', []] },
                as: 'p',
                in: { $multiply: [{ $ifNull: ['$$p.costo', 0] }, { $ifNull: ['$$p.cantidad', 0] }] }
              }
            }
          }
        }
      },

      // derivados por venta
      {
        $addFields: {
          numProductos: { $ifNull: ['$cantidadProductos', 0] },
          alMonedero: { $ifNull: ['$totalMonederoCliente', 0] },
          descuento: { $ifNull: ['$totalDescuento', 0] },
          costo: { $ifNull: ['$costoVenta', 0] },
          total: { $ifNull: ['$total', 0] },
          utilidad: { $subtract: ['$total', '$costo'] },
          gananciaPct: {
            $cond: [
              { $gt: ['$costo', 0] },
              { $multiply: [{ $divide: [{ $subtract: ['$total', '$costo'] }, '$costo'] }, 100] },
              null
            ]
          }
        }
      },

      // lookups nombres
      { $lookup: { from: 'farmacias', localField: 'farmacia', foreignField: '_id', as: 'fx' } },
      { $lookup: { from: 'usuarios', localField: 'usuario', foreignField: '_id', as: 'ux' } },
      {
        $addFields: {
          farmaciaNombre: { $ifNull: [{ $arrayElemAt: ['$fx.nombre', 0] }, '(s/farmacia)'] },
          usuarioNombre: { $ifNull: [{ $arrayElemAt: ['$ux.nombre', 0] }, '(s/usuario)'] },
        }
      },
      { $project: { fx: 0, ux: 0 } },

      // lookup productos y merge nombre/código
      {
        $lookup: {
          from: 'productos',
          let: { prodIds: { $map: { input: { $ifNull: ['$productos', []] }, as: 'p', in: '$$p.producto' } } },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', { $ifNull: ['$$prodIds', []] }] } } },
            { $project: { _id: 1, nombre: 1, codigoBarras: 1 } }
          ],
          as: 'prodsLookup'
        }
      },
      {
        $addFields: {
          productos: {
            $map: {
              input: { $ifNull: ['$productos', []] },
              as: 'p',
              in: {
                $mergeObjects: [
                  '$$p',
                  {
                    nombre: {
                      $let: {
                        vars: {
                          m: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: '$prodsLookup',
                                  as: 'q',
                                  cond: { $eq: ['$$q._id', '$$p.producto'] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: { $ifNull: ['$$m.nombre', ''] }
                      }
                    },
                    codigoBarras: {
                      $let: {
                        vars: {
                          m: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: '$prodsLookup',
                                  as: 'q',
                                  cond: { $eq: ['$$q._id', '$$p.producto'] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: { $ifNull: ['$$m.codigoBarras', ''] }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      },
      { $project: { prodsLookup: 0 } },

      { $sort: { fecha: -1, _id: -1 } },

      {
        $facet: {
          rows: [
            {
              $project: {
                folio: 1, fecha: 1, farmacia: 1, usuario: 1,
                farmaciaNombre: 1, usuarioNombre: 1,
                numProductos: 1, alMonedero: 1, descuento: 1, costo: 1, utilidad: 1, gananciaPct: 1, total: 1,
                productos: 1, formaPago: 1
              }
            }
          ],
          footerAgg: [
            {
              $group: {
                _id: null,
                totalNumProductos: { $sum: '$numProductos' },
                totalAlMonedero: { $sum: '$alMonedero' },
                totalDescuento: { $sum: '$descuento' },
                totalCosto: { $sum: '$costo' },
                totalUtilidad: { $sum: '$utilidad' },
                totalTotal: { $sum: '$total' }
              }
            }
          ]
        }
      }
    ];

    const [agg] = await Venta.aggregate(pipeline);
    const rows = agg?.rows ?? [];
    const f = agg?.footerAgg?.[0] || {
      totalNumProductos: 0, totalAlMonedero: 0, totalDescuento: 0,
      totalCosto: 0, totalUtilidad: 0, totalTotal: 0
    };

    res.json({
      ok: true,
      footer: {
        numProductos: f.totalNumProductos,
        alMonedero: f.totalAlMonedero,
        descuento: f.totalDescuento,
        costo: f.totalCosto,
        utilidad: f.totalUtilidad,
        total: f.totalTotal
      },
      rows
    });
  } catch (e) {
    console.error('[subVentas][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar compras del cliente' });
  }
};

// ===== SUBTABLA: PEDIDOS =====
exports.subPedidos = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin, req.query.tz);
    const incluirDetalle = ['1', 'true', 'sí', 'si'].includes(String(req.query.detalle || '').toLowerCase());

    const filtro = { cliente: id, fechaPedido: { $gte: gte, $lt: lt } };

    const docs = await Pedido.find(filtro)
      .sort({ fechaPedido: -1 })
      .populate('farmacia', 'nombre')
      .populate('usuarioPidio', 'nombre');

    let foot = { costo: 0, precio: 0, ingreso: 0, resta: 0 };

    const toNum = (v) => Number(v) || 0;

    const rows = docs.map(p => {
      const costo = toNum(p.costo);
      const precio = toNum(p.total);
      const aCuenta = toNum(p.aCuenta);
      const resta = toNum(p.resta);

      const anticipoDet = {
        efectivo: toNum(p.pagoACuenta?.efectivo),
        tarjeta: toNum(p.pagoACuenta?.tarjeta),
        transferencia: toNum(p.pagoACuenta?.transferencia),
        vale: toNum(p.pagoACuenta?.vale)
      };
      const pagoRestaDet = {
        efectivo: toNum(p.pagoResta?.efectivo),
        tarjeta: toNum(p.pagoResta?.tarjeta),
        transferencia: toNum(p.pagoResta?.transferencia),
        vale: toNum(p.pagoResta?.vale)
      };
      const pagoRestaTotal = pagoRestaDet.efectivo + pagoRestaDet.tarjeta + pagoRestaDet.transferencia + pagoRestaDet.vale;
      const ingreso = aCuenta + pagoRestaTotal;

      const utilidad = +(precio - costo).toFixed(2);
      const gananciaPct = costo > 0 ? +(((utilidad) * 100) / costo).toFixed(2) : null;

      foot.costo += costo;
      foot.precio += precio;
      foot.ingreso += ingreso;
      foot.resta += resta;

      const detalle = !incluirDetalle ? null : {
        estado: p.estado,
        anticipo: aCuenta,
        anticipoDet,
        pagoResta: pagoRestaDet
      };

      return {
        pedidoId: p._id,
        folio: p.folio,
        fechaPedido: p.fechaPedido,
        farmacia: p.farmacia?.nombre || '',
        usuarioPidio: p.usuarioPidio?.nombre || '',
        descripcion: p.descripcion || '',
        estado: p.estado,

        costo, precio, aCuenta, resta, ingreso, utilidad, gananciaPct,
        formasPago: { anticipo: anticipoDet, resta: pagoRestaDet },
        detalle
      };
    });

    res.json({
      ok: true,
      footer: {
        costo: +foot.costo.toFixed(2),
        precio: +foot.precio.toFixed(2),
        ingreso: +foot.ingreso.toFixed(2),
        resta: +foot.resta.toFixed(2),
        utilidad: +((foot.precio - foot.costo).toFixed(2)),
        gananciaPct: foot.costo > 0
          ? +((((foot.precio - foot.costo) * 100) / foot.costo).toFixed(2))
          : null
      },
      rows
    });
  } catch (e) {
    console.error('[subPedidos][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar pedidos del cliente' });
  }
};

// ===== SUBTABLA: DEVOLUCIONES =====
exports.subDevoluciones = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin, req.query.tz);

    const filtro = { cliente: id, fecha: { $gte: gte, $lt: lt } };

    const docs = await Devolucion.find(filtro)
      .sort({ fecha: -1 })
      .populate('farmacia', 'nombre')
      .populate('usuario', 'nombre')
      .populate('venta', 'folio')
      .populate('productosDevueltos.producto', 'nombre codigoBarras');

    const toNum = (v) => Number(v) || 0;
    let foot = { dinero: 0, vale: 0, total: 0 };

    const rows = docs.map(d => {
      foot.dinero += toNum(d.dineroDevuelto);
      foot.vale += toNum(d.valeDevuelto);
      foot.total += toNum(d.totalDevuelto);

      const productos = (d.productosDevueltos || []).map(p => ({
        producto: p.producto?.nombre || '',
        codigoBarras: p.producto?.codigoBarras || '',
        cantidad: p.cantidad,
        motivo: p.motivo,
        devuelto: p.precioXCantidad
      }));

      return {
        devolucionId: d._id,
        fecha: d.fecha,
        farmacia: d.farmacia?.nombre || '',
        usuario: d.usuario?.nombre || '',
        ventaFolio: d.venta?.folio || '',
        dineroDevuelto: toNum(d.dineroDevuelto),
        valeDevuelto: toNum(d.valeDevuelto),
        totalDevuelto: toNum(d.totalDevuelto),
        productos
      };
    });

    res.json({
      ok: true,
      footer: {
        dineroDevuelto: +foot.dinero.toFixed(2),
        valeDevuelto: +foot.vale.toFixed(2),
        totalDevuelto: +foot.total.toFixed(2)
      },
      rows
    });
  } catch (e) {
    console.error('[subDevoluciones][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar devoluciones' });
  }
};

// ===== SUBTABLA: CANCELACIONES =====
exports.subCancelaciones = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin, req.query.tz);
    const oid = mongoose.Types.ObjectId(id);

    const [agg] = await Cancelacion.aggregate([
      { $match: { fechaCancelacion: { $gte: gte, $lt: lt } } },
      { $lookup: { from: 'pedidos', localField: 'pedido', foreignField: '_id', as: 'p' } },
      { $unwind: '$p' },
      { $match: { 'p.cliente': oid } },

      { $lookup: { from: 'farmacias', localField: 'p.farmacia', foreignField: '_id', as: 'fx' } },
      { $lookup: { from: 'usuarios', localField: 'usuario', foreignField: '_id', as: 'ux' } },
      {
        $addFields: {
          farmaciaNombre: { $ifNull: [{ $arrayElemAt: ['$fx.nombre', 0] }, ''] },
          usuarioNombre: { $ifNull: [{ $arrayElemAt: ['$ux.nombre', 0] }, ''] }
        }
      },
      { $project: { fx: 0, ux: 0 } },

      { $sort: { fechaCancelacion: -1, _id: -1 } },

      {
        $facet: {
          rows: [
            {
              $project: {
                cancelacionId: '$_id',
                fechaCancelacion: 1,
                farmacia: '$farmaciaNombre',
                usuario: '$usuarioNombre',
                pedidoFolio: '$p.folio',
                dineroDevuelto: { $ifNull: ['$dineroDevuelto', 0] },
                valeDevuelto: { $ifNull: ['$valeDevuelto', 0] },
                totalDevuelto: { $ifNull: ['$totalDevuelto', 0] }
              }
            }
          ],
          footerAgg: [
            {
              $group: {
                _id: null,
                dinero: { $sum: { $ifNull: ['$dineroDevuelto', 0] } },
                vale: { $sum: { $ifNull: ['$valeDevuelto', 0] } },
                total: { $sum: { $ifNull: ['$totalDevuelto', 0] } }
              }
            }
          ]
        }
      }
    ]);

    const rows = agg?.rows ?? [];
    const fAgg = agg?.footerAgg?.[0] || { dinero: 0, vale: 0, total: 0 };

    res.json({
      ok: true,
      footer: {
        dineroDevuelto: +Number(fAgg.dinero).toFixed(2),
        valeDevuelto: +Number(fAgg.vale).toFixed(2),
        totalDevuelto: +Number(fAgg.total).toFixed(2)
      },
      rows
    });
  } catch (e) {
    console.error('[subCancelaciones][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar cancelaciones' });
  }
};

// ===== SUBTABLA: MONEDERO =====
exports.subMonedero = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin, req.query.tz);
    const oid = mongoose.Types.ObjectId(id);

    const [agg] = await Cliente.aggregate([
      { $match: { _id: oid } },
      {
        $project: {
          totalMonedero: 1,
          movimientos: {
            $filter: {
              input: { $ifNull: ['$monedero', []] },
              as: 'm',
              cond: { $and: [{ $gte: ['$$m.fechaUso', gte] }, { $lt: ['$$m.fechaUso', lt] }] }
            }
          }
        }
      },
      {
        $facet: {
          rows: [
            { $unwind: { path: '$movimientos', preserveNullAndEmptyArrays: false } },
            // nombre de farmacia
            {
              $lookup: {
                from: 'farmacias',
                localField: 'movimientos.farmaciaUso',
                foreignField: '_id',
                as: 'fx'
              }
            },
            {
              $addFields: {
                farmaciaNombre: { $ifNull: [{ $arrayElemAt: ['$fx.nombre', 0] }, ''] }
              }
            },
            { $sort: { 'movimientos.fechaUso': -1 } },
            {
              $project: {
                _id: 0,
                fecha: '$movimientos.fechaUso',
                ingreso: { $ifNull: ['$movimientos.montoIngreso', 0] },
                egreso: { $ifNull: ['$movimientos.montoEgreso', 0] },
                motivo: { $ifNull: ['$movimientos.motivo', ''] },
                farmacia: '$farmaciaNombre'
              }
            }
          ],
          footerAgg: [
            { $unwind: { path: '$movimientos', preserveNullAndEmptyArrays: false } },
            {
              $group: {
                _id: null,
                ingresos: { $sum: { $ifNull: ['$movimientos.montoIngreso', 0] } },
                egresos: { $sum: { $ifNull: ['$movimientos.montoEgreso', 0] } }
              }
            }
          ],
          meta: [
            { $project: { saldo: '$totalMonedero' } },
            { $limit: 1 }
          ]
        }
      }
    ]);

    const rows = agg?.rows ?? [];
    const fAgg = agg?.footerAgg?.[0] || { ingresos: 0, egresos: 0 };
    const meta = agg?.meta?.[0] || { saldo: 0 };

    res.json({
      ok: true,
      footer: {
        ingresos: +Number(fAgg.ingresos || 0).toFixed(2),
        egresos: +Number(fAgg.egresos || 0).toFixed(2),
        saldo: +Number(meta.saldo || 0).toFixed(2)
      },
      rows
    });
  } catch (e) {
    console.error('[subMonedero][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar monedero' });
  }
};

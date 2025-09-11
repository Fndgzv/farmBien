// controllers/clienteController.js
const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");
const Cliente = require('../models/Cliente');
const Venta = require('../models/Venta');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');
const Farmacia = require('../models/Farmacia');
const Usuario = require('../models/Usuario');

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

// ==== utils de fechas (usa tu helper si ya lo tienes) ====
function dayRangeUtcFromQuery(fechaIni, fechaFin) {
  const zero = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endNext = d => { const x = zero(d); x.setDate(x.getDate()+1); return x; };
  // sin fechas => TODO el rango
  if (!fechaIni && !fechaFin) return { gte: new Date('1970-01-01T00:00:00Z'), lt: new Date('3000-01-01T00:00:00Z') };
  if (fechaIni && !fechaFin) return { gte: zero(fechaIni), lt: endNext(fechaIni) };
  if (!fechaIni && fechaFin) return { gte: zero(fechaFin), lt: endNext(fechaFin) };
  const g = zero(fechaIni), l = endNext(fechaFin);
  return g <= l ? { gte: g, lt: l } : { gte: l, lt: g };
}

const toNum = v => (Number.isFinite(+v) ? +v : 0);
const okId = id => mongoose.isValidObjectId(id);

// Listar clientes con paginación y filtro por nombre
exports.listarClientes = async (req, res) => {

  try {
    const {
      q = "",      // filtro por nombre
      page = 1,    // página
      limit = 20   // documentos por página
    } = req.query;

    const filtro = q
      ? { nombre: { $regex: q, $options: "i" } } // búsqueda case-insensitive
      : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [rows, total] = await Promise.all([
      Cliente.find(filtro)
        .sort({ nombre: 1 }) // ordenar alfabéticamente asc
        .skip(skip)
        .limit(parseInt(limit))
        .select("nombre telefono email domicilio totalMonedero"),
      Cliente.countDocuments(filtro)
    ]);

    res.json({
      rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit)
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
    if (!nombre || !telefono) return res.status(400).json({ ok:false, mensaje:'Nombre y teléfono son obligatorios' });
    if (!/^\d{10}$/.test(String(telefono))) return res.status(400).json({ ok:false, mensaje:'Teléfono debe tener 10 dígitos' });

    const existe = await Cliente.findOne({ telefono });
    if (existe) return res.status(400).json({ ok:false, mensaje:'Ya existe un cliente con ese teléfono' });

    const password = await bcrypt.hash(String(telefono), 10);
    const nuevo = await Cliente.create({ nombre, telefono, email: email || '', domicilio: domicilio || '', password });
    res.status(201).json({ ok:true, cliente: { _id: nuevo._id, nombre, telefono, email: nuevo.email, domicilio: nuevo.domicilio, totalMonedero: nuevo.totalMonedero }});
  } catch (e) {
    console.error('[crearClienteBasico][ERROR]', e);
    res.status(500).json({ ok:false, mensaje:'Error al crear cliente' });
  }
};

// ===== UPDATE INLINE =====
exports.actualizarClienteInline = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok:false, mensaje:'clienteId inválido' });

    const patch = {};
    ['nombre','telefono','email','domicilio'].forEach(k => {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    });

    if (patch.telefono && !/^\d{10}$/.test(String(patch.telefono))) {
      return res.status(400).json({ ok:false, mensaje:'Teléfono debe tener 10 dígitos' });
    }
    // Único por teléfono
    if (patch.telefono) {
      const ya = await Cliente.findOne({ telefono: patch.telefono, _id: { $ne: id } });
      if (ya) return res.status(400).json({ ok:false, mensaje:'Otro cliente ya usa ese teléfono' });
    }

    const upd = await Cliente.findByIdAndUpdate(id, patch, { new:true, runValidators:true, projection: 'nombre telefono email domicilio totalMonedero' });
    if (!upd) return res.status(404).json({ ok:false, mensaje:'Cliente no encontrado' });

    res.json({ ok:true, cliente: upd });
  } catch (e) {
    console.error('[actualizarClienteInline][ERROR]', e);
    res.status(500).json({ ok:false, mensaje:'Error al actualizar' });
  }
};

// ===== SUBTABLA: VENTAS =====
exports.subVentas = async (req, res) => {
  try {
    const { id } = req.params;                 // clienteId
    const page  = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const skip  = (page - 1) * limit;

    // rango opcional
    const { fechaIni, fechaFin } = req.query;
    let fechaMatch = {};
    if (fechaIni || fechaFin) {
      fechaMatch = {
        fecha: {
          ...(fechaIni ? { $gte: new Date(fechaIni) } : {}),
          ...(fechaFin ? { $lt:  new Date(fechaFin) } : {}),
        }
      };
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok:false, mensaje: 'clienteId inválido' });
    }

    const match = { cliente: new mongoose.Types.ObjectId(id), ...fechaMatch };

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
          alMonedero:   { $ifNull: ['$totalMonederoCliente', 0] },
          descuento:    { $ifNull: ['$totalDescuento', 0] },
          costo:        { $ifNull: ['$costoVenta', 0] },
          total:        { $ifNull: ['$total', 0] },
        }
      },
      {
        $addFields: {
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

      // lookups de nombres (farmacia, usuario)
      { $lookup: { from: 'farmacias', localField: 'farmacia', foreignField: '_id', as: 'fx' } },
      { $lookup: { from: 'usuarios',  localField: 'usuario',  foreignField: '_id', as: 'ux' } },
      {
        $addFields: {
          farmaciaNombre: { $ifNull: [{ $arrayElemAt: ['$fx.nombre', 0] }, '(s/farmacia)'] },
          usuarioNombre:  { $ifNull: [{ $arrayElemAt: ['$ux.nombre', 0] },  '(s/usuario)'] },
        }
      },
      { $project: { fx:0, ux:0 } },

      // === LOOKUP de datos de cada producto (nombre, codigoBarras) y merge en productos ===
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

      // para detalle: productos (ya con nombre/cb) y formaPago
      {
        $project: {
          folio: 1, fecha:1, farmacia:1, usuario:1,
          farmaciaNombre:1, usuarioNombre:1,
          numProductos:1, alMonedero:1, descuento:1, costo:1, utilidad:1, gananciaPct:1, total:1,
          productos: 1, formaPago: 1
        }
      },

      { $sort: { fecha: -1, _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: limit }
          ],
          totalCounter: [
            { $count: 'total' }
          ],
          footerAgg: [
            {
              $group: {
                _id: null,
                totalNumProductos: { $sum: '$numProductos' },
                totalAlMonedero:   { $sum: '$alMonedero' },
                totalDescuento:    { $sum: '$descuento' },
                totalCosto:        { $sum: '$costo' },
                totalUtilidad:     { $sum: '$utilidad' },
                totalTotal:        { $sum: '$total' }
              }
            }
          ]
        }
      }
    ];

    const [agg] = await Venta.aggregate(pipeline);
    const rows = agg?.rows ?? [];
    const total = (agg?.totalCounter?.[0]?.total) ?? 0;
    const f = agg?.footerAgg?.[0] || {
      totalNumProductos: 0, totalAlMonedero: 0, totalDescuento: 0,
      totalCosto: 0, totalUtilidad: 0, totalTotal: 0
    };

    res.json({
      ok: true,
      rows,
      paginacion: { total, page, limit },
      footer: {
        numProductos: f.totalNumProductos,
        alMonedero:   f.totalAlMonedero,
        descuento:    f.totalDescuento,
        costo:        f.totalCosto,
        utilidad:     f.totalUtilidad,
        total:        f.totalTotal
      }
    });
  } catch (e) {
    console.error('[subVentas][ERROR]', e);
    res.status(500).json({ ok:false, mensaje: 'Error al consultar compras del cliente' });
  }
};

// ===================== Helpers de fechas (local -> UTC) =====================

// "2025-09-06" -> Date local 2025-09-06 00:00:00 (zona local)
function parseISODateLocal(iso /* 'YYYY-MM-DD' */) {
  if (!iso || typeof iso !== 'string') return null;
  const [y, m, d] = iso.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Convierte un Date local a un límite UTC para Mongo (guardas en UTC)
function toUtcBoundary(localDate) {
  // restamos el offset local para obtener el instante UTC equivalente
  return new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
}

/**
 * Rango UTC desde query:
 * - Si no mandan fechas: fechaIni = 1er día del mes actual, fechaFin = hoy.
 * - Devuelve { gte, lt } en UTC, donde lt es el día siguiente (exclusivo).
 */
function dayRangeUtcFromQuery(fechaIni, fechaFin) {
  const now = new Date();

  // defaults locales
  const defIniLocal = new Date(now.getFullYear(), now.getMonth(), 1);             // 1er día del mes local
  const defFinLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // hoy local (00:00)

  const iniLocal = parseISODateLocal(fechaIni) || defIniLocal;
  const finLocal = parseISODateLocal(fechaFin) || defFinLocal;

  // fin exclusivo = (fin local) + 1 día
  const finExclusiveLocal = new Date(finLocal);
  finExclusiveLocal.setDate(finExclusiveLocal.getDate() + 1);

  return {
    gte: toUtcBoundary(iniLocal),           // >= inicio del día local en UTC
    lt:  toUtcBoundary(finExclusiveLocal),  // < día siguiente local en UTC
  };
}

// ===== SUBTABLA: PEDIDOS =====
exports.subPedidos = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) {
      return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });
    }

    // Rango de fechas (1er día del mes y hoy si no vienen)
    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin);

    const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip  = (page - 1) * limit;

    // Si quieres además emitir un bloque "detalle" extra (opcional)
    const incluirDetalle = ['1', 'true', 'sí', 'si'].includes(String(req.query.detalle || '').toLowerCase());

    const filtro = {
      cliente: id,
      fechaPedido: { $gte: gte, $lt: lt }
    };

    const [docs, total] = await Promise.all([
      Pedido.find(filtro)
        .sort({ fechaPedido: -1 })
        .skip(skip)
        .limit(limit)
        .populate('farmacia', 'nombre')
        .populate('usuarioPidio', 'nombre'),
      Pedido.countDocuments(filtro)
    ]);

    let foot = { costo: 0, precio: 0, ingreso: 0, resta: 0 };

    const rows = docs.map(p => {
      const costo   = toNum(p.costo);
      const precio  = toNum(p.total);
      const aCuenta = toNum(p.aCuenta);
      const resta   = toNum(p.resta);

      // Desglose anticipo (pago a cuenta)
      const anticipoDet = {
        efectivo: toNum(p.pagoACuenta?.efectivo),
        tarjeta: toNum(p.pagoACuenta?.tarjeta),
        transferencia: toNum(p.pagoACuenta?.transferencia),
        vale: toNum(p.pagoACuenta?.vale)
      };

      // Desglose pago de la resta
      const pagoRestaDet = {
        efectivo: toNum(p.pagoResta?.efectivo),
        tarjeta: toNum(p.pagoResta?.tarjeta),
        transferencia: toNum(p.pagoResta?.transferencia),
        vale: toNum(p.pagoResta?.vale)
      };

      // Ingreso total = anticipo + pagos de la resta
      const pagoRestaTotal = pagoRestaDet.efectivo + pagoRestaDet.tarjeta + pagoRestaDet.transferencia + pagoRestaDet.vale;
      const ingreso        = aCuenta + pagoRestaTotal;

      const utilidad  = +(precio - costo).toFixed(2);
      const gananciaPct = costo > 0 ? +(((utilidad) * 100) / costo).toFixed(2) : null;

      // Totales para footer
      foot.costo   += costo;
      foot.precio  += precio;
      foot.ingreso += ingreso;
      foot.resta   += resta;

      // Estructura de detalle opcional (si ?detalle=1)
      const detalle = !incluirDetalle ? null : {
        estado: p.estado,
        anticipo: aCuenta,
        anticipoDet,          // desglose del anticipo
        pagoResta: pagoRestaDet  // desglose de pagos para la resta
      };

      return {
        pedidoId: p._id,
        folio: p.folio,
        fechaPedido: p.fechaPedido,
        farmacia: p.farmacia?.nombre || '',
        usuarioPidio: p.usuarioPidio?.nombre || '',
        descripcion: p.descripcion || '',
        estado: p.estado,

        // montos
        costo,
        precio,
        aCuenta,
        resta,
        ingreso,
        utilidad,
        gananciaPct,

        // 🔹 SIEMPRE incluimos el desglose de formas de pago
        formasPago: {
          anticipo: anticipoDet,
          resta: pagoRestaDet
        },

        // 🔸 adicional/retrocompat: solo si piden `?detalle=1`
        detalle
      };
    });

    res.json({
      ok: true,
      paginacion: {
        page,
        limit,
        total,
        totalPaginas: Math.ceil(total / limit)
      },
      footer: {
        costo:     +foot.costo.toFixed(2),
        precio:    +foot.precio.toFixed(2),
        ingreso:   +foot.ingreso.toFixed(2),
        resta:     +foot.resta.toFixed(2),
        utilidad:  +((foot.precio - foot.costo).toFixed(2)),
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
    if (!okId(id)) return res.status(400).json({ ok:false, mensaje:'clienteId inválido' });

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin);
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filtro = { cliente: id, fecha: { $gte: gte, $lt: lt } };

    const [docs, total] = await Promise.all([
      Devolucion.find(filtro)
        .sort({ fecha: -1 }).skip(skip).limit(limit)
        .populate('farmacia','nombre').populate('usuario','nombre').populate('venta','folio')
        .populate('productosDevueltos.producto','nombre codigoBarras'),
      Devolucion.countDocuments(filtro)
    ]);

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
      ok:true,
      paginacion: { page, limit, total, totalPaginas: Math.ceil(total/limit) },
      footer: {
        dineroDevuelto:+foot.dinero.toFixed(2),
        valeDevuelto:+foot.vale.toFixed(2),
        totalDevuelto:+foot.total.toFixed(2)
      },
      rows
    });
  } catch (e) {
    console.error('[subDevoluciones][ERROR]', e);
    res.status(500).json({ ok:false, mensaje:'Error al consultar devoluciones' });
  }
};

// ===== SUBTABLA: CANCELACIONES =====
exports.subCancelaciones = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok:false, mensaje:'clienteId inválido' });

    const { gte, lt } = dayRangeUtcFromQuery(req.query.fechaIni, req.query.fechaFin);
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filtro = { fechaCancelacion: { $gte: gte, $lt: lt } };

    // necesitamos solo cancelaciones cuyo pedido pertenezca al cliente
    const docs = await Cancelacion.find(filtro)
      .sort({ fechaCancelacion: -1 }).skip(skip).limit(limit)
      .populate({
        path:'pedido',
        select:'folio cliente total aCuenta resta costo descripcion',
        populate:[ { path:'cliente', select:'_id' }, { path:'farmacia', select:'nombre' } ]
      })
      .populate('usuario','nombre');

    // total “paginado”
    const total = await Cancelacion.countDocuments(filtro);

    let foot = { dinero: 0, vale: 0, total: 0 };
    const rows = [];

    for (const c of docs) {
      if (!c?.pedido?.cliente || String(c.pedido.cliente._id) !== String(id)) continue;

      foot.dinero += toNum(c.dineroDevuelto);
      foot.vale += toNum(c.valeDevuelto);
      foot.total += toNum(c.totalDevuelto);

      rows.push({
        cancelacionId: c._id,
        fechaCancelacion: c.fechaCancelacion,
        farmacia: c.pedido?.farmacia?.nombre || '',
        usuario: c.usuario?.nombre || '',
        pedidoFolio: c.pedido?.folio || '',
        dineroDevuelto: toNum(c.dineroDevuelto),
        valeDevuelto: toNum(c.valeDevuelto),
        totalDevuelto: toNum(c.totalDevuelto)
      });
    }

    res.json({
      ok:true,
      paginacion:{ page, limit, total, totalPaginas: Math.ceil(total/limit) },
      footer:{
        dineroDevuelto:+foot.dinero.toFixed(2),
        valeDevuelto:+foot.vale.toFixed(2),
        totalDevuelto:+foot.total.toFixed(2)
      },
      rows
    });
  } catch (e) {
    console.error('[subCancelaciones][ERROR]', e);
    res.status(500).json({ ok:false, mensaje:'Error al consultar cancelaciones' });
  }
};

// ===== SUBTABLA: MONEDERO =====
exports.subMonedero = async (req, res) => {
  try {
    const { id } = req.params;
    if (!okId(id)) return res.status(400).json({ ok:false, mensaje:'clienteId inválido' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const skip = (page - 1) * limit;

    const cliente = await Cliente.findById(id, 'monedero totalMonedero').lean();
    if (!cliente) return res.status(404).json({ ok:false, mensaje:'Cliente no encontrado' });

    // ordenar por fecha desc
    const movs = (cliente.monedero || []).sort((a,b)=> new Date(b.fechaUso) - new Date(a.fechaUso));

    const pageMovs = movs.slice(skip, skip + limit);
    // lookup de farmacias (opcional)
    const farmaciasMap = {};
    // si quieres nombres, opcional:
    // const farmIds = [...new Set(pageMovs.map(m=>String(m.farmaciaUso)))];
    // const farms = await Farmacia.find({ _id: {$in:farmIds} }, 'nombre').lean();
    // farms.forEach(f => { farmaciasMap[String(f._id)] = f.nombre; });

    let totIng=0, totEgr=0;
    pageMovs.forEach(m => { totIng+=toNum(m.montoIngreso); totEgr+=toNum(m.montoEgreso); });

    res.json({
      ok:true,
      paginacion:{ page, limit, total: movs.length, totalPaginas: Math.ceil(movs.length/limit) },
      footer:{
        ingresos:+totIng.toFixed(2),
        egresos:+totEgr.toFixed(2),
        saldo:+(cliente.totalMonedero || 0).toFixed(2)
      },
      rows: pageMovs.map(m => ({
        fecha: m.fechaUso,
        ingreso: toNum(m.montoIngreso),
        egreso: toNum(m.montoEgreso),
        motivo: m.motivo || '',
        farmacia: farmaciasMap[String(m.farmaciaUso)] || '' ,
      }))
    });
  } catch (e) {
    console.error('[subMonedero][ERROR]', e);
    res.status(500).json({ ok:false, mensaje:'Error al consultar monedero' });
  }
};



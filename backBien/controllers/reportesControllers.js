// backBien/controllers/reportesControllers.js
const { DateTime } = require('luxon');
const { Types } = require('mongoose');
const { ObjectId } = require('mongodb');

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');


const toObjectId = (v) => (v && ObjectId.isValid(v) ? new ObjectId(v) : null);

const {
  pipelineVentasProductoDetalle,
  pipelineVentasPorFarmacia
} = require('../pipelines/reportesPipelines');

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

// Rango por defecto: últimos 15 días en zona local → UTC [gte, lt)
function defaultRangeLast15DaysUtc() {
  const endExLocal = DateTime.now().setZone(ZONE).plus({ days: 1 }).startOf('day'); // mañana 00:00 local
  const startLocal = endExLocal.minus({ days: 15 }).startOf('day');                  // hace 15 días
  return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

// Convierte 'YYYY-MM-DD' a UTC [gte, lt). Si falta una fecha, usa la otra.
// Si faltan ambas, usa defaultRangeLast15DaysUtc.
function dayRangeUtc(fechaIni, fechaFin) {
  if (!fechaIni && !fechaFin) return defaultRangeLast15DaysUtc();

  const iniStr = (fechaIni || fechaFin).slice(0, 10);
  const finStr = (fechaFin || fechaIni).slice(0, 10);

  let startLocal = DateTime.fromISO(iniStr, { zone: ZONE }).startOf('day');
  let endExLocal = DateTime.fromISO(finStr, { zone: ZONE }).plus({ days: 1 }).startOf('day');

  // corrige rango invertido
  if (endExLocal < startLocal) {
    const tmp = startLocal;
    startLocal = endExLocal.minus({ days: 1 });
    endExLocal = tmp.plus({ days: 1 });
  }

  return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

// Rango por defecto para "Resumen utilidades": del 1 del mes (local) a hoy (local) → UTC [gte, lt)
function defaultRangeMonthToTodayUtc() {
  const now = DateTime.now().setZone(ZONE);
  const startLocal = now.startOf('month');                 // 1 del mes actual 00:00 local
  const endExLocal = now.plus({ days: 1 }).startOf('day'); // mañana 00:00 local (límite exclusivo)
  return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

// Igual que dayRangeUtc, pero si no vienen fechas usa MTD (Month-To-Date)
function dayRangeUtcOrMTD(fechaIni, fechaFin) {
  if (!fechaIni && !fechaFin) return defaultRangeMonthToTodayUtc();
  return dayRangeUtc(fechaIni, fechaFin);
}


exports.ventasProductoDetalle = async (req, res) => {
  // conteo de ventas de un solo producto
  try {
    let { farmaciaId, productoId, codigoBarras, nombre, fechaIni, fechaFin } = req.query;

    const { gte, lt } = dayRangeUtc(fechaIni, fechaFin);

    // Resolver producto si no viene productId
    if (!productoId) {
      let prod = null;
      if (codigoBarras) {
        prod = await Producto.findOne({ codigoBarras: String(codigoBarras).trim() }, { _id: 1 });
      } else if (nombre) {
        prod = await Producto.findOne(
          { nombre: new RegExp(`^${String(nombre).trim()}$`, 'i') },
          { _id: 1 }
        );
      }
      if (!prod) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
      productoId = String(prod._id);
    }

    // Validaciones
    if (!Types.ObjectId.isValid(productoId)) {
      return res.status(400).json({ ok: false, mensaje: 'productoId inválido' });
    }
    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }

    const facet = await Venta.aggregate(
      pipelineVentasProductoDetalle({
        productoId,
        farmaciaId: farmaciaId || null,
        fechaIni: gte,    // UTC
        fechaFin: lt      // UTC (EXCLUSIVO)
      })
    );

    const items = facet?.[0]?.items || [];
    const resumen = facet?.[0]?.resumen?.[0] || {
      totalCantidad: 0,
      totalImporte: 0,
      totalCosto: 0,
      totalUtilidad: 0,
      margenPct: null
    };

    return res.json({
      ok: true,
      reporte: 'Ventas del producto por farmacia',
      productoId,
      rango: { fechaIni: gte, fechaFin: lt },
      items,
      resumen
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar reporte de ventas por producto' });
  }
};

exports.resumenProductosVendidos = async (req, res) => {
  // conteo de ventas de todos los producto
  try {
    const { farmaciaId, fechaIni, fechaFin } = req.query;

    const { gte, lt } = dayRangeUtc(fechaIni, fechaFin);

    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }

    const pipeline = pipelineVentasPorFarmacia({
      farmaciaId: farmaciaId || null,
      fechaIni: gte,   // UTC
      fechaFin: lt     // UTC (EXCLUSIVO)
    });

    const data = await Venta.aggregate(pipeline);
    return res.json({ ok: true, rango: { fechaIni: gte, fechaFin: lt }, data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener resumen de ventas' });
  }
};

exports.resumenUtilidades = async (req, res) => {
  try {
    const { fechaIni, fechaFin, farmaciaId } = req.query;
    // Validación farmaciaId (si viene)
    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }
    const farmaciaMatch = farmaciaId ? { farmacia: new Types.ObjectId(farmaciaId) } : {};

    // Rango: si no mandan fechas -> 1° del mes a hoy (local)
    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    // ---- MATCHES por colección (con campo de fecha específico) ----
    const ventasMatch = { fecha: { $gte: gte, $lt: lt }, ...farmaciaMatch };
    const pedidosMatch = { fechaPedido: { $gte: gte, $lt: lt }, ...farmaciaMatch };
    const devolucionesMatch = { fecha: { $gte: gte, $lt: lt }, ...farmaciaMatch };
    const cancelacionesMatch = { fechaCancelacion: { $gte: gte, $lt: lt }, ...farmaciaMatch };


    // Ventas: cantidad, importe=sum(total), costo=sum(productos.costo*cantidad), utilidad=importe-costo
    const ventasAgg = Venta.aggregate([
      { $match: ventasMatch },
      {
        $addFields: {
          costoVenta: {
            $sum: {
              $map: {
                input: { $ifNull: ['$productos', []] },
                as: 'p',
                in: {
                  $multiply: [
                    { $ifNull: ['$$p.costo', 0] },
                    { $ifNull: ['$$p.cantidad', 0] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          cantidad: { $sum: 1 },
          importe: { $sum: { $ifNull: ['$total', 0] } },
          costo: { $sum: { $ifNull: ['$costoVenta', 0] } },
        }
      },
      { $project: { _id: 0, cantidad: 1, importe: 1, costo: 1 } }
    ]);

    // Pedidos: cantidad, importe=sum(total - resta), costo=sum(costo)
    const pedidosAgg = Pedido.aggregate([
      { $match: pedidosMatch },
      {
        $group: {
          _id: null,
          cantidad: { $sum: 1 },
          importe: { $sum: { $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$resta', 0] }] } },
          costo: { $sum: { $ifNull: ['$costo', 0] } },
        }
      },
      { $project: { _id: 0, cantidad: 1, importe: 1, costo: 1 } }
    ]);

    // Devoluciones: cantidad, importe=-sum(totalDevuelto), costo=0
    const devolucionesAgg = Devolucion.aggregate([
      { $match: devolucionesMatch },
      {
        $group: {
          _id: null,
          cantidad: { $sum: 1 },
          totalDev: { $sum: { $ifNull: ['$totalDevuelto', 0] } }
        }
      },
      { $project: { _id: 0, cantidad: 1, importe: { $multiply: [-1, '$totalDev'] }, costo: { $literal: 0 } } }
    ]);

    // Cancelaciones: cantidad, importe=-sum(totalDevuelto), costo=0
    const cancelacionesAgg = Cancelacion.aggregate([
      { $match: cancelacionesMatch },
      {
        $group: {
          _id: null,
          cantidad: { $sum: 1 },
          totalDev: { $sum: { $ifNull: ['$totalDevuelto', 0] } }
        }
      },
      { $project: { _id: 0, cantidad: 1, importe: { $multiply: [-1, '$totalDev'] }, costo: { $literal: 0 } } }
    ]);

    // Ejecutar en paralelo
    const [vRow, pRow, dRow, cRow] = await Promise.all([
      ventasAgg, pedidosAgg, devolucionesAgg, cancelacionesAgg
    ]);

    // Normalizar resultados (si no hay docs, deja 0s)
    const ventas = vRow?.[0] || { cantidad: 0, importe: 0, costo: 0 };
    const pedidos = pRow?.[0] || { cantidad: 0, importe: 0, costo: 0 };
    const devols = dRow?.[0] || { cantidad: 0, importe: 0, costo: 0 };
    const cancels = cRow?.[0] || { cantidad: 0, importe: 0, costo: 0 };

    // Calcular utilidades
    const utilVentas = (ventas.importe || 0) - (ventas.costo || 0);
    const utilPedidos = (pedidos.importe || 0) - (pedidos.costo || 0);
    const utilDevols = (devols.importe || 0);   // costo=0 → utilidad=importe (negativo)
    const utilCancels = (cancels.importe || 0); // costo=0 → utilidad=importe (negativo)

    // Construir filas en el orden requerido, siempre presentes
    const rows = [
      { concepto: 'Ventas', cantidad: ventas.cantidad, importe: ventas.importe, costo: ventas.costo, utilidad: utilVentas },
      { concepto: 'Pedidos', cantidad: pedidos.cantidad, importe: pedidos.importe, costo: pedidos.costo, utilidad: utilPedidos },
      { concepto: 'Devoluciones', cantidad: devols.cantidad, importe: devols.importe, costo: 0, utilidad: utilDevols },
      { concepto: 'Cancelaciones', cantidad: cancels.cantidad, importe: cancels.importe, costo: 0, utilidad: utilCancels },
    ].map(r => ({
      ...r,
      // Normaliza NaN/undefined a 0
      cantidad: Number.isFinite(r.cantidad) ? r.cantidad : 0,
      importe: Number.isFinite(r.importe) ? r.importe : 0,
      costo: Number.isFinite(r.costo) ? r.costo : 0,
      utilidad: Number.isFinite(r.utilidad) ? r.utilidad : 0,
    }));

    return res.json({
      ok: true,
      reporte: 'Resumen utilidades',
      rango: { fechaIni: gte, fechaFin: lt }, // UTC
      filtros: { farmaciaId: farmaciaId || null },
      rows
    });
  } catch (e) {
    console.error('[resumenUtilidades][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Resumen utilidades' });
  }
};

// Reporte: Utilidad por usuario (Usuario, Farmacia, #Ventas, Imp. Ventas, Costo Ventas, #Pedidos, Imp. Pedidos, Costo Pedidos, Ingresos, Egresos, Utilidad, %Gan)
exports.utilidadXusuario = async (req, res) => {
  const sortDirRaw = String(req.query.orden || req.query.order || 'desc').toLowerCase();
  const sortDir = sortDirRaw === 'asc' ? 1 : -1;       // asc|desc (default desc)
  const sortBy = String(req.query.ordenPor || 'utilidad').toLowerCase(); // 'utilidad' | 'nombres'

  try {
    const { farmaciaId, usuarioId, fechaIni, fechaFin } = req.query;

    // === NUEVO: dirección de ordenamiento por utilidad ===
    const sortDirRaw = String(req.query.orden || req.query.order || 'desc').toLowerCase();
    const sortDir = sortDirRaw === 'asc' ? 1 : -1; // asc|desc (default desc)

    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }
    if (usuarioId && !Types.ObjectId.isValid(usuarioId)) {
      return res.status(400).json({ ok: false, mensaje: 'usuarioId inválido' });
    }

    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    const ventasMatch = {
      fecha: { $gte: gte, $lt: lt },
      ...(farmaciaId ? { farmacia: new Types.ObjectId(farmaciaId) } : {}),
      ...(usuarioId ? { usuario: new Types.ObjectId(usuarioId) } : {}),
    };

    const pedidosMatchBase = {
      fechaPedido: { $gte: gte, $lt: lt },
      ...(farmaciaId ? { farmacia: new Types.ObjectId(farmaciaId) } : {}),
      ...(usuarioId ? { usuarioPidio: new Types.ObjectId(usuarioId) } : {}),
    };

    const pipeline = [
      // --- Ventas ---
      { $match: ventasMatch },
      {
        $addFields: {
          costoVenta: {
            $sum: {
              $map: {
                input: { $ifNull: ['$productos', []] },
                as: 'p',
                in: {
                  $multiply: [
                    { $ifNull: ['$$p.costo', 0] },
                    { $ifNull: ['$$p.cantidad', 0] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: { usuario: '$usuario', farmacia: '$farmacia' },
          ventasCount: { $sum: 1 },
          impVentas: { $sum: { $ifNull: ['$total', 0] } },
          costoVentas: { $sum: { $ifNull: ['$costoVenta', 0] } },
          pedidosCount: { $sum: 0 },
          impPedidos: { $sum: 0 },
          costoPedidos: { $sum: 0 },
        }
      },
      {
        $project: {
          _id: 0,
          usuario: '$_id.usuario',
          farmacia: '$_id.farmacia',
          ventasCount: 1,
          impVentas: 1,
          costoVentas: 1,
          pedidosCount: 1,
          impPedidos: 1,
          costoPedidos: 1,
        }
      },

      // --- Pedidos (estado != 'cancelado') ---
      {
        $unionWith: {
          coll: 'pedidos',
          pipeline: [
            { $match: pedidosMatchBase },
            {
              $match: {
                $expr: {
                  $ne: [
                    { $toLower: { $ifNull: ['$estado', ''] } },
                    'cancelado'
                  ]
                }
              }
            },
            {
              $group: {
                _id: { usuario: '$usuarioPidio', farmacia: '$farmacia' },
                ventasCount: { $sum: 0 },
                impVentas: { $sum: 0 },
                costoVentas: { $sum: 0 },
                pedidosCount: { $sum: 1 },
                impPedidos: {
                  $sum: {
                    $subtract: [
                      { $ifNull: ['$total', 0] },
                      { $ifNull: ['$resta', 0] }
                    ]
                  }
                },
                costoPedidos: { $sum: { $ifNull: ['$costo', 0] } },
              }
            },
            {
              $project: {
                _id: 0,
                usuario: '$_id.usuario',
                farmacia: '$_id.farmacia',
                ventasCount: 1,
                impVentas: 1,
                costoVentas: 1,
                pedidosCount: 1,
                impPedidos: 1,
                costoPedidos: 1,
              }
            }
          ]
        }
      },

      // --- Totales por (usuario, farmacia) ---
      {
        $group: {
          _id: { usuario: '$usuario', farmacia: '$farmacia' },
          ventasCount: { $sum: '$ventasCount' },
          impVentas: { $sum: '$impVentas' },
          costoVentas: { $sum: '$costoVentas' },
          pedidosCount: { $sum: '$pedidosCount' },
          impPedidos: { $sum: '$impPedidos' },
          costoPedidos: { $sum: '$costoPedidos' },
        }
      },
      {
        $project: {
          _id: 0,
          usuario: '$_id.usuario',
          farmacia: '$_id.farmacia',
          ventasCount: { $ifNull: ['$ventasCount', 0] },
          impVentas: { $ifNull: ['$impVentas', 0] },
          costoVentas: { $ifNull: ['$costoVentas', 0] },
          pedidosCount: { $ifNull: ['$pedidosCount', 0] },
          impPedidos: { $ifNull: ['$impPedidos', 0] },
          costoPedidos: { $ifNull: ['$costoPedidos', 0] },
        }
      },

      // --- Nombres ---
      { $lookup: { from: 'usuarios', localField: 'usuario', foreignField: '_id', as: 'u' } },
      { $lookup: { from: 'farmacias', localField: 'farmacia', foreignField: '_id', as: 'f' } },
      {
        $addFields: {
          usuarioNombre: { $ifNull: [{ $arrayElemAt: ['$u.nombre', 0] }, '(sin nombre)'] },
          farmaciaNombre: { $ifNull: [{ $arrayElemAt: ['$f.nombre', 0] }, '(sin nombre)'] },
        }
      },
      { $project: { u: 0, f: 0 } },

      // --- Derivados ---
      {
        $addFields: {
          ingresos: { $add: [{ $ifNull: ['$impVentas', 0] }, { $ifNull: ['$impPedidos', 0] }] },
          egresos: { $add: [{ $ifNull: ['$costoVentas', 0] }, { $ifNull: ['$costoPedidos', 0] }] },
        }
      },
      {
        $addFields: {
          utilidad: { $subtract: ['$ingresos', '$egresos'] },
          gananciaPct: {
            $cond: [
              { $gt: ['$egresos', 0] },
              { $multiply: [{ $divide: ['$utilidad', '$egresos'] }, 100] },
              null
            ]
          }
        }
      },
      ...(sortBy === 'nombres'
        ? [{ $sort: { farmaciaNombre: 1, usuarioNombre: 1 } }]
        : [{ $sort: { utilidad: sortDir, farmaciaNombre: 1, usuarioNombre: 1 } }]
      ),
    ];

    const rows = await Venta.aggregate(pipeline);

    const safe = (n) => (Number.isFinite(n) ? n : 0);
    const data = rows.map(r => ({
      usuarioId: r.usuario,
      usuario: r.usuarioNombre,
      farmaciaId: r.farmacia,
      farmacia: r.farmaciaNombre,
      numVentas: safe(r.ventasCount),
      impVentas: safe(r.impVentas),
      costoVentas: safe(r.costoVentas),
      numPedidos: safe(r.pedidosCount),
      impPedidos: safe(r.impPedidos),
      costoPedidos: safe(r.costoPedidos),
      ingresos: safe(r.ingresos),
      egresos: safe(r.egresos),
      utilidad: safe(r.utilidad),
      gananciaPct: (r.gananciaPct === null ? null : safe(r.gananciaPct)),
    }));

    return res.json({
      ok: true,
      reporte: 'Utilidad por usuario',
      rango: { fechaIni: gte, fechaFin: lt },
      filtros: { farmaciaId: farmaciaId || null, usuarioId: usuarioId || null, orden: sortDirRaw },
      columns: ['Usuario', 'Farmacia', '#Ventas', 'Imp. Ventas', 'Costo Ventas', '#Pedidos', 'Imp. Pedidos', 'Costo Pedidos', 'Ingresos', 'Egresos', 'Utilidad', '%Gan'],
      rows: data
    });
  } catch (e) {
    console.error('[utilidadXusuario][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Utilidad por usuario' });
  }
};

exports.utilidadXcliente = async (req, res) => {
  try {
    const { clienteId, fechaIni, fechaFin } = req.query;

    // --- NUEVO: parámetro de orden ---
    const ordenRaw = String(req.query.orden || req.query.sort || '').trim().toLowerCase();
    const orden = ['ventas','compras','numventas','num_ventas'].includes(ordenRaw) ? 'ventas' : 'utilidad';
    const sortStage = (orden === 'ventas')
      ? { $sort: { ventasCount: -1, utilidad: -1, clienteNombre: 1 } }
      : { $sort: { utilidad: -1, ventasCount: -1, clienteNombre: 1 } };

    // Validación de clienteId (si viene)
    if (clienteId && !Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ ok: false, mensaje: 'clienteId inválido' });
    }

    // Si NO viene clienteId, CantClientes es OBLIGATORIO (Top-N)
    const cantParam = req.query.CantClientes ?? req.query.cantClientes ?? req.query.limit;
    let topN = null;
    if (!clienteId) {
      const n = parseInt(String(cantParam || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({
          ok: false,
          mensaje: 'Cuando no se envía clienteId, el parámetro CantClientes (entero > 0) es obligatorio'
        });
      }
      topN = n;
    }

    // Rango por defecto: del 1 del mes a hoy (local) → UTC [gte, lt)
    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    // MATCH por colección (sin filtro por farmacia)
    const ventasMatch = {
      fecha: { $gte: gte, $lt: lt },
      ...(clienteId ? { cliente: new Types.ObjectId(clienteId) } : {}),
    };
    const pedidosMatchBase = {
      fechaPedido: { $gte: gte, $lt: lt },
      ...(clienteId ? { cliente: new Types.ObjectId(clienteId) } : {}),
    };

    const pipeline = [
      // --- VENTAS por CLIENTE ---
      { $match: ventasMatch },
      { $match: { cliente: { $ne: null } } },
      {
        $addFields: {
          costoVenta: {
            $sum: {
              $map: {
                input: { $ifNull: ['$productos', []] },
                as: 'p',
                in: { $multiply: [ { $ifNull: ['$$p.costo', 0] }, { $ifNull: ['$$p.cantidad', 0] } ] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: { cliente: '$cliente' },
          ventasCount: { $sum: 1 },
          impVentas: { $sum: { $ifNull: ['$total', 0] } },
          costoVentas: { $sum: { $ifNull: ['$costoVenta', 0] } },
          pedidosCount: { $sum: 0 },
          impPedidos: { $sum: 0 },
          costoPedidos: { $sum: 0 },
        }
      },
      {
        $project: {
          _id: 0,
          cliente: '$_id.cliente',
          ventasCount: 1,
          impVentas: 1,
          costoVentas: 1,
          pedidosCount: 1,
          impPedidos: 1,
          costoPedidos: 1,
        }
      },

      // --- PEDIDOS por CLIENTE (estado != 'cancelado') ---
      {
        $unionWith: {
          coll: 'pedidos',
          pipeline: [
            { $match: pedidosMatchBase },
            { $match: { cliente: { $ne: null } } },
            {
              $match: {
                $expr: {
                  $ne: [
                    { $toLower: { $ifNull: ['$estado', ''] } },
                    'cancelado'
                  ]
                }
              }
            },
            {
              $group: {
                _id: { cliente: '$cliente' },
                ventasCount: { $sum: 0 },
                impVentas: { $sum: 0 },
                costoVentas: { $sum: 0 },
                pedidosCount: { $sum: 1 },
                impPedidos: {
                  $sum: {
                    $subtract: [
                      { $ifNull: ['$total', 0] },
                      { $ifNull: ['$resta', 0] }
                    ]
                  }
                },
                costoPedidos: { $sum: { $ifNull: ['$costo', 0] } },
              }
            },
            {
              $project: {
                _id: 0,
                cliente: '$_id.cliente',
                ventasCount: 1,
                impVentas: 1,
                costoVentas: 1,
                pedidosCount: 1,
                impPedidos: 1,
                costoPedidos: 1,
              }
            }
          ]
        }
      },

      // --- TOTALES por CLIENTE ---
      {
        $group: {
          _id: { cliente: '$cliente' },
          ventasCount: { $sum: '$ventasCount' },
          impVentas: { $sum: '$impVentas' },
          costoVentas: { $sum: '$costoVentas' },
          pedidosCount: { $sum: '$pedidosCount' },
          impPedidos: { $sum: '$impPedidos' },
          costoPedidos: { $sum: '$costoPedidos' },
        }
      },
      {
        $project: {
          _id: 0,
          cliente: '$_id.cliente',
          ventasCount: { $ifNull: ['$ventasCount', 0] },
          impVentas: { $ifNull: ['$impVentas', 0] },
          costoVentas: { $ifNull: ['$costoVentas', 0] },
          pedidosCount: { $ifNull: ['$pedidosCount', 0] },
          impPedidos: { $ifNull: ['$impPedidos', 0] },
          costoPedidos: { $ifNull: ['$costoPedidos', 0] },
        }
      },

      // --- LOOKUP de CLIENTE ---
      { $lookup: { from: 'clientes', localField: 'cliente', foreignField: '_id', as: 'c' } },
      {
        $addFields: {
          clienteNombre: { $ifNull: [{ $arrayElemAt: ['$c.nombre', 0] }, '(sin nombre)'] },
          clienteTelefono: { $ifNull: [{ $arrayElemAt: ['$c.telefono', 0] }, '' ] },
          clienteTotalMonedero: { $ifNull: [{ $arrayElemAt: ['$c.totalMonedero', 0] }, 0] },
        }
      },
      { $project: { c: 0 } },

      // --- Derivados ---
      {
        $addFields: {
          ingresos: { $add: [{ $ifNull: ['$impVentas', 0] }, { $ifNull: ['$impPedidos', 0] }] },
          egresos:  { $add: [{ $ifNull: ['$costoVentas', 0] }, { $ifNull: ['$costoPedidos', 0] }] },
        }
      },
      {
        $addFields: {
          utilidad: { $subtract: ['$ingresos', '$egresos'] },
          gananciaPct: {
            $cond: [
              { $gt: ['$egresos', 0] },
              { $multiply: [{ $divide: ['$utilidad', '$egresos'] }, 100] },
              null
            ]
          }
        }
      },

      // --- ORDEN DINÁMICO (NUEVO) ---
      sortStage,

      // Top-N si no se pidió cliente específico
      ...(clienteId ? [] : [{ $limit: topN }]),
    ];

    const rowsAgg = await Venta.aggregate(pipeline);

    const safe = (n) => (Number.isFinite(n) ? n : 0);
    const rows = rowsAgg.map(r => ({
      clienteId: r.cliente,
      cliente: r.clienteNombre,
      telefono: r.clienteTelefono || '',
      totalMonedero: safe(r.clienteTotalMonedero),
      numVentas: safe(r.ventasCount),
      impVentas: safe(r.impVentas),
      costoVentas: safe(r.costoVentas),
      numPedidos: safe(r.pedidosCount),
      impPedidos: safe(r.impPedidos),
      costoPedidos: safe(r.costoPedidos),
      ingresos: safe(r.ingresos),
      egresos: safe(r.egresos),
      utilidad: safe(r.utilidad),
      gananciaPct: (r.gananciaPct === null ? null : safe(r.gananciaPct)),
    }));

    return res.json({
      ok: true,
      reporte: 'Utilidad por cliente',
      rango: { fechaIni: gte, fechaFin: lt },  // UTC
      filtros: {
        clienteId: clienteId || null,
        CantClientes: topN,
        orden // ← 'utilidad' | 'ventas'
      },
      columns: [
        'Cliente', '#Ventas', 'Imp. Ventas', 'Costo Ventas',
        '#Pedidos', 'Imp. Pedidos', 'Costo Pedidos',
        'Ingresos', 'Egresos', 'Utilidad', '%Gan','Monedero'
      ],
      rows
    });
  } catch (e) {
    console.error('[utilidadXcliente][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Utilidad por cliente' });
  }
};

exports.utilidadXproducto = async (req, res) => {
  try {
    const { fechaIni, fechaFin, productoId, farmaciaId } = req.query;

    // ----- Validaciones básicas -----
    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }
    if (productoId && !Types.ObjectId.isValid(productoId)) {
      return res.status(400).json({ ok: false, mensaje: 'productoId inválido' });
    }

    // Top-N obligatorio si NO hay productoId
    const cantParam = req.query.cantProductos ?? req.query.CantProductos ?? req.query.limit;
    let topN = null;
    if (!productoId) {
      const n = parseInt(String(cantParam || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({
          ok: false,
          mensaje: 'Cuando no se envía productoId, el parámetro cantProductos (entero > 0) es obligatorio'
        });
      }
      topN = n;
    }

    // Orden (default utilidad desc; alternativo "ventas")
    const ordenRaw = String(req.query.orden || req.query.sort || '').trim().toLowerCase();
    const ordenarPorVentas = ['ventas','numventas','cantidad','compras'].includes(ordenRaw);
    const sortStage = ordenarPorVentas
      ? { $sort: { cantidad: -1, utilidad: -1, productoNombre: 1 } }
      : { $sort: { utilidad: -1, cantidad: -1, productoNombre: 1 } };

    // Rango fechas: 1° del mes → hoy si no mandan fechas
    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    // Match base en ventas
    const matchVenta = {
      fecha: { $gte: gte, $lt: lt },
      ...(farmaciaId ? { farmacia: new Types.ObjectId(farmaciaId) } : {})
    };

    // Pipeline
    const pipeline = [
      { $match: matchVenta },
      { $project: { productos: 1 } },
      { $unwind: { path: '$productos', preserveNullAndEmptyArrays: false } },
      // si se envía productoId, filtra el renglón del subdocumento
      ...(productoId ? [{ $match: { 'productos.producto': new Types.ObjectId(productoId) } }] : []),
      {
        $group: {
          _id: '$productos.producto',
          // #Ventas = suma de cantidades
          cantidad: { $sum: { $ifNull: ['$productos.cantidad', 0] } },
          // Importe = suma totalRen
          importe:  { $sum: { $ifNull: ['$productos.totalRen', 0] } },
          // Costo total = suma (costo * cantidad)
          costo:    { $sum: { $multiply: [
            { $ifNull: ['$productos.costo', 0] },
            { $ifNull: ['$productos.cantidad', 0] }
          ] } },
        }
      },
      { $project: {
          _id: 1, cantidad: 1, importe: 1, costo: 1,
          utilidad: { $subtract: [
            { $ifNull: ['$importe', 0] },
            { $ifNull: ['$costo', 0] }
          ] }
        }
      },
      // Lookup de datos del producto (nombre y código de barras)
      {
        $lookup: {
          from: 'productos',
          localField: '_id',
          foreignField: '_id',
          as: 'prod'
        }
      },
      {
        $addFields: {
          productoNombre:  { $ifNull: [{ $arrayElemAt: ['$prod.nombre', 0] }, '(sin nombre)'] },
          codigoBarras:    { $ifNull: [{ $arrayElemAt: ['$prod.codigoBarras', 0] }, '' ] },
        }
      },
      { $project: { prod: 0 } },
      // %Gan = utilidad / costo * 100 (si costo == 0 -> null)
      {
        $addFields: {
          gananciaPct: {
            $cond: [
              { $gt: ['$costo', 0] },
              { $multiply: [{ $divide: ['$utilidad', '$costo'] }, 100] },
              null
            ]
          }
        }
      },
      // Orden dinámico
      sortStage,
      // Top-N si no pidieron producto específico
      ...(productoId ? [] : [{ $limit: topN }])
    ];

    const rowsAgg = await Venta.aggregate(pipeline);

    const safe = (n) => (Number.isFinite(+n) ? +n : 0);
    const rows = rowsAgg.map(r => ({
      productoId: r._id,
      producto: r.productoNombre,
      codigoBarras: r.codigoBarras || '',
      numVentas: safe(r.cantidad),
      importe: safe(r.importe),
      costo: safe(r.costo),
      utilidad: safe(r.utilidad),
      gananciaPct: (r.gananciaPct === null ? null : safe(r.gananciaPct)),
    }));

    return res.json({
      ok: true,
      reporte: 'Utilidad por producto',
      rango: { fechaIni: gte, fechaFin: lt },  // UTC
      filtros: {
        productoId: productoId || null,
        cantProductos: topN,
        farmaciaId: farmaciaId || null,
        orden: ordenarPorVentas ? 'ventas' : 'utilidad'
      },
      columns: ['Producto', 'Código de Barras', '#Ventas', 'Importe', 'Costo', 'Utilidad', '%Gan'],
      rows
    });
  } catch (e) {
    console.error('[utilidadXproducto][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Utilidad por producto' });
  }
};

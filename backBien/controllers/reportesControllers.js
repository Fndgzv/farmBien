// backBien/controllers/reportesControllers.js
const { Types } = require('mongoose');
const mongoose = require('mongoose');

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');
const Compra = require('../models/Compra');

const { parseSortTop } = require('../utils/sort');

const oid = (s) => (s && mongoose.isValidObjectId(s)) ? new Types.ObjectId(s) : undefined;

const {
  dayRangeUtc,
  dayRangeUtcOrMTD,
  dayRangeUtcFromQuery,
} = require('../utils/fechas');

// Devoluciones: claves válidas = importe | piezas | devoluciones | avgDias
const parseSortDevols = (orden = 'importe', dir = 'desc') =>
  parseSortTop(orden, dir, {
    allowed: ['importe', 'piezas', 'devoluciones', 'avgDias'],
    aliases: { avgdias: 'avgDias' },   // permitimos "avgdias"
    fallback: 'importe'
  });

// Cancelaciones: claves válidas = importe | cancelaciones | avgDias
// (acepta alias comunes como "piezas", "devoluciones", "#")
const parseSortCanc = (orden = 'importe', dir = 'desc') =>
  parseSortTop(orden, dir, {
    allowed: ['importe', 'cancelaciones', 'avgDias'],
    aliases: {
      piezas: 'cancelaciones',
      devoluciones: 'cancelaciones',
      '#': 'cancelaciones',
      avgdias: 'avgDias'
    },
    fallback: 'importe'
  });


const {
  pipelineVentasProductoDetalle,
  pipelineVentasPorFarmacia
} = require('../pipelines/reportesPipelines');


function castIdSafe(id) {
  return (id && mongoose.isValidObjectId(id)) ? new Types.ObjectId(id) : null;
}

function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper de comparación numérica con dirección
function cmpNum(a, b, dir /* 1 asc, -1 desc */) {
  const an = Number.isFinite(+a) ? +a : 0;
  const bn = Number.isFinite(+b) ? +b : 0;
  if (an === bn) return 0;
  return (an < bn ? -1 : 1) * (dir === 1 ? 1 : -1);
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

exports.utilidadXusuario = async (req, res) => {
  try {
    const { farmaciaId, usuarioId, fechaIni, fechaFin } = req.query;

    // Ordenamiento: utilidad (default) o ventas
    const ordenRaw = String(req.query.orden || req.query.sort || '').trim().toLowerCase();
    const sortByVentas = ['ventas', 'numventas', 'num_ventas', '#ventas'].includes(ordenRaw);
    const dirRaw = String(req.query.dir || req.query.order || 'desc').toLowerCase();
    const dir = (dirRaw === 'asc') ? 1 : -1;

    // Fechas (1º del mes → hoy si no mandan)
    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    // Filtros de match con casteo seguro
    const farmaciaOid = castIdSafe(farmaciaId);
    const usuarioOid = castIdSafe(usuarioId);

    const ventasMatch = {
      fecha: { $gte: gte, $lt: lt },
      ...(farmaciaOid ? { farmacia: farmaciaOid } : {}),
      ...(usuarioOid ? { usuario: usuarioOid } : {}),
    };

    const pedidosMatchBase = {
      fechaPedido: { $gte: gte, $lt: lt },
      ...(farmaciaOid ? { farmacia: farmaciaOid } : {}),
      ...(usuarioOid ? { usuarioPidio: usuarioOid } : {}),
    };

    // ---- Pipeline
    const pipeline = [
      // VENTAS
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
          ventasCount: 1, impVentas: 1, costoVentas: 1,
          pedidosCount: 1, impPedidos: 1, costoPedidos: 1,
        }
      },

      // PEDIDOS (no cancelados)
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
                ventasCount: 1, impVentas: 1, costoVentas: 1,
                pedidosCount: 1, impPedidos: 1, costoPedidos: 1,
              }
            }
          ]
        }
      },

      // TOTALES por (usuario, farmacia)
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

      // LOOKUP nombres
      { $lookup: { from: 'usuarios', localField: 'usuario', foreignField: '_id', as: 'u' } },
      { $lookup: { from: 'farmacias', localField: 'farmacia', foreignField: '_id', as: 'f' } },
      {
        $addFields: {
          usuarioNombre: { $ifNull: [{ $arrayElemAt: ['$u.nombre', 0] }, '(sin nombre)'] },
          farmaciaNombre: { $ifNull: [{ $arrayElemAt: ['$f.nombre', 0] }, '(sin nombre)'] },
        }
      },
      { $project: { u: 0, f: 0 } },
    ];

    // Ordenamiento (aplicado tras map JS para usar utilidad calculada)
    const rowsAgg = await Venta.aggregate(pipeline);

    // ---- Proyección JS + %Gan en JS + footer
    const safe = (n) => (Number.isFinite(+n) ? +n : 0);
    const rows = rowsAgg.map(r => {
      const ingresos = safe(r.impVentas) + safe(r.impPedidos);
      const egresos = safe(r.costoVentas) + safe(r.costoPedidos);
      const utilidad = ingresos - egresos;
      const gananciaPct = egresos > 0 ? (utilidad / egresos) * 100 : null;
      return {
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
        ingresos, egresos, utilidad, gananciaPct
      };
    });

    rows.sort((a, b) => {
      if (sortByVentas) {
        const byVentas = cmpNum(a.numVentas, b.numVentas, dir);
        if (byVentas !== 0) return byVentas;
        const byUtil = cmpNum(a.utilidad, b.utilidad, dir);
        if (byUtil !== 0) return byUtil;
        return a.usuario.localeCompare(b.usuario, 'es');
      } else {
        const byUtil = cmpNum(a.utilidad, b.utilidad, dir);
        if (byUtil !== 0) return byUtil;
        const byVentas = cmpNum(a.numVentas, b.numVentas, dir);
        if (byVentas !== 0) return byVentas;
        return a.usuario.localeCompare(b.usuario, 'es');
      }
    });
    ;

    // Footer
    const footer = rows.reduce((acc, r) => {
      acc.totalVentas += r.numVentas;
      acc.totalImpVentas += r.impVentas;
      acc.totalCostoVentas += r.costoVentas;
      acc.totalPedidos += r.numPedidos;
      acc.totalImpPedidos += r.impPedidos;
      acc.totalCostoPedidos += r.costoPedidos;
      acc.totalIngresos += r.ingresos;
      acc.totalEgresos += r.egresos;
      acc.totalUtilidad += r.utilidad;
      return acc;
    }, {
      totalVentas: 0, totalImpVentas: 0, totalCostoVentas: 0,
      totalPedidos: 0, totalImpPedidos: 0, totalCostoPedidos: 0,
      totalIngresos: 0, totalEgresos: 0, totalUtilidad: 0,
      gananciaPct: null
    });
    footer.gananciaPct = footer.totalEgresos > 0
      ? (footer.totalUtilidad / footer.totalEgresos) * 100
      : null;

    return res.json({
      ok: true,
      reporte: 'Utilidad por usuario',
      rango: { fechaIni: gte, fechaFin: lt },
      filtros: {
        farmaciaId: farmaciaOid ? farmaciaId : null,
        usuarioId: usuarioOid ? usuarioId : null,
        orden: sortByVentas ? 'ventas' : 'utilidad',
        dir: dir === 1 ? 'asc' : 'desc'
      },
      columns: ['Usuario', 'Farmacia', '#Ventas', 'Imp. Ventas', 'Costo Ventas', '#Pedidos', 'Imp. Pedidos', 'Costo Pedidos', 'Ingresos', 'Egresos', 'Utilidad', '%Gan'],
      rows,
      footer
    });
  } catch (e) {
    console.error('[utilidadXusuario][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Utilidad por usuario' });
  }
};

exports.utilidadXcliente = async (req, res) => {
  try {
    const { clienteId, fechaIni, fechaFin } = req.query;

    // Ordenamiento: utilidad (default) o ventas
    const ordenRaw = String(req.query.orden || req.query.sort || '').trim().toLowerCase();
    const sortByVentas = ['ventas', 'numventas', 'num_ventas', '#ventas'].includes(ordenRaw);
    const dirRaw = String(req.query.dir || req.query.order || 'desc').toLowerCase();
    const dir = (dirRaw === 'asc') ? 1 : -1;

    // Si no viene clienteId => CantClientes es obligatorio
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

    // Fechas
    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    const clienteOid = castIdSafe(clienteId);

    const ventasMatch = {
      fecha: { $gte: gte, $lt: lt },
      ...(clienteOid ? { cliente: clienteOid } : {}),
    };
    const pedidosMatchBase = {
      fechaPedido: { $gte: gte, $lt: lt },
      ...(clienteOid ? { cliente: clienteOid } : {}),
    };

    const pipeline = [
      // VENTAS
      { $match: ventasMatch },
      { $match: { cliente: { $ne: null } } },
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
          ventasCount: 1, impVentas: 1, costoVentas: 1,
          pedidosCount: 1, impPedidos: 1, costoPedidos: 1,
        }
      },

      // PEDIDOS (no cancelados)
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
                ventasCount: 1, impVentas: 1, costoVentas: 1,
                pedidosCount: 1, impPedidos: 1, costoPedidos: 1,
              }
            }
          ]
        }
      },

      // TOTALES por CLIENTE
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

      // LOOKUP cliente
      { $lookup: { from: 'clientes', localField: 'cliente', foreignField: '_id', as: 'c' } },
      {
        $addFields: {
          clienteNombre: { $ifNull: [{ $arrayElemAt: ['$c.nombre', 0] }, '(sin nombre)'] },
          clienteTelefono: { $ifNull: [{ $arrayElemAt: ['$c.telefono', 0] }, ''] },
          clienteMonedero: { $ifNull: [{ $arrayElemAt: ['$c.totalMonedero', 0] }, 0] },
        }
      },
      { $project: { c: 0 } },
    ];

    const rowsAgg = await Venta.aggregate(pipeline);

    // Map JS + %Gan JS + footer
    const safe = (n) => (Number.isFinite(+n) ? +n : 0);
    let rows = rowsAgg.map(r => {
      const ingresos = safe(r.impVentas) + safe(r.impPedidos);
      const egresos = safe(r.costoVentas) + safe(r.costoPedidos);
      const utilidad = ingresos - egresos;
      const gananciaPct = egresos > 0 ? (utilidad / egresos) * 100 : null;
      return {
        clienteId: r.cliente,
        cliente: r.clienteNombre,
        telefono: r.clienteTelefono,
        totalMonedero: safe(r.clienteMonedero),
        numVentas: safe(r.ventasCount),
        impVentas: safe(r.impVentas),
        costoVentas: safe(r.costoVentas),
        numPedidos: safe(r.pedidosCount),
        impPedidos: safe(r.impPedidos),
        costoPedidos: safe(r.costoPedidos),
        ingresos, egresos, utilidad, gananciaPct
      };
    });

    rows.sort((a, b) => {
      if (sortByVentas) {
        const byVentas = cmpNum(a.numVentas, b.numVentas, dir);
        if (byVentas !== 0) return byVentas;
        const byUtil = cmpNum(a.utilidad, b.utilidad, dir);
        if (byUtil !== 0) return byUtil;
        return a.cliente.localeCompare(b.cliente, 'es');
      } else {
        const byUtil = cmpNum(a.utilidad, b.utilidad, dir);
        if (byUtil !== 0) return byUtil;
        const byVentas = cmpNum(a.numVentas, b.numVentas, dir);
        if (byVentas !== 0) return byVentas;
        return a.cliente.localeCompare(b.cliente, 'es');
      }
    });

    // Top-N si no se pidió cliente específico
    if (!clienteOid && topN) rows = rows.slice(0, topN);

    // Footer
    const footer = rows.reduce((acc, r) => {
      acc.totalVentas += r.numVentas;
      acc.totalImpVentas += r.impVentas;
      acc.totalCostoVentas += r.costoVentas;
      acc.totalPedidos += r.numPedidos;
      acc.totalImpPedidos += r.impPedidos;
      acc.totalCostoPedidos += r.costoPedidos;
      acc.totalIngresos += r.ingresos;
      acc.totalEgresos += r.egresos;
      acc.totalUtilidad += r.utilidad;
      acc.totalMonedero += r.totalMonedero;
      return acc;
    }, {
      totalVentas: 0, totalImpVentas: 0, totalCostoVentas: 0,
      totalPedidos: 0, totalImpPedidos: 0, totalCostoPedidos: 0,
      totalIngresos: 0, totalEgresos: 0, totalUtilidad: 0,
      totalMonedero: 0, gananciaPct: null
    });
    footer.gananciaPct = footer.totalEgresos > 0
      ? (footer.totalUtilidad / footer.totalEgresos) * 100
      : null;

    return res.json({
      ok: true,
      reporte: 'Utilidad por cliente',
      rango: { fechaIni: gte, fechaFin: lt },
      filtros: {
        clienteId: clienteOid ? clienteId : null,
        CantClientes: clienteOid ? null : topN,
        orden: sortByVentas ? 'ventas' : 'utilidad',
        dir: dir === 1 ? 'asc' : 'desc'
      },
      columns: [
        'Cliente', '#Ventas', 'Imp. Ventas', 'Costo Ventas',
        '#Pedidos', 'Imp. Pedidos', 'Costo Pedidos',
        'Ingresos', 'Egresos', 'Utilidad', '%Gan', 'Monedero'
      ],
      rows,
      footer
    });
  } catch (e) {
    console.error('[utilidadXcliente][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Utilidad por cliente' });
  }
};

exports.utilidadXproducto = async (req, res) => {
  try {
    const { fechaIni, fechaFin, productoId, farmaciaId } = req.query;

    // Validaciones mínimas
    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }
    if (productoId && !Types.ObjectId.isValid(productoId)) {
      return res.status(400).json({ ok: false, mensaje: 'productoId inválido' });
    }

    // Top-N si no hay productoId
    const cantParam = req.query.cantProductos ?? req.query.CantProductos ?? req.query.limit;
    let topN = null;
    if (!productoId) {
      const n = parseInt(String(cantParam || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({
          ok: false,
          mensaje: 'Cuando no se envía productoId, el parámetro cantProductos (> 0) es obligatorio'
        });
      }
      topN = n;
    }

    const ordenRaw = String(req.query.orden || req.query.sort || '').trim().toLowerCase();
    const ordenarPorVentas = ['ventas', 'numventas', 'cantidad', 'compras'].includes(ordenRaw);

    const dirRaw = String(req.query.dir || req.query.order || 'desc').toLowerCase();
    const dir = (dirRaw === 'asc') ? 1 : -1;

    // El sort ahora usa "dir" (1 asc, -1 desc) en la/s clave/s numéricas
    const sortStage = ordenarPorVentas
      ? { $sort: { cantidad: dir, utilidad: dir, productoNombre: 1 } }
      : { $sort: { utilidad: dir, cantidad: dir, productoNombre: 1 } };

    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    const matchVenta = {
      fecha: { $gte: gte, $lt: lt },
      ...(farmaciaId ? { farmacia: new Types.ObjectId(farmaciaId) } : {})
    };

    const prodMatch = productoId
      ? { 'productos.producto': new Types.ObjectId(productoId) }
      : null;

    const pipeline = [
      { $match: matchVenta },
      { $unwind: { path: '$productos', preserveNullAndEmptyArrays: false } },
      ...(prodMatch ? [{ $match: prodMatch }] : []),
      {
        $group: {
          _id: '$productos.producto',
          cantidad: { $sum: { $ifNull: ['$productos.cantidad', 0] } },
          importe: { $sum: { $ifNull: ['$productos.totalRen', 0] } },
          costo: {
            $sum: {
              $multiply: [
                { $ifNull: ['$productos.costo', 0] },
                { $ifNull: ['$productos.cantidad', 0] }
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 1, cantidad: 1, importe: 1, costo: 1,
          utilidad: { $subtract: [{ $ifNull: ['$importe', 0] }, { $ifNull: ['$costo', 0] }] }
        }
      },
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
          productoNombre: { $ifNull: [{ $arrayElemAt: ['$prod.nombre', 0] }, '(sin nombre)'] },
          codigoBarras: { $ifNull: [{ $arrayElemAt: ['$prod.codigoBarras', 0] }, ''] },
          gananciaPct: {
            $cond: [
              { $gt: ['$costo', 0] },
              { $multiply: [{ $divide: ['$utilidad', '$costo'] }, 100] },
              null
            ]
          }
        }
      },
      { $project: { prod: 0 } },
      sortStage,
      ...(productoId ? [] : [{ $limit: topN }])  // Nota: con dir=asc, limita a los "más bajos"
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

    // Footer totales
    const footer = rows.reduce((acc, r) => {
      acc.numVentas += r.numVentas;
      acc.importe += r.importe;
      acc.costo += r.costo;
      acc.utilidad += r.utilidad;
      return acc;
    }, { numVentas: 0, importe: 0, costo: 0, utilidad: 0 });
    footer.gananciaPct = footer.costo > 0 ? (footer.utilidad / footer.costo) * 100 : null;

    return res.json({
      ok: true,
      reporte: 'Utilidad por producto',
      rango: { fechaIni: gte, fechaFin: lt },
      filtros: {
        productoId: productoId || null,
        cantProductos: topN,
        farmaciaId: farmaciaId || null,
        orden: ordenarPorVentas ? 'ventas' : 'utilidad'
      },
      columns: ['Producto', 'Código de Barras', '#Ventas', 'Importe', 'Costo', 'Utilidad', '%Gan'],
      rows,
      footer
    });
  } catch (e) {
    console.error('[utilidadXproducto][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar Utilidad por producto' });
  }
};

exports.devolucionesResumen = async (req, res) => {
  try {
    const {
      fechaIni, fechaFin,
      farmaciaId, clienteId, usuarioId, productoId, motivo,
      orden = 'importe',
      dir = 'desc',
      topN = 10,
    } = req.query;

    const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);

    const matchDoc = { fecha: { $gte: gte, $lt: lt } };
    if (farmaciaId) matchDoc.farmacia = oid(farmaciaId);
    if (clienteId) matchDoc.cliente = oid(clienteId);
    if (usuarioId) matchDoc.usuario = oid(usuarioId);

    const matchItem = {};
    if (productoId) matchItem['productosDevueltos.producto'] = oid(productoId);
    if (motivo) matchItem['productosDevueltos.motivo'] = String(motivo);

    const sortTop = parseSortDevols(orden, dir);
    const top = Math.max(1, Math.min(100, parseInt(topN, 10) || 10));

    const pipelineBase = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
          producto: '$productosDevueltos.producto',
          motivo: '$productosDevueltos.motivo'
        }
      },
      {
        $lookup: {
          from: 'ventas',
          localField: 'venta',
          foreignField: '_id',
          as: 'ventaDoc',
          pipeline: [{ $project: { _id: 1, fecha: 1 } }]
        }
      },
      { $unwind: { path: '$ventaDoc', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          diasAlDevolver: {
            $cond: [
              { $and: ['$ventaDoc.fecha', '$fecha'] },
              { $divide: [{ $subtract: ['$fecha', '$ventaDoc.fecha'] }, 1000 * 60 * 60 * 24] },
              null
            ]
          }
        }
      },
    ].filter(Boolean);

    const facet = {
      kpis: [
        {
          $group: {
            _id: null,
            totalImporte: { $sum: '$importe' },
            totalPiezas: { $sum: '$cantidad' },
            numDevoluciones: { $sum: 1 },
            avgDias: { $avg: '$diasAlDevolver' }
          }
        },
        { $project: { _id: 0, totalImporte: 1, totalPiezas: 1, numDevoluciones: 1, avgDias: { $round: ['$avgDias', 2] } } }
      ],
      topProductos: [
        { $group: { _id: '$producto', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
        { $sort: sortTop }, { $limit: top },
        { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { nombre: 1, codigoBarras: 1, unidad: 1 } }] } },
        { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, productoId: '$_id', nombre: '$p.nombre', codigoBarras: '$p.codigoBarras', unidad: '$p.unidad', piezas: 1, importe: 1, devoluciones: 1 } }
      ],
      topMotivos: [
        { $group: { _id: '$motivo', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
        { $sort: sortTop }, { $limit: top },
        { $project: { _id: 0, motivo: '$_id', piezas: 1, importe: 1, devoluciones: 1 } }
      ],
      topClientes: [
        { $group: { _id: '$cliente', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
        { $sort: sortTop }, { $limit: top },
        { $lookup: { from: 'clientes', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
        { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, clienteId: '$_id', nombre: '$c.nombre', telefono: '$c.telefono', piezas: 1, importe: 1, devoluciones: 1 } }
      ],
      topUsuarios: [
        { $group: { _id: '$usuario', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
        { $sort: sortTop }, { $limit: top },
        { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
        { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, usuarioId: '$_id', nombre: '$u.nombre', piezas: 1, importe: 1, devoluciones: 1 } }
      ],
      topFarmacias: [
        { $group: { _id: '$farmacia', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
        { $sort: sortTop }, { $limit: top },
        { $lookup: { from: 'farmacias', localField: '_id', foreignField: '_id', as: 'f', pipeline: [{ $project: { nombre: 1 } }] } },
        { $unwind: { path: '$f', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, farmaciaId: '$_id', nombre: '$f.nombre', piezas: 1, importe: 1, devoluciones: 1 } }
      ],
    };

    const data = await Devolucion.aggregate([...pipelineBase, { $facet: facet }]);
    return res.json(data?.[0] || {});
  } catch (err) {
    console.error('[devoluciones-resumen][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo generar el resumen de devoluciones.' });
  }
};

exports.devolucionesPorProducto = async (req, res) => {
  try {
    const { orden = 'importe', dir = 'desc', topN } = req.query;
    const { matchDoc, matchItem } = buildMatches(req.query);
    const sortTop = parseSortDevols(orden, dir);
    const top = topN ? Math.max(1, Math.min(100, parseInt(topN, 10))) : null;

    const pipeline = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
          producto: '$productosDevueltos.producto'
        }
      },
      { $group: { _id: '$producto', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
      { $sort: sortTop },
      top ? { $limit: top } : null,
      { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { nombre: 1, codigoBarras: 1 } }] } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, productoId: '$_id', nombre: '$p.nombre', codigoBarras: '$p.codigoBarras', piezas: 1, importe: 1, devoluciones: 1 } }
    ].filter(Boolean);

    const rows = await Devolucion.aggregate(pipeline);
    return res.json({ rows });
  } catch (err) {
    console.error('[devoluciones-producto][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar devoluciones por producto.' });
  }
};

// Para el listado (campos válidos de orden)
const parseSortListado = (orden = 'fecha', dir = 'desc') => {
  const campo = ['fecha', 'importe', 'cantidad'].includes(orden) ? orden : 'fecha';
  const sentido = (dir === 'asc') ? 1 : -1;
  return { [campo]: sentido, _id: 1 };
};

// Construye los $match comunes (documento e item)
function buildMatches(q) {
  const { fechaIni, fechaFin, farmaciaId, clienteId, usuarioId, productoId, motivo } = q;
  const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);

  const matchDoc = { fecha: { $gte: gte, $lt: lt } };
  if (farmaciaId) matchDoc.farmacia = oid(farmaciaId);
  if (clienteId) matchDoc.cliente = oid(clienteId);
  if (usuarioId) matchDoc.usuario = oid(usuarioId);

  const matchItem = {};
  if (productoId) matchItem['productosDevueltos.producto'] = oid(productoId);
  if (motivo) matchItem['productosDevueltos.motivo'] = String(motivo);

  return { matchDoc, matchItem };
}


exports.devolucionesPorMotivo = async (req, res) => {
  try {
    const { orden = 'importe', dir = 'desc', topN } = req.query;
    const { matchDoc, matchItem } = buildMatches(req.query);
    const sortTop = parseSortDevols(orden, dir);
    const top = topN ? Math.max(1, Math.min(100, parseInt(topN, 10))) : null;

    const pipeline = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
          motivo: '$productosDevueltos.motivo'
        }
      },
      { $group: { _id: '$motivo', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
      { $sort: sortTop },
      top ? { $limit: top } : null,
      { $project: { _id: 0, motivo: '$_id', piezas: 1, importe: 1, devoluciones: 1 } }
    ].filter(Boolean);

    const rows = await Devolucion.aggregate(pipeline);
    return res.json({ rows });
  } catch (err) {
    console.error('[devoluciones-motivo][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar devoluciones por motivo.' });
  }
};


exports.devolucionesPorCliente = async (req, res) => {
  try {
    const { orden = 'importe', dir = 'desc', topN } = req.query;
    const { matchDoc, matchItem } = buildMatches(req.query);
    const sortTop = parseSortDevols(orden, dir);
    const top = topN ? Math.max(1, Math.min(100, parseInt(topN, 10))) : null;

    const pipeline = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
        }
      },
      { $group: { _id: '$cliente', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
      { $sort: sortTop },
      top ? { $limit: top } : null,
      { $lookup: { from: 'clientes', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
      { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, clienteId: '$_id', nombre: '$c.nombre', telefono: '$c.telefono', piezas: 1, importe: 1, devoluciones: 1 } }
    ].filter(Boolean);

    const rows = await Devolucion.aggregate(pipeline);
    return res.json({ rows });
  } catch (err) {
    console.error('[devoluciones-cliente][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar devoluciones por cliente.' });
  }
};


exports.devolucionesPorUsuario = async (req, res) => {
  try {
    const { orden = 'importe', dir = 'desc', topN } = req.query;
    const { matchDoc, matchItem } = buildMatches(req.query);
    const sortTop = parseSortDevols(orden, dir);
    const top = topN ? Math.max(1, Math.min(100, parseInt(topN, 10))) : null;

    const pipeline = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
        }
      },
      { $group: { _id: '$usuario', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
      { $sort: sortTop },
      top ? { $limit: top } : null,
      { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
      { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, usuarioId: '$_id', nombre: '$u.nombre', piezas: 1, importe: 1, devoluciones: 1 } }
    ].filter(Boolean);

    const rows = await Devolucion.aggregate(pipeline);
    return res.json({ rows });
  } catch (err) {
    console.error('[devoluciones-usuario][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar devoluciones por usuario.' });
  }
};


exports.devolucionesPorFarmacia = async (req, res) => {
  try {
    const { orden = 'importe', dir = 'desc', topN } = req.query;
    const { matchDoc, matchItem } = buildMatches(req.query);
    const sortTop = parseSortDevols(orden, dir);
    const top = topN ? Math.max(1, Math.min(100, parseInt(topN, 10))) : null;

    const pipeline = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
        }
      },
      { $group: { _id: '$farmacia', piezas: { $sum: '$cantidad' }, importe: { $sum: '$importe' }, devoluciones: { $sum: 1 } } },
      { $sort: sortTop },
      top ? { $limit: top } : null,
      { $lookup: { from: 'farmacias', localField: '_id', foreignField: '_id', as: 'f', pipeline: [{ $project: { nombre: 1 } }] } },
      { $unwind: { path: '$f', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, farmaciaId: '$_id', nombre: '$f.nombre', piezas: 1, importe: 1, devoluciones: 1 } }
    ].filter(Boolean);

    const rows = await Devolucion.aggregate(pipeline);
    return res.json({ rows });
  } catch (err) {
    console.error('[devoluciones-farmacia][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar devoluciones por farmacia.' });
  }
};

exports.devolucionesListado = async (req, res) => {
  try {
    const { orden = 'fecha', dir = 'desc', page = 1, limit = 20 } = req.query;
    const { matchDoc, matchItem } = buildMatches(req.query);
    const sort = parseSortListado(orden, dir);
    const pg = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10)));
    const skip = (pg - 1) * lim;

    const pipelineBase = [
      { $match: matchDoc },
      { $unwind: '$productosDevueltos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          cantidad: '$productosDevueltos.cantidad',
          importe: '$productosDevueltos.precioXCantidad',
          producto: '$productosDevueltos.producto',
          motivo: '$productosDevueltos.motivo',
          precioUnit: {
            $cond: [
              { $gt: ['$productosDevueltos.cantidad', 0] },
              { $divide: ['$productosDevueltos.precioXCantidad', '$productosDevueltos.cantidad'] },
              null
            ]
          }
        }
      },
      { $lookup: { from: 'productos', localField: 'producto', foreignField: '_id', as: 'p', pipeline: [{ $project: { nombre: 1, codigoBarras: 1, unidad: 1 } }] } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'clientes', localField: 'cliente', foreignField: '_id', as: 'c', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
      { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'usuarios', localField: 'usuario', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
      { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'farmacias', localField: 'farmacia', foreignField: '_id', as: 'f', pipeline: [{ $project: { nombre: 1 } }] } },
      { $unwind: { path: '$f', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          devolucionId: '$_id',
          fecha: 1,
          farmaciaId: '$farmacia', farmacia: '$f.nombre',
          clienteId: '$cliente', cliente: '$c.nombre', clienteTel: '$c.telefono',
          usuarioId: '$usuario', usuario: '$u.nombre',
          productoId: '$producto', producto: '$p.nombre', codigoBarras: '$p.codigoBarras', unidad: '$p.unidad',
          cantidad: 1,
          precioUnit: { $round: ['$precioUnit', 2] },
          importe: { $round: ['$importe', 2] },
          motivo: '$motivo'
        }
      }
    ].filter(Boolean);

    const data = await Devolucion.aggregate([
      {
        $facet: {
          total: [...pipelineBase, { $count: 'n' }],
          rows: [...pipelineBase, { $sort: sort }, { $skip: skip }, { $limit: lim }],
          sums: [...pipelineBase, { $group: { _id: null, importe: { $sum: '$importe' }, piezas: { $sum: '$cantidad' }, devoluciones: { $sum: 1 } } }]
        }
      }
    ]);

    const facet = data[0] || {};
    const total = (facet.total && facet.total[0] && facet.total[0].n) || 0;
    const rows = facet.rows || [];
    const sums = (facet.sums && facet.sums[0]) || { importe: 0, piezas: 0, devoluciones: 0 };

    return res.json({
      page: pg,
      limit: lim,
      total,
      pages: Math.ceil(total / lim),
      rows,
      footer: {
        totalImporte: Math.round((sums.importe || 0) * 100) / 100,
        totalPiezas: sums.piezas || 0,
        numDevoluciones: sums.devoluciones || 0
      }
    });
  } catch (err) {
    console.error('[devoluciones-listado][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar el listado de devoluciones.' });
  }
};

function parseSortCompras(orden = 'importe', dir = 'desc') {
  const campo = ['importe', 'piezas', 'compras', 'margen', 'venta'].includes(orden) ? orden : 'importe';
  const sentido = (String(dir).toLowerCase() === 'asc') ? 1 : -1;
  // _id para desempate estable
  return { [campo]: sentido, _id: 1 };
}

function buildMatchesCompras(q) {
  const { fechaIni, fechaFin, proveedorId, usuarioId, productoId, categoria, farmaciaId } = q;
  const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

  // Match a nivel documento
  const matchDoc = { fecha: { $gte: gte, $lt: lt } };
  if (proveedorId) matchDoc.proveedor = oid(proveedorId);
  if (usuarioId) matchDoc.usuario = oid(usuarioId);
  // Si tu Compra NO tiene farmacia, omite este filtro o agrega el campo (recomendado)
  if (farmaciaId) matchDoc.farmacia = oid(farmaciaId);

  // Match a nivel item
  const matchItem = {};
  if (productoId) matchItem['productos.producto'] = oid(productoId);

  return { matchDoc, matchItem, rango: { gte, lt }, categoria: categoria?.trim() || null };
}

// ---------- RESUMEN (KPIs + TOPS) ----------
exports.comprasResumen = async (req, res) => {
  try {
    const { matchDoc, matchItem, categoria } = buildMatchesCompras(req.query);
    const orden = String(req.query.orden || 'importe').trim().toLowerCase();
    const dir = String(req.query.dir || 'desc').trim().toLowerCase();
    const topN = Math.max(1, Math.min(100, parseInt(req.query.topN, 10) || 10));
    const sortTop = parseSortCompras(orden, dir);

    const now = new Date();
    const plusDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

    // Base items
    const base = [
      { $match: matchDoc },
      { $unwind: '$productos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          compraId: '$_id',
          proveedor: '$proveedor',
          usuario: '$usuario',
          producto: '$productos.producto',
          cantidad: '$productos.cantidad',
          costo: { $multiply: ['$productos.cantidad', '$productos.costoUnitario'] },
          venta: { $multiply: ['$productos.cantidad', '$productos.precioUnitario'] },
          fechaCad: '$productos.fechaCaducidad'
        }
      },
    ].filter(Boolean);

    const facet = {
      // KPIs a nivel item
      kpisItems: [
        ...base,
        {
          $group: {
            _id: null,
            piezas: { $sum: '$cantidad' },
            importe: { $sum: '$costo' },
            ventaPotencial: { $sum: '$venta' },
            productosDistintosArr: { $addToSet: '$producto' },
            proveedoresDistintosArr: { $addToSet: '$proveedor' }
          }
        },
        {
          $project: {
            _id: 0,
            piezas: 1,
            importe: 1,
            ventaPotencial: 1,
            productosDistintos: { $size: '$productosDistintosArr' },
            proveedoresDistintos: { $size: '$proveedoresDistintosArr' }
          }
        }
      ],
      // KPIs a nivel documento (para #compras y total reportado)
      kpisDocs: [
        { $match: matchDoc },
        { $group: { _id: null, numCompras: { $sum: 1 }, totalDocs: { $sum: '$total' } } },
        { $project: { _id: 0, numCompras: 1, totalDocs: 1 } }
      ],
      // Top Proveedores
      topProveedores: [
        ...base,
        {
          $group: {
            _id: '$proveedor',
            piezas: { $sum: '$cantidad' },
            importe: { $sum: '$costo' },
            venta: { $sum: '$venta' },
            comprasIds: { $addToSet: '$compraId' }
          }
        },
        { $addFields: { compras: { $size: '$comprasIds' }, margen: { $subtract: ['$venta', '$importe'] } } },
        { $sort: sortTop }, { $limit: topN },
        { $lookup: { from: 'proveedores', localField: '_id', foreignField: '_id', as: 'prov', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
        { $unwind: { path: '$prov', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, proveedorId: '$_id', nombre: '$prov.nombre', telefono: '$prov.telefono', piezas: 1, importe: 1, compras: 1, venta: 1, margen: 1 } }
      ],
      // Top Productos
      topProductos: [
        ...base,
        {
          $group: {
            _id: '$producto',
            piezas: { $sum: '$cantidad' },
            importe: { $sum: '$costo' },
            venta: { $sum: '$venta' }
          }
        },
        { $addFields: { margen: { $subtract: ['$venta', '$importe'] } } },
        { $sort: sortTop }, { $limit: topN },
        {
          $lookup: {
            from: 'productos', localField: '_id', foreignField: '_id', as: 'p',
            pipeline: [{ $project: { nombre: 1, codigoBarras: 1, unidad: 1, categoria: 1 } }]
          }
        },
        { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
        ...(categoria ? [{ $match: { 'p.categoria': categoria } }] : []),
        {
          $project: {
            _id: 0, productoId: '$_id', nombre: '$p.nombre', codigoBarras: '$p.codigoBarras', unidad: '$p.unidad',
            categoria: '$p.categoria', piezas: 1, importe: 1, venta: 1, margen: 1
          }
        }
      ],
      // Top Categorías
      topCategorias: [
        ...base,
        {
          $lookup: {
            from: 'productos', localField: 'producto', foreignField: '_id', as: 'p',
            pipeline: [{ $project: { categoria: 1 } }]
          }
        },
        { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
        ...(categoria ? [{ $match: { 'p.categoria': categoria } }] : []),
        {
          $group: {
            _id: '$p.categoria',
            piezas: { $sum: '$cantidad' },
            importe: { $sum: '$costo' },
            venta: { $sum: '$venta' }
          }
        },
        { $addFields: { margen: { $subtract: ['$venta', '$importe'] } } },
        { $sort: sortTop }, { $limit: topN },
        { $project: { _id: 0, categoria: '$_id', piezas: 1, importe: 1, venta: 1, margen: 1 } }
      ],
      // Top Usuarios (quién registró)
      topUsuarios: [
        ...base,
        {
          $group: {
            _id: '$usuario',
            piezas: { $sum: '$cantidad' },
            importe: { $sum: '$costo' },
            venta: { $sum: '$venta' }
          }
        },
        { $addFields: { margen: { $subtract: ['$venta', '$importe'] } } },
        { $sort: sortTop }, { $limit: topN },
        { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
        { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, usuarioId: '$_id', nombre: '$u.nombre', piezas: 1, importe: 1, venta: 1, margen: 1 } }
      ],
      // Caducidad (30/60/90 días)
      caducidades: [
        ...base,
        {
          $addFields: {
            diasACaducar: {
              $cond: [
                '$fechaCad',
                { $divide: [{ $subtract: ['$fechaCad', new Date()] }, 1000 * 60 * 60 * 24] },
                null
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            piezas30: { $sum: { $cond: [{ $lte: ['$fechaCad', plusDays(30)] }, '$cantidad', 0] } },
            piezas60: { $sum: { $cond: [{ $lte: ['$fechaCad', plusDays(60)] }, '$cantidad', 0] } },
            piezas90: { $sum: { $cond: [{ $lte: ['$fechaCad', plusDays(90)] }, '$cantidad', 0] } },
            avgDias: { $avg: '$diasACaducar' }
          }
        },
        { $project: { _id: 0, piezas30: 1, piezas60: 1, piezas90: 1, avgDias: { $round: ['$avgDias', 1] } } }
      ],
    };

    const data = await Compra.aggregate([{ $facet: facet }]);
    const f = data?.[0] || {};

    const kItems = f.kpisItems?.[0] || { piezas: 0, importe: 0, ventaPotencial: 0, productosDistintos: 0, proveedoresDistintos: 0 };
    const kDocs = f.kpisDocs?.[0] || { numCompras: 0, totalDocs: 0 };
    const ticketProm = kDocs.numCompras > 0 ? (kItems.importe / kDocs.numCompras) : 0;
    const cpp = kItems.piezas > 0 ? (kItems.importe / kItems.piezas) : 0;
    const margen = kItems.ventaPotencial - kItems.importe;
    const margenPct = kItems.importe > 0 ? (margen / kItems.importe) * 100 : null;

    return res.json({
      ok: true,
      kpis: {
        numCompras: kDocs.numCompras,
        importe: kItems.importe,
        piezas: kItems.piezas,
        ticketPromedio: ticketProm,
        costoPromPonderado: cpp,
        ventaPotencial: kItems.ventaPotencial,
        margenTeorico: margen,
        margenTeoricoPct: margenPct,
        proveedoresDistintos: kItems.proveedoresDistintos,
        productosDistintos: kItems.productosDistintos,
      },
      caducidades: f.caducidades?.[0] || { piezas30: 0, piezas60: 0, piezas90: 0, avgDias: null },
      topProveedores: f.topProveedores || [],
      topProductos: f.topProductos || [],
      topCategorias: f.topCategorias || [],
      topUsuarios: f.topUsuarios || [],
    });
  } catch (err) {
    console.error('[compras-resumen][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo generar el resumen de compras.' });
  }
};

// ---------- AGRUPACIONES REUSABLES ----------
exports.comprasPorProveedor = async (req, res) => {
  try {
    const { matchDoc, matchItem } = buildMatchesCompras(req.query);
    const sortTop = parseSortCompras(req.query.orden || 'importe', req.query.dir || 'desc');
    const top = Math.max(1, Math.min(100, parseInt(req.query.topN, 10) || 10));

    const rows = await Compra.aggregate([
      { $match: matchDoc },
      { $unwind: '$productos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          proveedor: '$proveedor',
          cantidad: '$productos.cantidad',
          costo: { $multiply: ['$productos.cantidad', '$productos.costoUnitario'] },
          venta: { $multiply: ['$productos.cantidad', '$productos.precioUnitario'] }
        }
      },
      {
        $group: {
          _id: '$proveedor',
          piezas: { $sum: '$cantidad' },
          importe: { $sum: '$costo' },
          venta: { $sum: '$venta' },
          comprasIds: { $addToSet: '$_id' }
        }
      },
      { $addFields: { compras: { $size: '$comprasIds' }, margen: { $subtract: ['$venta', '$importe'] } } },
      { $sort: sortTop }, { $limit: top },
      { $lookup: { from: 'proveedores', localField: '_id', foreignField: '_id', as: 'prov', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
      { $unwind: { path: '$prov', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, proveedorId: '$_id', nombre: '$prov.nombre', telefono: '$prov.telefono', piezas: 1, importe: 1, compras: 1, venta: 1, margen: 1 } }
    ].filter(Boolean));

    return res.json({ rows });
  } catch (err) {
    console.error('[compras-proveedor][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar compras por proveedor.' });
  }
};

exports.comprasPorProducto = async (req, res) => {
  try {
    const { matchDoc, matchItem, categoria } = buildMatchesCompras(req.query);
    const sortTop = parseSortCompras(req.query.orden || 'importe', req.query.dir || 'desc');
    const top = Math.max(1, Math.min(100, parseInt(req.query.topN, 10) || 10));

    const rows = await Compra.aggregate([
      { $match: matchDoc },
      { $unwind: '$productos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          producto: '$productos.producto',
          cantidad: '$productos.cantidad',
          costo: { $multiply: ['$productos.cantidad', '$productos.costoUnitario'] },
          venta: { $multiply: ['$productos.cantidad', '$productos.precioUnitario'] }
        }
      },
      { $group: { _id: '$producto', piezas: { $sum: '$cantidad' }, importe: { $sum: '$costo' }, venta: { $sum: '$venta' } } },
      { $addFields: { margen: { $subtract: ['$venta', '$importe'] } } },
      { $sort: sortTop }, { $limit: top },
      { $lookup: { from: 'productos', localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { nombre: 1, codigoBarras: 1, unidad: 1, categoria: 1 } }] } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      ...(categoria ? [{ $match: { 'p.categoria': categoria } }] : []),
      { $project: { _id: 0, productoId: '$_id', nombre: '$p.nombre', codigoBarras: '$p.codigoBarras', unidad: '$p.unidad', categoria: '$p.categoria', piezas: 1, importe: 1, venta: 1, margen: 1 } }
    ].filter(Boolean));

    return res.json({ rows });
  } catch (err) {
    console.error('[compras-producto][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar compras por producto.' });
  }
};

exports.comprasPorCategoria = async (req, res) => {
  try {
    const { matchDoc, matchItem, categoria } = buildMatchesCompras(req.query);
    const sortTop = parseSortCompras(req.query.orden || 'importe', req.query.dir || 'desc');
    const top = Math.max(1, Math.min(100, parseInt(req.query.topN, 10) || 10));

    const rows = await Compra.aggregate([
      { $match: matchDoc },
      { $unwind: '$productos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          producto: '$productos.producto',
          cantidad: '$productos.cantidad',
          costo: { $multiply: ['$productos.cantidad', '$productos.costoUnitario'] },
          venta: { $multiply: ['$productos.cantidad', '$productos.precioUnitario'] }
        }
      },
      { $lookup: { from: 'productos', localField: 'producto', foreignField: '_id', as: 'p', pipeline: [{ $project: { categoria: 1 } }] } },
      { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
      ...(categoria ? [{ $match: { 'p.categoria': categoria } }] : []),
      { $group: { _id: '$p.categoria', piezas: { $sum: '$cantidad' }, importe: { $sum: '$costo' }, venta: { $sum: '$venta' } } },
      { $addFields: { margen: { $subtract: ['$venta', '$importe'] } } },
      { $sort: sortTop }, { $limit: top },
      { $project: { _id: 0, categoria: '$_id', piezas: 1, importe: 1, venta: 1, margen: 1 } }
    ].filter(Boolean));

    return res.json({ rows });
  } catch (err) {
    console.error('[compras-categoria][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar compras por categoría.' });
  }
};

exports.comprasPorUsuario = async (req, res) => {
  try {
    const { matchDoc, matchItem } = buildMatchesCompras(req.query);
    const sortTop = parseSortCompras(req.query.orden || 'importe', req.query.dir || 'desc');
    const top = Math.max(1, Math.min(100, parseInt(req.query.topN, 10) || 10));

    const rows = await Compra.aggregate([
      { $match: matchDoc },
      { $unwind: '$productos' },
      Object.keys(matchItem).length ? { $match: matchItem } : null,
      {
        $addFields: {
          usuario: '$usuario',
          cantidad: '$productos.cantidad',
          costo: { $multiply: ['$productos.cantidad', '$productos.costoUnitario'] },
          venta: { $multiply: ['$productos.cantidad', '$productos.precioUnitario'] }
        }
      },
      { $group: { _id: '$usuario', piezas: { $sum: '$cantidad' }, importe: { $sum: '$costo' }, venta: { $sum: '$venta' }, comprasIds: { $addToSet: '$_id' } } },
      { $addFields: { compras: { $size: '$comprasIds' }, margen: { $subtract: ['$venta', '$importe'] } } },
      { $sort: sortTop }, { $limit: top },
      { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
      { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, usuarioId: '$_id', nombre: '$u.nombre', piezas: 1, importe: 1, compras: 1, venta: 1, margen: 1 } }
    ].filter(Boolean));

    return res.json({ rows });
  } catch (err) {
    console.error('[compras-usuario][ERROR]', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar compras por usuario.' });
  }
};


function buildMatchCancelaciones(q) {
  const { fechaIni, fechaFin, farmaciaId, usuarioId, clienteId } = q;
  const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);

  const match = { fechaCancelacion: { $gte: gte, $lt: lt } };
  if (farmaciaId) match.farmacia = oid(farmaciaId);
  if (usuarioId) match.usuario = oid(usuarioId);

  // clienteId se obtiene vía pedido.cliente → se filtra después del lookup
  const clienteOid = clienteId ? oid(clienteId) : null;

  return { match, clienteOid, rango: { gte, lt } };
}

// Proyección base: une pedido y calcula días hasta cancelar
function basePipeline(match, clienteOid) {
  const p = [
    { $match: match },
    {
      $lookup: {
        from: 'pedidos',
        localField: 'pedido',
        foreignField: '_id',
        as: 'ped',
        pipeline: [{ $project: { _id: 1, cliente: 1, fechaPedido: 1, total: 1 } }]
      }
    },
    { $unwind: { path: '$ped', preserveNullAndEmptyArrays: true } },
  ];

  if (clienteOid) {
    p.push({ $match: { 'ped.cliente': clienteOid } });
  }

  p.push({
    $addFields: {
      diasACancelar: {
        $cond: [
          { $and: ['$ped.fechaPedido', '$fechaCancelacion'] },
          { $divide: [{ $subtract: ['$fechaCancelacion', '$ped.fechaPedido'] }, 1000 * 60 * 60 * 24] },
          null
        ]
      }
    }
  });

  return p;
}

/**
 * GET /api/reportes/cancelaciones-resumen
 * Query: fechaIni, fechaFin, farmaciaId?, usuarioId?, clienteId?, topN=10, orden=importe|cancelaciones|avgDias, dir=desc|asc
 */
exports.cancelacionesResumen = async (req, res) => {
  try {
    const { topN = 10, orden = 'importe', dir = 'desc' } = req.query;
    const top = Math.max(1, Math.min(100, parseInt(topN, 10) || 10));
    const sortTop = parseSortCanc(orden, dir);

    const { match, clienteOid, rango } = buildMatchCancelaciones(req.query);

    // Facet principal sobre Cancelacion
    const facet = await Cancelacion.aggregate([
      ...basePipeline(match, clienteOid),
      {
        $facet: {
          kpis: [
            {
              $group: {
                _id: null,
                numCancelaciones: { $sum: 1 },
                dineroDevuelto: { $sum: { $ifNull: ['$dineroDevuelto', 0] } },
                valeDevuelto: { $sum: { $ifNull: ['$valeDevuelto', 0] } },
                totalDevuelto: { $sum: { $ifNull: ['$totalDevuelto', 0] } },
                avgDias: { $avg: '$diasACancelar' }
              }
            },
            {
              $project: {
                _id: 0,
                numCancelaciones: 1,
                dineroDevuelto: 1,
                valeDevuelto: 1,
                totalDevuelto: 1,
                ticketPromedioDevuelto: {
                  $cond: [
                    { $gt: ['$numCancelaciones', 0] },
                    { $divide: ['$totalDevuelto', '$numCancelaciones'] },
                    null
                  ]
                },
                avgDiasACancelar: { $round: ['$avgDias', 2] }
              }
            }
          ],

          topFarmacias: [
            {
              $group: {
                _id: '$farmacia',
                importe: { $sum: { $ifNull: ['$totalDevuelto', 0] } },
                dinero: { $sum: { $ifNull: ['$dineroDevuelto', 0] } },
                vale: { $sum: { $ifNull: ['$valeDevuelto', 0] } },
                cancelaciones: { $sum: 1 },
                avgDias: { $avg: '$diasACancelar' }
              }
            },
            { $sort: sortTop }, { $limit: top },
            { $lookup: { from: 'farmacias', localField: '_id', foreignField: '_id', as: 'f', pipeline: [{ $project: { nombre: 1 } }] } },
            { $unwind: { path: '$f', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                farmaciaId: '$_id',
                nombre: '$f.nombre',
                importe: 1, dinero: 1, vale: 1, cancelaciones: 1,
                avgDias: { $round: ['$avgDias', 2] }
              }
            }
          ],

          topUsuarios: [
            {
              $group: {
                _id: '$usuario',
                importe: { $sum: { $ifNull: ['$totalDevuelto', 0] } },
                dinero: { $sum: { $ifNull: ['$dineroDevuelto', 0] } },
                vale: { $sum: { $ifNull: ['$valeDevuelto', 0] } },
                cancelaciones: { $sum: 1 },
                avgDias: { $avg: '$diasACancelar' }
              }
            },
            { $sort: sortTop }, { $limit: top },
            { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
            { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                usuarioId: '$_id',
                nombre: '$u.nombre',
                importe: 1, dinero: 1, vale: 1, cancelaciones: 1,
                avgDias: { $round: ['$avgDias', 2] }
              }
            }
          ],

          topClientes: [
            { $match: { 'ped.cliente': { $ne: null } } },
            {
              $group: {
                _id: '$ped.cliente',
                importe: { $sum: { $ifNull: ['$totalDevuelto', 0] } },
                dinero: { $sum: { $ifNull: ['$dineroDevuelto', 0] } },
                vale: { $sum: { $ifNull: ['$valeDevuelto', 0] } },
                cancelaciones: { $sum: 1 },
                avgDias: { $avg: '$diasACancelar' }
              }
            },
            { $sort: sortTop }, { $limit: top },
            { $lookup: { from: 'clientes', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
            { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                clienteId: '$_id',
                nombre: '$c.nombre',
                telefono: '$c.telefono',
                importe: 1, dinero: 1, vale: 1, cancelaciones: 1,
                avgDias: { $round: ['$avgDias', 2] }
              }
            }
          ],
        }
      }
    ]);

    const facetRow = facet?.[0] || {};

    // Métrica extra: % de cancelaciones sobre pedidos creados en el rango
    const [totalPedidosEnRango, totalCancelacionesEnRango] = await Promise.all([
      Pedido.countDocuments({ fechaPedido: { $gte: rango.gte, $lt: rango.lt } }),
      Cancelacion.countDocuments(match)
    ]);

    const kpi = (facetRow.kpis?.[0]) || {
      numCancelaciones: 0, dineroDevuelto: 0, valeDevuelto: 0, totalDevuelto: 0,
      ticketPromedioDevuelto: null, avgDiasACancelar: null
    };
    const porcSobrePedidos = totalPedidosEnRango > 0
      ? (totalCancelacionesEnRango / totalPedidosEnRango) * 100
      : null;

    return res.json({
      ok: true,
      rango,
      kpis: {
        ...kpi,
        porcCancelacionesSobrePedidos: porcSobrePedidos
      },
      topFarmacias: facetRow.topFarmacias ?? [],
      topUsuarios: facetRow.topUsuarios ?? [],
      topClientes: facetRow.topClientes ?? [],
    });
  } catch (e) {
    console.error('[cancelaciones-resumen][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'No se pudo generar el resumen de cancelaciones.' });
  }
};

// Handler genérico para agrupados
async function agrupadoBy(field, req, res) {
  try {
    const { topN, orden = 'importe', dir = 'desc' } = req.query;
    const top = topN ? Math.max(1, Math.min(100, parseInt(topN, 10))) : null;
    const sortTop = parseSortCanc(orden, dir);

    const { match, clienteOid } = buildMatchCancelaciones(req.query);

    const groupId = (
      field === 'cliente' ? '$ped.cliente' :
        field === 'usuario' ? '$usuario' :
          field === 'farmacia' ? '$farmacia' : null
    );

    if (!groupId) return res.status(400).json({ ok: false, mensaje: 'Tipo de agrupación inválido' });

    const rows = await Cancelacion.aggregate([
      ...basePipeline(match, clienteOid),
      ...(field === 'cliente' ? [{ $match: { 'ped.cliente': { $ne: null } } }] : []),

      {
        $group: {
          _id: groupId,
          importe: { $sum: { $ifNull: ['$totalDevuelto', 0] } },
          dinero: { $sum: { $ifNull: ['$dineroDevuelto', 0] } },
          vale: { $sum: { $ifNull: ['$valeDevuelto', 0] } },
          cancelaciones: { $sum: 1 },
          avgDias: { $avg: '$diasACancelar' }
        }
      },
      { $sort: sortTop },
      ...(top ? [{ $limit: top }] : []),

      ...(field === 'cliente'
        ? [{ $lookup: { from: 'clientes', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { nombre: 1, telefono: 1 } }] } },
        { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0, clienteId: '$_id', nombre: '$c.nombre', telefono: '$c.telefono',
            importe: 1, dinero: 1, vale: 1, cancelaciones: 1, avgDias: { $round: ['$avgDias', 2] }
          }
        }]
        : field === 'usuario'
          ? [{ $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { nombre: 1 } }] } },
          { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0, usuarioId: '$_id', nombre: '$u.nombre',
              importe: 1, dinero: 1, vale: 1, cancelaciones: 1, avgDias: { $round: ['$avgDias', 2] }
            }
          }]
          : [{ $lookup: { from: 'farmacias', localField: '_id', foreignField: '_id', as: 'f', pipeline: [{ $project: { nombre: 1 } }] } },
          { $unwind: { path: '$f', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0, farmaciaId: '$_id', nombre: '$f.nombre',
              importe: 1, dinero: 1, vale: 1, cancelaciones: 1, avgDias: { $round: ['$avgDias', 2] }
            }
          }]
      )
    ]);

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error('[cancelaciones-agrupado][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'No se pudo generar el agrupado.' });
  }
}

// util peque para regex seguro
function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function castId(id) {
  return (id && Types.ObjectId.isValid(id)) ? new Types.ObjectId(id) : null;
}

function parseSortHist(orden = 'fecha', dir = 'desc') {
  // map nombres de columnas a campos reales proyectados
  const map = {
    fecha: 'fecha',
    proveedor: 'proveedor',          // nombre del proveedor (tras $lookup)
    producto: 'producto',            // nombre del producto (tras $lookup)
    lote: 'lote',
    fechaCaducidad: 'fechaCaducidad',
    costoUnitario: 'costoUnitario',
    cantidad: 'cantidad',
    costoTotal: 'costoTotal',
    precioUnitario: 'precioUnitario',
  };
  const campo = map[orden] || 'fecha';
  const sentido = (String(dir).toLowerCase() === 'asc') ? 1 : -1;
  // desempate estable por _id
  return { [campo]: sentido, _id: 1 };
}


/**
 * GET /api/reportes/compras-historial-producto
 * Ver historial (por filas de item) de compras donde aparece el producto
 */
exports.comprasHistorialProducto = async (req, res) => {
  try {
    const {
      fechaIni, fechaFin,
      productoId, q, cb,
      proveedorId, usuarioId,
      lote, cadIni, cadFin,
      orden = 'fecha', dir = 'desc',
      page = 1, limit = 50
    } = req.query;

    const { gte, lt } = dayRangeUtcOrMTD(fechaIni, fechaFin);

    const mDoc = { fecha: { $gte: gte, $lt: lt } };
    if (proveedorId) mDoc.proveedor = castId(proveedorId);
    if (usuarioId) mDoc.usuario = castId(usuarioId);

    // filtro por fecha de caducidad del item (opcional)
    const cadMatch = {};
    if (cadIni) cadMatch['productos.fechaCaducidad'] = { ...(cadMatch['productos.fechaCaducidad'] || {}), $gte: new Date(String(cadIni)) };
    if (cadFin) cadMatch['productos.fechaCaducidad'] = { ...(cadMatch['productos.fechaCaducidad'] || {}), $lte: new Date(String(cadFin)) };

    // filtro por producto:
    // - si viene productoId → match directo a nivel item
    // - si viene cb → filtraremos tras lookup de producto por codigoBarras
    // - si viene q → filtraremos tras lookup por nombre
    const prodId = castId(productoId);

    // paginación
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pg - 1) * lim;

    const sort = parseSortHist(orden, dir);

    const pipeline = [
      { $match: mDoc },
      { $unwind: { path: '$productos', preserveNullAndEmptyArrays: false } },

      // matches a nivel item
      ...(prodId ? [{ $match: { 'productos.producto': prodId } }] : []),
      ...(Object.keys(cadMatch).length ? [{ $match: cadMatch }] : []),
      ...(lote ? [{ $match: { 'productos.lote': { $regex: escapeRegex(String(lote).trim()), $options: 'i' } } }] : []),

      // lookups para enriquecer
      {
        $lookup: {
          from: 'productos',
          localField: 'productos.producto',
          foreignField: '_id',
          as: 'prod',
          pipeline: [{ $project: { nombre: 1, codigoBarras: 1 } }]
        }
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },

      // si vienen q / cb, filtra por los campos del producto
      ...(cb ? [{ $match: { 'prod.codigoBarras': String(cb).trim() } }] : []),
      ...(q ? [{ $match: { 'prod.nombre': { $regex: escapeRegex(String(q).trim()), $options: 'i' } } }] : []),

      {
        $lookup: {
          from: 'proveedores',
          localField: 'proveedor',
          foreignField: '_id',
          as: 'prov',
          pipeline: [{ $project: { nombre: 1 } }]
        }
      },
      { $unwind: { path: '$prov', preserveNullAndEmptyArrays: true } },

      // proyección “tabla”
      {
        $project: {
          _id: 1,
          fecha: 1,
          proveedorId: '$proveedor',
          proveedor: { $ifNull: ['$prov.nombre', '(sin proveedor)'] },

          productoId: '$productos.producto',
          producto: { $ifNull: ['$prod.nombre', '(sin producto)'] },
          codigoBarras: { $ifNull: ['$prod.codigoBarras', ''] },

          lote: '$productos.lote',
          fechaCaducidad: '$productos.fechaCaducidad',

          costoUnitario: { $ifNull: ['$productos.costoUnitario', 0] },
          cantidad: { $ifNull: ['$productos.cantidad', 0] },
          costoTotal: {
            $round: [
              {
                $multiply: [
                  { $ifNull: ['$productos.costoUnitario', 0] },
                  { $ifNull: ['$productos.cantidad', 0] }
                ]
              }, 2
            ]
          },
          precioUnitario: { $ifNull: ['$productos.precioUnitario', 0] }
        }
      },

      { $sort: sort },

      // facet para total + paginación + sumas
      {
        $facet: {
          total: [{ $count: 'n' }],
          rows: [{ $skip: skip }, { $limit: lim }],
          sums: [{
            $group: {
              _id: null,
              compras: { $sum: 1 },
              piezas: { $sum: '$cantidad' },
              costoTotal: { $sum: '$costoTotal' },
              costoUnitSum: { $sum: '$costoUnitario' },
              precioUnitSum: { $sum: '$precioUnitario' }
            }
          }]
        }
      }
    ];

    const agg = await Compra.aggregate(pipeline).collation({ locale: 'es', strength: 1 });
    const facet = agg?.[0] || {}; const total = facet.total?.[0]?.n || 0;
    const rows = facet.rows || [];
    const sums = facet.sums?.[0] || { compras: 0, piezas: 0, costoTotal: 0, costoUnitSum: 0, precioUnitSum: 0 };

    const totalItems = sums.compras || 0; // es el conteo global de renglones (items)
    const costoUnitProm = totalItems ? (sums.costoUnitSum / totalItems) : 0;
    const precioUnitProm = totalItems ? (sums.precioUnitSum / totalItems) : 0;

    return res.json({
      ok: true,
      rango: { fechaIni: gte, fechaFin: lt },
      filtros: {
        productoId: prodId ? String(prodId) : null,
        q: q || null, cb: cb || null,
        proveedorId: proveedorId || null,
        usuarioId: usuarioId || null,
        lote: lote || null,
        cadIni: cadIni || null, cadFin: cadFin || null,
        orden, dir
      },
      page: pg,
      limit: lim,
      total,
      pages: Math.ceil(total / lim),
      columns: [
        'Fecha', 'Proveedor', 'Producto', 'CB', 'Lote', 'Caducidad',
        'Costo Unit.', 'Cantidad', 'Costo Total', 'Precio Unit.'
      ],
      rows,
      footer: {
        compras: sums.compras || 0,
        piezas: sums.piezas || 0,
        costoTotal: Math.round((sums.costoTotal || 0) * 100) / 100,
        costoUnitProm: Math.round(costoUnitProm * 100) / 100,
        precioUnitProm: Math.round(precioUnitProm * 100) / 100
      }
    });
  } catch (e) {
    console.error('[comprasHistorialProducto][ERROR]', e);
    return res.status(500).json({ ok: false, mensaje: 'Error al generar historial de compras por producto' });
  }
};


exports.cancelacionesPorUsuario = (req, res) => agrupadoBy('usuario', req, res);
exports.cancelacionesPorFarmacia = (req, res) => agrupadoBy('farmacia', req, res);
exports.cancelacionesPorCliente = (req, res) => agrupadoBy('cliente', req, res);


// backBien/controllers/reportesControllers.js
const { DateTime } = require('luxon');
const { Types } = require('mongoose');

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');

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


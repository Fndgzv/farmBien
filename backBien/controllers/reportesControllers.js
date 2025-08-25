// backBien/controllers/reportesControllers.js
const { DateTime } = require('luxon');
const { Types } = require('mongoose');

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');

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

/** ──────────────────────────────────────────────────────────────────────
 *  Ventas de un producto (detalle por tickets/renglones)
 *  GET /api/reportes/ventas-producto-detalle
 *  Query: farmaciaId?, productoId? | (codigoBarras|nombre), fechaIni?, fechaFin?
 *  fechaIni/fechaFin como 'YYYY-MM-DD'
 */
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

/** ──────────────────────────────────────────────────────────────────────
 *  Resumen de productos vendidos por farmacia (agregado)
 *  GET /api/reportes/resumen-productos
 *  Query: farmaciaId?, fechaIni?, fechaFin?
 *  fechaIni/fechaFin como 'YYYY-MM-DD'
 */
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

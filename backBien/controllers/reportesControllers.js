// backBien/controllers/reportesControllers.js
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const { Types } = require('mongoose');
const { pipelineVentasProductoDetalle, pipelineVentasPorFarmacia } = require('../pipelines/reportesPipelines');

function parseDateOrDefault(value, def) {
  const d = value ? new Date(value) : def;
  return new Date(d);
}

exports.ventasProductoDetalle = async (req, res) => {
  try {
    let { farmaciaId, productoId, codigoBarras, nombre, fechaIni, fechaFin } = req.query;

    // Rango por defecto: últimos 15 días
    const now = new Date();
    const finDef = new Date(now.setHours(23, 59, 59, 999));
    const iniCalc = new Date(); iniCalc.setDate(iniCalc.getDate() - 15);
    const iniDef = new Date(iniCalc.setHours(0, 0, 0, 0));

    const fin = parseDateOrDefault(fechaFin, finDef);
    const ini = parseDateOrDefault(fechaIni, iniDef);

    // Resolver productoId si no viene
    if (!productoId) {
      let prod = null;
      if (codigoBarras) {
        prod = await Producto.findOne({ codigoBarras: String(codigoBarras).trim() }, { _id: 1 });
      } else if (nombre) {
        prod = await Producto.findOne({ nombre: new RegExp(`^${String(nombre).trim()}$`, 'i') }, { _id: 1 });
      }
      if (!prod) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
      productoId = String(prod._id);
    }

    // Validaciones básicas
    if (!Types.ObjectId.isValid(productoId)) {
      return res.status(400).json({ ok: false, mensaje: 'productoId inválido' });
    }
    if (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }

    const facet = await Venta.aggregate(
      pipelineVentasProductoDetalle({ productoId, farmaciaId: farmaciaId || null, fechaIni: ini, fechaFin: fin })
    );

    const items = facet?.[0]?.items || [];
    const resumen = facet?.[0]?.resumen?.[0] || { totalCantidad: 0, totalImporte: 0 };

    res.json({
      ok: true,
      reporte: 'Ventas del producto por farmacia',
      productoId,
      rango: { fechaIni: ini, fechaFin: fin },
      items,
      resumen
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, mensaje: 'Error al generar reporte de ventas por producto' });
  }
};

exports.resumenProductosVendidos = async (req, res) => {
  try {
    const { farmaciaId, fechaIni, fechaFin } = req.query;

    // Defaults: últimos 15 días
    const ahora = new Date();
    const finDef = new Date(ahora.setHours(23, 59, 59, 999));
    const iniDefCalc = new Date();
    iniDefCalc.setDate(iniDefCalc.getDate() - 15);
    const iniDef = new Date(iniDefCalc.setHours(0, 0, 0, 0));

    const fin = parseDateOrDefault(fechaFin, finDef);
    const ini = parseDateOrDefault(fechaIni, iniDef);

    // Validación básica de ObjectId (si viene)
    const farmaciaOk = farmaciaId ? Types.ObjectId.isValid(farmaciaId) : true;
    if (!farmaciaOk) {
      return res.status(400).json({ ok: false, mensaje: 'farmaciaId inválido' });
    }

    const pipeline = pipelineVentasPorFarmacia({
      farmaciaId: farmaciaId || null,
      fechaIni: ini,
      fechaFin: fin
    });

    const data = await Venta.aggregate(pipeline);
    res.json({ ok: true, rango: { fechaIni: ini, fechaFin: fin }, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener resumen de ventas' });
  }
};

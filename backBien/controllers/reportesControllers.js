// backBien/controllers/reportesControllers.js
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const { Types } = require('mongoose');
const { pipelineVentasProductoDetalle, pipelineVentasPorFarmacia } = require('../pipelines/reportesPipelines');

function parseDateOrDefault(value, def) {
  const d = value ? new Date(value) : def;
  return new Date(d);
}

function defaultRangeToday() {
  const now = new Date();
  const ini = new Date(now); ini.setHours(0, 0, 0, 0);
  const fin = new Date(now); fin.setHours(23, 59, 59, 999);
  return { ini, fin };
}

// Detecta "YYYY-MM-DD"
const isYMD = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Crea Date en zona local a inicio/fin de día cuando viene "YYYY-MM-DD"
function parseDateAtBoundary(value, boundary /* 'start' | 'end' */) {
  if (!value) return null;

  if (isYMD(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return boundary === 'start'
      ? new Date(y, m - 1, d, 0, 0, 0, 0)          // inicio de día local
      : new Date(y, m - 1, d, 23, 59, 59, 999);   // fin de día local
  }

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;

  // Si viene con hora, lo encajonamos igual a inicio/fin
  const d = new Date(dt);
  if (boundary === 'start') d.setHours(0, 0, 0, 0);
  else d.setHours(23, 59, 59, 999);
  return d;
}

function defaultRangeLast15Days() {
  const now = new Date();
  const fin = new Date(now); fin.setHours(23, 59, 59, 999);
  const ini = new Date(now); ini.setDate(ini.getDate() - 15); ini.setHours(0, 0, 0, 0);
  return { ini, fin };
}

exports.ventasProductoDetalle = async (req, res) => {
  try {
    let { farmaciaId, productoId, codigoBarras, nombre, fechaIni, fechaFin } = req.query;

    // Rango por defecto: últimos 15 días
    const now = new Date();
    //const finDef = new Date(now.setHours(23, 59, 59, 999));
    const iniCalc = new Date(); iniCalc.setDate(iniCalc.getDate() - 15);
    //const iniDef = new Date(iniCalc.setHours(0, 0, 0, 0));

    const { ini: iniDef, fin: finDef } = defaultRangeLast15Days();
    const ini = parseDateAtBoundary(fechaIni, 'start') || iniDef;
    const fin = parseDateAtBoundary(fechaFin, 'end')   || finDef;

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
    const resumen = facet?.[0]?.resumen?.[0] || {
      totalCantidad: 0,
      totalImporte: 0,
      totalCosto: 0,
      totalUtilidad: 0,
      margenPct: null
    };
    
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
    //const finDef = new Date(ahora.setHours(23, 59, 59, 999));
    const iniDefCalc = new Date();
    iniDefCalc.setDate(iniDefCalc.getDate() - 15);
    //const iniDef = new Date(iniDefCalc.setHours(0, 0, 0, 0));

    const { ini: iniDef, fin: finDef } = defaultRangeToday();
    const ini = parseDateAtBoundary(fechaIni, 'start') || iniDef;
    const fin = parseDateAtBoundary(fechaFin, 'end')   || finDef;

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

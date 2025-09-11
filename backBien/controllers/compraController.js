// controllers/compraController.js
const mongoose = require('mongoose');
const Proveedor = require('../models/Proveedor');
const Compra = require('../models/Compra');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

exports.obtenerCompras = async (req, res) => {
  try {
    const compras = await Compra
      .find()
      .populate('proveedor usuario productos.producto');
    res.json(compras);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al obtener compras" });
  }
};

exports.crearCompra = async (req, res) => {
  try {
    // 1️⃣ Solo admin puede registrar compra
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo administradores pueden registrar compras' });
    }

    const { proveedor, productos } = req.body;
    const usuarioId = req.usuario.id;

    // 2️⃣ Validar proveedor
    const prov = await Proveedor.findById(proveedor);
    if (!prov) {
      return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    }

    let total = 0;
    const items = [];

    // 3️⃣ Procesar cada producto
    for (const p of productos) {
      const {
        codigoBarras,
        cantidad,
        lote,
        fechaCaducidad,
        costoUnitario,
        precioUnitario,
        stockMinimo,
        stockMaximo,
        promociones
      } = p;

      const prodDB = await Producto.findOne({ codigoBarras });
      if (!prodDB) {
        return res.status(404).json({ mensaje: `Producto no encontrado: ${codigoBarras}` });
      }

      // 4️⃣ Actualizar costo, precio unitario, stockMinimo y stockMaximo
      prodDB.costo = costoUnitario;
      prodDB.precio = precioUnitario;
      prodDB.stockMinimo = stockMinimo;
      prodDB.stockMaximo = stockMaximo;

      // 5️⃣ Actualizar promociones si vienen
      if (promociones) {
        Object.assign(prodDB, {
          promoLunes: promociones.promoLunes ?? prodDB.promoLunes,
          promoMartes: promociones.promoMartes ?? prodDB.promoMartes,
          promoMiercoles: promociones.promoMiercoles ?? prodDB.promoMiercoles,
          promoJueves: promociones.promoJueves ?? prodDB.promoJueves,
          promoViernes: promociones.promoViernes ?? prodDB.promoViernes,
          promoSabado: promociones.promoSabado ?? prodDB.promoSabado,
          promoDomingo: promociones.promoDomingo ?? prodDB.promoDomingo,
          promoCantidadRequerida: promociones.promoCantidadRequerida ?? prodDB.promoCantidadRequerida,
          inicioPromoCantidad: promociones.inicioPromoCantidad ?? prodDB.inicioPromoCantidad,
          finPromoCantidad: promociones.finPromoCantidad ?? prodDB.finPromoCantidad,
          descuentoINAPAM: promociones.descuentoINAPAM ?? prodDB.descuentoINAPAM,
          promoDeTemporada: promociones.promoDeTemporada ?? prodDB.promoDeTemporada
        });
      }

      // 6️⃣ Actualizar lotes
      prodDB.lotes.push({ lote, fechaCaducidad, cantidad });

      // Limpiar lotes vacíos por si acaso
      prodDB.lotes = prodDB.lotes.filter(l => l.cantidad > 0);
      await prodDB.save();

      // 7️⃣ Actualizar precios en farmacias (precio de venta sincronizado)
      await InventarioFarmacia.updateMany(
        { producto: prodDB._id },
        { precioVenta: precioUnitario }
      );

      // 8️⃣ Acumular detalle para guardar la compra
      total += costoUnitario * cantidad;
      items.push({
        producto: prodDB._id,
        cantidad,
        lote,
        fechaCaducidad,
        costoUnitario,
        precioUnitario
      });
    }

    // 9️⃣ Guardar el documento de compra
    const compra = new Compra({
      usuario: usuarioId,
      proveedor,
      productos: items,
      total
    });

    await compra.save();

    res.status(201).json({
      mensaje: 'Compra registrada correctamente',
      compra
    });

  } catch (error) {
    console.error('Error al crear compra:', error);
    res.status(500).json({ mensaje: 'Error interno al crear compra', error: error.message });
  }
};

// helper para blindar fechas locales → UTC
function dayRangeUtcFromQuery(fechaIni, fechaFin) {
  const hoy = new Date();
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const ini = fechaIni ? new Date(fechaIni) : primeroMes;
  const fin = fechaFin ? new Date(fechaFin) : hoy;

  // normalizar a UTC (half-open interval: [gte, lt))
  const gte = new Date(Date.UTC(ini.getFullYear(), ini.getMonth(), ini.getDate(), 0, 0, 0));
  const lt = new Date(Date.UTC(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1, 0, 0, 0));

  return { gte, lt };
}

// GET /api/compras/consulta
// query:
//   fechaIni, fechaFin     -> rango de fechas (local-safe via dayRangeUtcFromQuery)
//   proveedor              -> match parcial por nombre de proveedor
//   importeDesde, importeHasta
//   productoNombre         -> match parcial por nombre de producto
//   productoCodigoBarras   -> match parcial por código de barras
exports.consultarCompras = async (req, res) => {
  try {
    const {
      fechaIni,
      fechaFin,
      proveedor,
      importeDesde,
      importeHasta,
      productoNombre,
      codigoBarras
    } = req.query;

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '15', 10)));
    const skip = (page - 1) * limit;
    const barra = (codigoBarras ?? '').trim();

    // Rango de fechas blindado a local -> UTC exclusivo
    const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);

    // Filtro base
    const filtro = { fecha: { $gte: gte, $lt: lt } };

    // --- Proveedor: por nombre (regex case-insensitive)
    if (proveedor) {
      const provDocs = await Proveedor.find(
        { nombre: { $regex: String(proveedor), $options: 'i' } },
        { _id: 1 }
      );
      const provIds = provDocs.map(p => p._id);
      filtro.proveedor = { $in: provIds.length ? provIds : [null] }; // [null] forzará 0 matches si vacío
    }

    // --- Producto: por nombre y/o código de barras
    if (productoNombre || barra) {
      const prodQuery = {};
      if (productoNombre) {
        prodQuery.nombre = { $regex: String(productoNombre), $options: 'i' };
      }
      if (barra) {
        // opcional: exacto si parece un código completo; si no, regex
        const escaped = String(barra).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escapa regex
        prodQuery.codigoBarras =
          barra.length >= 8 ? new RegExp(`^${escaped}$`, 'i') : new RegExp(escaped, 'i');
      }

      const prodDocs = await Producto.find(prodQuery, { _id: 1 });
      const prodIds = prodDocs.map(p => p._id);

      if (prodIds.length === 0) {
        return res.json({
          ok: true,
          paginacion: { page, limit, total: 0, totalPaginas: 0 },
          rows: []
        });
      }

      filtro['productos.producto'] = { $in: prodIds };
    }


    // --- Filtros de importe total
    const d = Number(importeDesde), h = Number(importeHasta);
    if (!Number.isNaN(d) && !Number.isNaN(h)) {
      filtro.total = { $gte: d, $lte: h };
    } else if (!Number.isNaN(d)) {
      filtro.total = { $gte: d };
    } else if (!Number.isNaN(h)) {
      filtro.total = { $lte: h };
    }

    // Consulta y conteo
    const [docs, total] = await Promise.all([
      Compra.find(filtro)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(limit)
        .populate('proveedor', 'nombre')
        .populate('productos.producto', 'nombre codigoBarras'),
      Compra.countDocuments(filtro)
    ]);

    // Formato de salida
    const rows = docs.map(c => ({
      compraId: c._id,
      fecha: c.fecha,
      proveedor: c.proveedor?.nombre || '(s/proveedor)',
      total: c.total,
      productos: (c.productos || []).map(p => ({
        nombre: p.producto?.nombre || '',
        codigoBarras: p.producto?.codigoBarras || '',
        cantidad: p.cantidad,
        lote: p.lote,
        fechaCaducidad: p.fechaCaducidad,
        costoUnitario: p.costoUnitario,
        precioUnitario: p.precioUnitario
      }))
    }));

    res.json({
      ok: true,
      paginacion: {
        page,
        limit,
        total,
        totalPaginas: Math.ceil(total / limit)
      },
      rows
    });

  } catch (e) {
    console.error('[consultarCompras][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar compras' });
  }
};

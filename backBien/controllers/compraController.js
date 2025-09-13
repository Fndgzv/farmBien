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

/** Helpers */
const toNum = (v) => (Number.isFinite(+v) ? +v : 0);

/**
 * Intenta leer una fecha desde el body:
 * - Acepta body.fecha o body.fechaCompra
 * - Formato 'YYYY-MM-DD' => genera Date local a las 12:00 (evita saltos por TZ)
 * - Formato ISO u otros => new Date(cadena)
 * Retorna Date válida o null si no hay/invalid.
 */
function readFechaFromBody(body) {
  const raw = body?.fecha ?? body?.fechaCompra;
  if (!raw) return null;

  const s = String(raw).trim();

  // 'YYYY-MM-DD'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    // Mediodía local para no "rebotar" al día anterior/siguiente por TZ
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }

  // Intento directo (ISO u otros)
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

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

    // 2.1️⃣ Determinar fecha de la compra (opcional, no futuro)
    const now = new Date();
    let fechaCompra = readFechaFromBody(req.body); // null si no mandaron
    if (fechaCompra && fechaCompra > now) {
      return res.status(400).json({ mensaje: 'La fecha de compra no puede ser futura' });
    }
    if (!fechaCompra) {
      // si no mandan, usamos ahora
      fechaCompra = now;
    }

    // 3️⃣ Validaciones básicas
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ mensaje: 'Debes enviar al menos un producto' });
    }

    let total = 0;
    const items = [];

    // 4️⃣ Procesar cada producto
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
      } = p || {};

      if (!codigoBarras) {
        return res.status(400).json({ mensaje: 'Falta código de barras en un renglón' });
      }
      const cant = toNum(cantidad);
      const costo = toNum(costoUnitario);
      const precio = toNum(precioUnitario);

      if (cant <= 0) {
        return res.status(400).json({ mensaje: `Cantidad inválida para ${codigoBarras}` });
      }
      if (costo < 0 || precio < 0) {
        return res.status(400).json({ mensaje: `Costo/precio inválidos para ${codigoBarras}` });
      }

      const prodDB = await Producto.findOne({ codigoBarras });
      if (!prodDB) {
        return res.status(404).json({ mensaje: `Producto no encontrado: ${codigoBarras}` });
      }

      // 5️⃣ Actualizar costo, precio y stocks configurables
      if (Number.isFinite(costo)) prodDB.costo = costo;
      if (Number.isFinite(precio)) prodDB.precio = precio;

      if (stockMinimo !== undefined) prodDB.stockMinimo = toNum(stockMinimo);
      if (stockMaximo !== undefined) prodDB.stockMaximo = toNum(stockMaximo);

      // 6️⃣ Actualizar promociones si vienen (mantiene lo anterior si no mandan)
      if (promociones && typeof promociones === 'object') {
        Object.assign(prodDB, {
          promoLunes:               promociones.promoLunes ?? prodDB.promoLunes,
          promoMartes:              promociones.promoMartes ?? prodDB.promoMartes,
          promoMiercoles:           promociones.promoMiercoles ?? prodDB.promoMiercoles,
          promoJueves:              promociones.promoJueves ?? prodDB.promoJueves,
          promoViernes:             promociones.promoViernes ?? prodDB.promoViernes,
          promoSabado:              promociones.promoSabado ?? prodDB.promoSabado,
          promoDomingo:             promociones.promoDomingo ?? prodDB.promoDomingo,
          promoCantidadRequerida:   promociones.promoCantidadRequerida ?? prodDB.promoCantidadRequerida,
          inicioPromoCantidad:      promociones.inicioPromoCantidad ?? prodDB.inicioPromoCantidad,
          finPromoCantidad:         promociones.finPromoCantidad ?? prodDB.finPromoCantidad,
          descuentoINAPAM:          promociones.descuentoINAPAM ?? prodDB.descuentoINAPAM,
          promoDeTemporada:         promociones.promoDeTemporada ?? prodDB.promoDeTemporada
        });
      }

      // 7️⃣ Actualizar/merge de lotes:
      //    - si llega un lote que ya existe, acumula cantidades
      //    - si es nuevo, lo agrega
      if (lote && cant > 0) {
        const idx = (prodDB.lotes || []).findIndex(l => l.lote === lote);
        if (idx >= 0) {
          prodDB.lotes[idx].cantidad = toNum(prodDB.lotes[idx].cantidad) + cant;
          // si viene fechaCaducidad en la compra, actualízala (o conserva si no mandan)
          if (fechaCaducidad) prodDB.lotes[idx].fechaCaducidad = fechaCaducidad;
        } else {
          prodDB.lotes.push({
            lote,
            fechaCaducidad: fechaCaducidad || null,
            cantidad: cant
          });
        }
      }

      // Limpia lotes sin cantidad
      prodDB.lotes = (prodDB.lotes || []).filter(l => toNum(l.cantidad) > 0);

      await prodDB.save();

      // 8️⃣ Sincronizar precio de venta en inventarios (todas las farmacias del producto)
      // (si tu negocio requiere solo una farmacia, ajusta el filtro)
      await InventarioFarmacia.updateMany(
        { producto: prodDB._id },
        { $set: { precioVenta: precio } }
      );

      // 9️⃣ Acumular detalle para la compra
      total += costo * cant;
      items.push({
        producto: prodDB._id,
        cantidad: cant,
        lote: lote || null,
        fechaCaducidad: fechaCaducidad || null,
        costoUnitario: costo,
        precioUnitario: precio
      });
    }

    // 🔟 Guardar el documento de compra
    const compra = new Compra({
      usuario: usuarioId,
      proveedor,
      productos: items,
      total: +total.toFixed(2),
      fecha: fechaCompra   // ⬅️ fecha efectiva de la compra (backdate-friendly)
    });

    await compra.save();

    return res.status(201).json({
      mensaje: 'Compra registrada correctamente',
      compra
    });

  } catch (error) {
    console.error('Error al crear compra:', error);
    return res.status(500).json({ mensaje: 'Error interno al crear compra', error: error.message });
  }
};

// helper para blindar fechas locales → UTC
function dayRangeUtcFromQuery(fechaIni, fechaFin) {
  const hoy = new Date();
  const primeroMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const ini = fechaIni ? new Date(fechaIni) : primeroMes;
  const fin = fechaFin ? new Date(fechaFin) : hoy;

  // [gte, lt) en UTC
  const gte = new Date(Date.UTC(ini.getFullYear(), ini.getMonth(), ini.getDate(), 0, 0, 0));
  const lt  = new Date(Date.UTC(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1, 0, 0, 0));

  return { gte, lt };
}

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

    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '15', 10)));
    const skip  = (page - 1) * limit;
    const barra = (codigoBarras ?? '').trim();

    // Rango de fechas blindado a local -> UTC exclusivo
    const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);

    // Filtro base
    const filtro = { fecha: { $gte: gte, $lt: lt } };

    // --- Proveedor (regex case-insensitive)
    if (proveedor) {
      const provDocs = await Proveedor.find(
        { nombre: { $regex: String(proveedor), $options: 'i' } },
        { _id: 1 }
      );
      const provIds = provDocs.map(p => p._id);
      filtro.proveedor = { $in: provIds.length ? provIds : [null] };
    }

    // --- Producto: por nombre y/o código de barras
    if (productoNombre || barra) {
      const prodQuery = {};
      if (productoNombre) {
        prodQuery.nombre = { $regex: String(productoNombre), $options: 'i' };
      }
      if (barra) {
        const escaped = String(barra).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        prodQuery.codigoBarras =
          barra.length >= 8 ? new RegExp(`^${escaped}$`, 'i') : new RegExp(escaped, 'i');
      }

      const prodDocs = await Producto.find(prodQuery, { _id: 1 });
      const prodIds  = prodDocs.map(p => p._id);

      if (prodIds.length === 0) {
        return res.json({
          ok: true,
          paginacion: { page, limit, total: 0, totalPaginas: 0 },
          footer: { totalCompras: 0 },
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

    // Consulta, conteo y footer (suma total de la búsqueda)
    const [docs, total, footAgg] = await Promise.all([
      Compra.find(filtro)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(limit)
        .populate('proveedor', 'nombre')
        .populate('productos.producto', 'nombre codigoBarras'),
      Compra.countDocuments(filtro),
      Compra.aggregate([
        { $match: filtro },
        { $group: { _id: null, totalCompras: { $sum: '$total' } } }
      ])
    ]);

    const footer = {
      totalCompras: +Number(footAgg?.[0]?.totalCompras || 0).toFixed(2)
    };

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
      footer,
      rows
    });

  } catch (e) {
    console.error('[consultarCompras][ERROR]', e);
    res.status(500).json({ ok: false, mensaje: 'Error al consultar compras' });
  }
};

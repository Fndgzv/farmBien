// backBien/controllers/surtidoFarmaciaController.js
const mongoose = require('mongoose');
const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

const norm = (s) => (s ?? '')
  .toString()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// --- helpers de matching por palabras (todas las palabras deben aparecer) ---
function words(str) {
  return norm(str).split(' ').filter(Boolean);
}
function containsAll(haystack, needle) {
  const H = norm(haystack);
  const ws = words(needle);
  for (const w of ws) {
    if (!H.includes(w)) return false;
  }
  return true;
}

exports.surtirFarmacia = async (req, res) => {
  try {
    // 0) Solo admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo administradores pueden surtir farmacias' });
    }

    // NUEVO: filtros opcionales
    const {
      farmaciaId,
      confirm = false,
      detalles = [],
      categoria,     // opcional
      ubicacion      // opcional
    } = req.body;

    // Mapa de omisiones por producto (default false)
    const omitirMap = new Map();
    if (Array.isArray(detalles)) {
      for (const d of detalles) {
        if (d && d.producto) omitirMap.set(String(d.producto), Boolean(d.omitir));
      }
    }

    // 1) Traer inventario de la farmacia con producto poblado (lotes)
    const inventarios = await InventarioFarmacia.find({ farmacia: farmaciaId })
      .populate({ path: 'producto', model: Producto });

    // 1.1) Aplicar filtros opcionales por categoría/ubicación sobre el producto
    const filtraProducto = (prod) => {
      if (!prod) return false;
      let ok = true;
      if (categoria) ok = ok && containsAll(prod.categoria ?? '', categoria);
      if (ubicacion) ok = ok && containsAll(prod.ubicacion ?? '', ubicacion);
      return ok;
    };

    // 2) Filtrar los que están <= stockMin **y** cumplen filtros (si hay)
    const bajos = inventarios.filter(inv =>
      (inv.existencia ?? 0) <= (inv.stockMin ?? 0) &&
      filtraProducto(inv.producto)
    );

    // 3) Generar "pendientes" con disponible en almacén (suma lotes)
    const pendientes = bajos.map(inv => ({
      producto: inv.producto?._id,
      nombre: inv.producto?.nombre,
      codigoBarras: inv.producto?.codigoBarras,
      categoria: inv.producto?.categoria,
      ubicacion: inv.producto?.ubicacion,
      existenciaActual: inv.existencia ?? 0,
      stockMin: inv.stockMin ?? 0,
      stockMax: inv.stockMax ?? 0,
      falta: Math.max(0, (inv.stockMax ?? 0) - (inv.existencia ?? 0)),
      disponibleEnAlmacen: Array.isArray(inv.producto?.lotes)
        ? inv.producto.lotes.reduce((sum, l) => sum + (l.cantidad ?? 0), 0)
        : 0,
      omitir: omitirMap.has(String(inv.producto?._id || ''))
        ? omitirMap.get(String(inv.producto?._id || ''))
        : false
    }));

    // === ORDENAR POR CATEGORÍA (luego ubicación y nombre) ===
    pendientes.sort((a, b) =>
      cmp(norm(a.categoria), norm(b.categoria)) ||
      cmp(norm(a.ubicacion), norm(b.ubicacion)) ||
      cmp(norm(a.nombre),    norm(b.nombre))
    );

    // 4) Si no confirman, solo devolvemos pendientes
    if (!confirm) {
      return res.json({ pendientes });
    }

    // 5) Confirmaron: surtir respetando "omitir" y disponibilidad real en lotes
    const session = await mongoose.startSession();
    let items = [];
    let surtidoId = null;

    try {
      await session.withTransaction(async () => {
        for (const inv of bajos) {
          const prod = inv.producto;
          if (!prod) continue;

          const pid = String(prod._id);
          const skip = omitirMap.has(pid) ? omitirMap.get(pid) : false;
          if (skip) continue;

          let restante = Math.max(0, (inv.stockMax ?? 0) - (inv.existencia ?? 0));
          if (restante <= 0) continue;

          // Suma disponible en almacén
          const disponible = Array.isArray(prod.lotes)
            ? prod.lotes.reduce((s, l) => s + (l.cantidad ?? 0), 0)
            : 0;
          if (disponible <= 0) continue;

          // Orden por caducidad ASC
          prod.lotes.sort((a, b) => new Date(a.fechaCaducidad) - new Date(b.fechaCaducidad));

          let transferido = 0;

          for (const lote of prod.lotes) {
            if (restante <= 0) break;
            const existLote = Math.max(0, lote.cantidad ?? 0);
            if (existLote <= 0) continue;

            const tomo = Math.min(existLote, restante);
            if (tomo <= 0) continue;

            lote.cantidad = existLote - tomo;
            restante -= tomo;
            transferido += tomo;

            items.push({
              producto: prod._id,
              lote: lote.lote || 'SIN-LOTE',
              cantidad: tomo,
              precioUnitario: inv.precioVenta ?? prod.precio ?? 0
            });
          }

          if (transferido > 0) {
            await prod.save({ session });
            inv.existencia = Math.min((inv.existencia ?? 0) + transferido, inv.stockMax ?? Infinity);
            await inv.save({ session });
          }
        }

        if (items.length === 0) {
          throw new Error('No hubo movimientos: sin existencia en almacén o todos marcados como "omitir".');
        }

        const [surtidoDoc] = await SurtidoFarmacia.create([{
          farmacia: farmaciaId,
          usuarioSurtio: req.usuario.id,
          tipoMovimiento: 'surtido',
          items
        }], { session });
        surtidoId = surtidoDoc._id;
      });

      const surtido = await SurtidoFarmacia.findById(surtidoId)
        .populate({ path: 'items.producto', select: 'nombre codigoBarras categoria ubicacion' });

      const sObj = surtido?.toObject ? surtido.toObject() : surtido;
      if (sObj?.items?.length) {
        sObj.items.sort((a, b) =>
          cmp(norm(a.producto?.categoria), norm(b.producto?.categoria)) ||
          cmp(norm(a.producto?.nombre),    norm(b.producto?.nombre))
        );
      }

      return res.json({
        mensaje: 'Farmacia surtida correctamente (solo con cantidades disponibles y sin omitir).',
        filtros: { categoria: categoria ?? null, ubicacion: ubicacion ?? null }, // útil para depurar
        pendientes,
        surtido: sObj
      });

    } catch (txErr) {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: 'No se realizó el surtido.',
        detalle: txErr.message,
        pendientes
      });
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error('Error en surtirFarmacia:', error);
    return res.status(500).json({
      mensaje: 'Error interno al surtir farmacia',
      error: error.message
    });
  }
};

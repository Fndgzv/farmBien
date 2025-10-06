// backBien/controllers/surtidoFarmaciaController.js
const mongoose = require('mongoose');
const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

exports.surtirFarmacia = async (req, res) => {
  try {
    // 0) Solo admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo administradores pueden surtir farmacias' });
    }

    const { farmaciaId, confirm = false, detalles = [] } = req.body;

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

    // 2) Filtrar los que están <= stockMin
    const bajos = inventarios.filter(inv => (inv.existencia ?? 0) <= (inv.stockMin ?? 0));

    // 3) Generar "pendientes" con disponible en almacén (suma lotes)
    const pendientes = bajos.map(inv => {
      const falta = Math.max(0, (inv.stockMax ?? 0) - (inv.existencia ?? 0));
      const disponibleEnAlmacen = Array.isArray(inv.producto?.lotes)
        ? inv.producto.lotes.reduce((sum, l) => sum + (l.cantidad ?? 0), 0)
        : 0;
      const pid = String(inv.producto?._id || '');
      const omitir = omitirMap.has(pid) ? omitirMap.get(pid) : false;

      return {
        producto: inv.producto?._id,
        nombre: inv.producto?.nombre,
        codigoBarras: inv.producto?.codigoBarras,
        categoria: inv.producto?.categoria,
        ubicacion: inv.producto?.ubicacion,
        existenciaActual: inv.existencia ?? 0,
        stockMin: inv.stockMin ?? 0,
        stockMax: inv.stockMax ?? 0,
        falta,
        disponibleEnAlmacen,
        omitir
      };
    });

    // 4) Si no confirman, solo devolvemos pendientes (marcando omitir calculado)
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

          // Orden por caducidad ASC (lotes más próximos primero)
          prod.lotes.sort((a, b) => new Date(a.fechaCaducidad) - new Date(b.fechaCaducidad));

          let transferido = 0;

          for (const lote of prod.lotes) {
            if (restante <= 0) break;
            const existLote = Math.max(0, lote.cantidad ?? 0);
            if (existLote <= 0) continue;

            const tomo = Math.min(existLote, restante);
            if (tomo <= 0) continue;

            lote.cantidad = existLote - tomo; // descuenta del almacén
            restante -= tomo;
            transferido += tomo;

            items.push({
              producto: prod._id,
              lote: lote.lote || 'SIN-LOTE',
              cantidad: tomo,
              precioUnitario: inv.precioVenta ?? prod.precio ?? 0
            });
          }

          // Si hubo transferencia, persistimos cambios
          if (transferido > 0) {
            await prod.save({ session });
            inv.existencia = Math.min((inv.existencia ?? 0) + transferido, inv.stockMax ?? Infinity);
            await inv.save({ session });
          }
        }

        if (items.length === 0) {
          // Nada que surtir: abortamos antes de guardar movimiento
          throw new Error('No hubo movimientos: sin existencia en almacén o todos marcados como "omitir".');
        }

        // Guardar documento de surtido SOLO con los items realmente surtidos
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

      // OK transacción
      return res.json({
        mensaje: 'Farmacia surtida correctamente (solo con cantidades disponibles y sin omitir).',
        pendientes, // útil para UI
        surtido
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

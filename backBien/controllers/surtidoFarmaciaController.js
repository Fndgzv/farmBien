// backBien/controllers/surtidoFarmaciaController.js
const mongoose = require('mongoose');
const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

// helpers: split y containsAll

exports.surtirFarmacia = async (req, res) => {
  try {
    // 0) Solo admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo administradores pueden surtir farmacias' });
    }

    // Filtros opcionales
    const {
      farmaciaId,
      confirm = false,
      detalles = [],
      categoria,
      ubicacion,
      ubicacionFarmacia
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

    // mapa productoId -> ubicacionFarmacia (solo para enriquecer respuesta/impresión)
    const ubicFarmaPorProd = new Map(
      inventarios
        .filter(inv => inv?.producto?._id)
        .map(inv => [ String(inv.producto._id), inv.ubicacionFarmacia || '' ])
    );

    // helpers locales por si no existen en el archivo
    const norm = (s) => String(s ?? '').toLowerCase().trim();
    const containsAll = (txt, query) =>
      norm(query).split(/\s+/).filter(Boolean).every(w => norm(txt).includes(w));
    const cmp = (a, b) => (a > b) - (a < b);

    // 1.1) Aplicar filtros: categoria (Producto) y ubicacion (Producto.ubicacion)
    const pasaFiltros = (inv) => {
      const prod = inv?.producto;
      if (!prod) return false;

      let ok = true;
      if (categoria) ok = ok && containsAll(prod.categoria ?? '', categoria);
      if (ubicacion) ok = ok && containsAll(prod.ubicacion ?? '', ubicacion);
      if (ubicacionFarmacia) ok = ok && containsAll(inv.ubicacionFarmacia ?? '', ubicacionFarmacia);
      return ok;
    };

    // 2) Filtrar los que están <= stockMin y cumplen filtros
    const bajos = inventarios.filter(inv =>
      (inv.existencia ?? 0) <= (inv.stockMin ?? 0) && pasaFiltros(inv)
    );

    // 3) Generar "pendientes"
    const pendientes = bajos.map(inv => ({
      producto: inv.producto?._id,
      nombre: inv.producto?.nombre,
      codigoBarras: inv.producto?.codigoBarras,
      categoria: inv.producto?.categoria,
      ubicacion: inv.producto?.ubicacion,               // <- ubicación en almacén (filtro)
      ubicacionFarmacia: inv.ubicacionFarmacia || '',   // informativo
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

    // === ORDENAR POR categoría -> producto.ubicacion -> nombre ===
    pendientes.sort((a, b) =>
      cmp(norm(a.categoria), norm(b.categoria)) ||
      cmp(norm(a.ubicacionFarmacia), norm(b.ubicacionFarmacia)) ||
      cmp(norm(a.ubicacion), norm(b.ubicacion)) ||
      cmp(norm(a.nombre),    norm(b.nombre))
    );

    // 4) Si no confirman, solo devolvemos pendientes
    if (!confirm) {
      return res.json({
        filtros: {
          categoria: categoria ?? null,
          ubicacion: ubicacion ?? null,
          ubicacionFarmacia: ubicacionFarmacia ?? null
        },
        pendientes
      });
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

      // Traer el surtido y poblar producto para imprimir
      const surtido = await SurtidoFarmacia.findById(surtidoId)
        .populate({ path: 'items.producto', select: 'nombre codigoBarras categoria ubicacion' });

      // Enriquecer con ubicacionFarmacia (informativo) y ordenar como pediste
      const sObj = surtido?.toObject ? surtido.toObject() : surtido;
      if (sObj?.items?.length) {
        sObj.items = sObj.items.map(it => {
          const pid = it?.producto?._id ? String(it.producto._id) : null;
          const uf = pid ? (ubicFarmaPorProd.get(pid) || '') : '';
          return { ...it, ubicacionFarmacia: uf };
        });

        sObj.items.sort((a, b) =>
          cmp(norm(a.producto?.categoria), norm(b.producto?.categoria)) ||
          cmp(norm(a.producto?.ubicacion), norm(b.producto?.ubicacion)) ||
          cmp(norm(a.producto?.nombre),    norm(b.producto?.nombre))
        );
      }

      return res.json({
        mensaje: 'Farmacia surtida correctamente (solo con cantidades disponibles y sin omitir).',
        filtros: {
          categoria: categoria ?? null,
          ubicacion: ubicacion ?? null,
          ubicacionFarmacia: ubicacionFarmacia ?? null
        },
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

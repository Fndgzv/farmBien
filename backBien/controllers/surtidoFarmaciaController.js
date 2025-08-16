const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const Venta = require('../models/Venta');

exports.surtirFarmacia = async (req, res) => {
  try {
    // 0) Solo admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ mensaje: 'Solo administradores pueden surtir farmacias' });
    }

    const { farmaciaId, confirm = false } = req.body;

    // 1) Traer todo el inventario de la farmacia con el producto poblado
    const inventarios = await InventarioFarmacia.find({ farmacia: farmaciaId })
      .populate('producto');

    // 2) Filtrar aquellos que están por debajo o al tope del stockMin
    const bajos = inventarios.filter(inv => inv.existencia < inv.stockMin);

    // 3) Generar lista de pendientes con stockMin/Max
    const pendientes = bajos.map(inv => {
      // calculamos cuánto falta para llegar a stockMax
      const falta = inv.stockMax - inv.existencia;
      // calculamos stock disponible en almacén (sumamos todos los lotes del producto)
      const disponibleEnAlmacen = inv.producto.lotes
        .reduce((sum, l) => sum + l.cantidad, 0);
      return {
        producto:           inv.producto._id,
        nombre:             inv.producto.nombre,
        codigoBarras:       inv.producto.codigoBarras,
        existenciaActual:   inv.existencia,
        stockMin:           inv.stockMin,
        stockMax:           inv.stockMax,
        falta,
        disponibleEnAlmacen
      };
    });

    // 4) Si no confirman, solo devolvemos pendientes
    if (!confirm) {
      return res.json({ pendientes });
    }

    // 5) Confirmaron: surtir cada inventario bajo hasta stockMax
    const items = [];
    for (const inv of bajos) {
      // Cantidad total a reponer
      let restante = inv.stockMax - inv.existencia;

      // Ordenamos lotes por caducidad (central)
      inv.producto.lotes.sort((a, b) =>
        new Date(a.fechaCaducidad) - new Date(b.fechaCaducidad)
      );

      // Repartimos de los lotes centrales
      for (const lote of inv.producto.lotes) {
        if (restante <= 0) break;
        if (lote.cantidad <= 0) continue;

        const tomo = Math.min(lote.cantidad, restante);
        lote.cantidad -= tomo;
        restante   -= tomo;

        items.push({
          producto:      inv.producto._id,
          lote:          lote.lote,
          cantidad:      tomo,
          precioUnitario: inv.precioVenta
        });
      }

      // Guardamos cambios en el producto (lotes)
      await inv.producto.save();

      // Actualizamos existencia de la farmacia al stockMax
      inv.existencia = inv.stockMax;
      await inv.save();
    }

    // 6) Guardar documento de surtido
    const surtidoDoc = await SurtidoFarmacia.create({
      farmacia:      farmaciaId,
      usuarioSurtio: req.usuario.id,
      tipoMovimiento:'surtido',
      items
    });

    return res.json({
      mensaje:   'Farmacia surtida correctamente',
      pendientes,
      surtido:   surtidoDoc
    });
  } catch (error) {
    console.error('Error en surtirFarmacia:', error);
    return res.status(500).json({
      mensaje: 'Error interno al surtir farmacia',
      error:   error.message
    });
  }
};

// backBien/controllers/inventarioPortatil.controller.js
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const Farmacia = require('../models/Farmacia');

/* ======================================================
   1) Buscar producto (por código de barras o nombre)
====================================================== */
exports.buscarProducto = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const regex = new RegExp(q, "i");

    const productos = await Producto.find({
      $or: [
        { codigoBarras: q },
        { nombre: regex },
        { nombreNorm: regex }
      ]
    })
      .select('nombre codigoBarras lotes categoria precio costo nombreNorm');

    res.json(productos);

  } catch (error) {
    console.error("❌ Error buscarProducto:", error);
    res.status(500).json({ mensaje: "Error al buscar producto." });
  }
};

/* ======================================================
   2) AJUSTAR EXISTENCIA EN FARMACIA (ambos roles)
   - ajustaAlmacen: puede modificar cualquier farmacia
   - ajustaFarma: solo su farmacia
====================================================== */
exports.ajustarExistenciaFarmacia = async (req, res) => {
  try {
    const { farmaciaId, productoId } = req.params;
    const { nuevaExistencia } = req.body;

    if (typeof nuevaExistencia !== "number" || nuevaExistencia < 0) {
      return res.status(400).json({ mensaje: "Existencia inválida." });
    }

    // Validación para ajustaFarma
    if (req.usuario.rol === "ajustaFarma") {
      if (req.usuario.farmacia.toString() !== farmaciaId) {
        return res.status(403).json({ mensaje: "No puedes ajustar otras farmacias." });
      }
    }

    const inv = await InventarioFarmacia.findOneAndUpdate(
      { farmacia: farmaciaId, producto: productoId },
      { existencia: nuevaExistencia },
      { new: true }
    );

    if (!inv) return res.status(404).json({ mensaje: "Inventario no encontrado." });

    res.json({ mensaje: "Existencia actualizada", inventario: inv });

  } catch (error) {
    console.error("❌ Error ajustarExistenciaFarmacia:", error);
    res.status(500).json({ mensaje: "Error al ajustar existencia." });
  }
};

/* ======================================================
   3) LISTAR LOTES DEL PRODUCTO (solo ajustaAlmacen)
====================================================== */
exports.obtenerLotes = async (req, res) => {
  try {
    const { productoId } = req.params;

    const prod = await Producto.findById(productoId).select('lotes nombre codigoBarras');

    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    res.json(prod.lotes);

  } catch (error) {
    console.error("❌ Error obtenerLotes:", error);
    res.status(500).json({ mensaje: "Error al obtener lotes." });
  }
};

/* ======================================================
   4) AGREGAR LOTE (solo ajustaAlmacen)
====================================================== */
exports.agregarLote = async (req, res) => {
  try {
    const { productoId } = req.params;
    const { lote, fechaCaducidad, cantidad } = req.body;

    if (!lote || cantidad < 0) {
      return res.status(400).json({ mensaje: "Datos inválidos." });
    }

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    prod.lotes.push({
      lote,
      fechaCaducidad: fechaCaducidad || null,
      cantidad
    });

    await prod.save();

    res.json({ mensaje: "Lote agregado", lotes: prod.lotes });

  } catch (error) {
    console.error("❌ Error agregarLote:", error);
    res.status(500).json({ mensaje: "Error al agregar lote." });
  }
};

/* ======================================================
   5) EDITAR LOTE (solo ajustaAlmacen)
====================================================== */
exports.editarLote = async (req, res) => {
  try {
    const { productoId, loteId } = req.params;
    const { lote, fechaCaducidad, cantidad } = req.body;

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    const l = prod.lotes.id(loteId);
    if (!l) return res.status(404).json({ mensaje: "Lote no encontrado." });

    if (lote) l.lote = lote;
    if (fechaCaducidad !== undefined) l.fechaCaducidad = fechaCaducidad;
    if (cantidad !== undefined && cantidad >= 0) l.cantidad = cantidad;

    await prod.save();

    res.json({ mensaje: "Lote actualizado", lote: l });

  } catch (error) {
    console.error("❌ Error editarLote:", error);
    res.status(500).json({ mensaje: "Error al editar lote." });
  }
};

/* ======================================================
   6) ELIMINAR LOTE (solo ajustaAlmacen)
====================================================== */
exports.eliminarLote = async (req, res) => {
  try {
    const { productoId, loteId } = req.params;

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    prod.lotes = prod.lotes.filter(l => l._id.toString() !== loteId);

    await prod.save();

    res.json({ mensaje: "Lote eliminado", lotes: prod.lotes });

  } catch (error) {
    console.error("❌ Error eliminarLote:", error);
    res.status(500).json({ mensaje: "Error al eliminar lote." });
  }
};

exports.obtenerProductoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const prod = await Producto.findById(id)
      .select("nombre codigoBarras categoria unidad precio costo lotes");

    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado" });

    res.json(prod);

  } catch (error) {
    console.error("❌ Error obtenerProductoPorId:", error);
    res.status(500).json({ mensaje: "Error al obtener producto." });
  }
};

exports.obtenerInventarioFarmacia = async (req, res) => {
  try {
    const { farmaciaId, productoId } = req.params;

    const inv = await InventarioFarmacia.findOne({
      farmacia: farmaciaId,
      producto: productoId
    });

    if (!inv) {
      return res.json({ existencia: 0 }); // No existe → 0
    }

    res.json(inv);

  } catch (error) {
    console.error("❌ Error obtenerInventarioFarmacia:", error);
    res.status(500).json({ mensaje: "Error al obtener existencia." });
  }
};

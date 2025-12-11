// backBien/controllers/inventarioPortatil.controller.js
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const InventarioFisico = require('../models/InventarioFisico');

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

    const usuarioId = req.usuario._id; // <-- viene del token

    if (typeof nuevaExistencia !== "number" || nuevaExistencia < 0) {
      return res.status(400).json({ mensaje: "Existencia inválida." });
    }

    // Validación ajustaFarma
    if (req.usuario.rol === "ajustaFarma" &&
      req.usuario.farmacia.toString() !== farmaciaId) {
      return res.status(403).json({ mensaje: "No puedes ajustar otras farmacias." });
    }

    // Obtener existencia anterior
    const invAnterior = await InventarioFarmacia.findOne({
      farmacia: farmaciaId,
      producto: productoId
    });

    const existenciaSistema = invAnterior?.existencia ?? 0;

    // Actualizar
    const inv = await InventarioFarmacia.findOneAndUpdate(
      { farmacia: farmaciaId, producto: productoId },
      { existencia: nuevaExistencia },
      { new: true, upsert: true }
    );

    // Registrar inventario físico
    const diferencia = nuevaExistencia - existenciaSistema;
    const prod = await Producto.findById(productoId).select("costo");

    const perdida = diferencia * (prod?.costo ?? 0);

    await InventarioFisico.create({
      fechaInv: new Date(),
      farmaNombre: inv.farmacia.toString(), // puede cambiarse por nombre luego
      producto: productoId,
      existenciaSistema,
      existenciaFisica: nuevaExistencia,
      diferencia,
      perdida,
      usuario: usuarioId
    });

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
    const usuarioId = req.usuario._id;

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    // Antes de guardar obtenemos el valor del sistema actual
    const existenciaSistema = prod.lotes.reduce((tot, l) => tot + (l.cantidad || 0), 0);

    // Agregar lote
    prod.lotes.push({ lote, fechaCaducidad, cantidad });
    await prod.save();

    // Nuevo total
    const existenciaFisica = prod.lotes.reduce((tot, l) => tot + (l.cantidad || 0), 0);

    const diferencia = existenciaFisica - existenciaSistema;
    const perdida = diferencia * (prod.costo || 0);

    await InventarioFisico.create({
      fechaInv: new Date(),
      farmaNombre: "Almacén",
      producto: productoId,
      existenciaSistema,
      existenciaFisica,
      diferencia,
      perdida,
      usuario: usuarioId
    });

    res.json({ mensaje: "Lote agregado", lotes: prod.lotes });

  } catch (error) {
    console.error(error);
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
    const usuarioId = req.usuario._id;

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    // SUMA PREVIA (existencia en sistema)
    const existenciaSistema = prod.lotes.reduce((t, l) => t + (l.cantidad || 0), 0);

    // OBTENER LOTE
    const l = prod.lotes.id(loteId);
    if (!l) return res.status(404).json({ mensaje: "Lote no encontrado." });

    // APLICAR CAMBIOS
    if (lote !== undefined) l.lote = lote;
    if (fechaCaducidad !== undefined) l.fechaCaducidad = fechaCaducidad;
    if (cantidad !== undefined && cantidad >= 0) l.cantidad = cantidad;

    await prod.save();

    // SUMA DESPUÉS (existencia física)
    const existenciaFisica = prod.lotes.reduce((t, l) => t + (l.cantidad || 0), 0);

    // DIFERENCIA Y PÉRDIDA
    const diferencia = existenciaFisica - existenciaSistema;
    const perdida = diferencia * (prod.costo || 0);

    // GUARDAR REGISTRO DE INVENTARIO FÍSICO
    await InventarioFisico.create({
      fechaInv: new Date(),
      farmaNombre: "Almacén",
      producto: productoId,
      existenciaSistema,
      existenciaFisica,
      diferencia,
      perdida,
      usuario: usuarioId
    });

    res.json({
      mensaje: "Lote actualizado",
      lote: l,
      existenciaSistema,
      existenciaFisica,
      diferencia,
      perdida
    });

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
    const usuarioId = req.usuario._id;

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    // SUMA PREVIA
    const existenciaSistema = prod.lotes.reduce((t, l) => t + (l.cantidad || 0), 0);

    // ELIMINAR LOTE
    prod.lotes = prod.lotes.filter(l => l._id.toString() !== loteId);

    await prod.save();

    // SUMA DESPUÉS
    const existenciaFisica = prod.lotes.reduce((t, l) => t + (l.cantidad || 0), 0);

    // DIFERENCIA Y PÉRDIDA
    const diferencia = existenciaFisica - existenciaSistema;
    const perdida = diferencia * (prod.costo || 0);

    // REGISTRO DE INVENTARIO FÍSICO
    await InventarioFisico.create({
      fechaInv: new Date(),
      farmaNombre: "Almacén",
      producto: productoId,
      existenciaSistema,
      existenciaFisica,
      diferencia,
      perdida,
      usuario: usuarioId
    });

    res.json({
      mensaje: "Lote eliminado",
      lotes: prod.lotes,
      existenciaSistema,
      existenciaFisica,
      diferencia,
      perdida
    });

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

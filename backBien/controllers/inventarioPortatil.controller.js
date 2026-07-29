// backBien/controllers/inventarioPortatil.controller.js
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const InventarioFisico = require('../models/InventarioFisico');
const Farmacia = require('../models/Farmacia');
const mongoose = require('mongoose');

const UBICACION_MAX_LENGTH = 120;

function esObjectIdValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function leerUbicacion(ubicacion) {
  if (ubicacion === undefined || ubicacion === null) {
    return { presente: false };
  }

  if (typeof ubicacion !== 'string') {
    return { presente: false, error: "La ubicación debe ser texto." };
  }

  const valor = ubicacion.trim();
  if (!valor) return { presente: false };

  if (valor.length > UBICACION_MAX_LENGTH) {
    return {
      presente: false,
      error: `La ubicación no puede exceder ${UBICACION_MAX_LENGTH} caracteres.`
    };
  }

  return { presente: true, valor };
}

function puedeAccederFarmacia(req, farmaciaId) {
  if (req.usuario.rol === "ajustaAlmacen") return true;

  return req.usuario.rol === "ajustaFarma" &&
    req.usuario.farmacia &&
    req.usuario.farmacia.toString() === farmaciaId;
}

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
    const { nuevaExistencia, ubicacion } = req.body;

    const usuarioId = req.usuario._id; // <-- viene del token
    const tieneExistencia = nuevaExistencia !== undefined && nuevaExistencia !== null;
    const ubicacionValidada = leerUbicacion(ubicacion);

    if (!esObjectIdValido(farmaciaId) || !esObjectIdValido(productoId)) {
      return res.status(400).json({ mensaje: "Farmacia o producto inválido." });
    }

    if (ubicacionValidada.error) {
      return res.status(400).json({ mensaje: ubicacionValidada.error });
    }

    if (tieneExistencia &&
      (typeof nuevaExistencia !== "number" ||
        !Number.isFinite(nuevaExistencia) ||
        nuevaExistencia < 0)) {
      return res.status(400).json({ mensaje: "Existencia inválida." });
    }

    if (!tieneExistencia && !ubicacionValidada.presente) {
      return res.status(400).json({ mensaje: "No hay cambios válidos para guardar." });
    }

    // ajustaFarma solo puede operar la farmacia asignada en el token.
    if (!puedeAccederFarmacia(req, farmaciaId)) {
      return res.status(403).json({ mensaje: "No puedes ajustar otras farmacias." });
    }

    const [farmaciaExiste, prod] = await Promise.all([
      Farmacia.exists({ _id: farmaciaId }),
      Producto.findById(productoId).select("costo")
    ]);

    if (!farmaciaExiste) {
      return res.status(404).json({ mensaje: "Farmacia no encontrada." });
    }

    if (!prod) {
      return res.status(404).json({ mensaje: "Producto no encontrado." });
    }

    // Obtener existencia anterior
    const invAnterior = await InventarioFarmacia.findOne({
      farmacia: farmaciaId,
      producto: productoId
    });

    const existenciaSistema = invAnterior?.existencia ?? 0;
    const $set = {};

    if (!invAnterior && !tieneExistencia) {
      return res.status(404).json({
        mensaje: "El producto no tiene inventario en la farmacia indicada."
      });
    }

    if (tieneExistencia) $set.existencia = nuevaExistencia;
    if (ubicacionValidada.presente) {
      $set.ubicacionFarmacia = ubicacionValidada.valor;
    }

    // Existencia y ubicación se guardan juntas en el mismo documento.
    const inv = await InventarioFarmacia.findOneAndUpdate(
      { farmacia: farmaciaId, producto: productoId },
      { $set },
      { new: true, upsert: tieneExistencia }
    );

    // Una actualización exclusiva de ubicación no genera movimiento físico.
    if (tieneExistencia) {
      const diferencia = nuevaExistencia - existenciaSistema;
      const perdida = diferencia * (prod.costo ?? 0);

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
    }

    res.json({
      mensaje: tieneExistencia ? "Existencia actualizada" : "Ubicación actualizada",
      inventario: inv
    });

  } catch (error) {
    console.error("❌ Error ajustarExistenciaFarmacia:", error);
    res.status(500).json({ mensaje: "Error al actualizar el inventario." });
  }
};

/* ======================================================
   2.1) ACTUALIZAR SOLO UBICACIÓN EN ALMACÉN
====================================================== */
exports.actualizarUbicacionAlmacen = async (req, res) => {
  try {
    const { productoId } = req.params;
    const ubicacionValidada = leerUbicacion(req.body.ubicacion);

    if (!esObjectIdValido(productoId)) {
      return res.status(400).json({ mensaje: "Producto inválido." });
    }

    if (ubicacionValidada.error) {
      return res.status(400).json({ mensaje: ubicacionValidada.error });
    }

    if (!ubicacionValidada.presente) {
      return res.status(400).json({ mensaje: "La ubicación es requerida." });
    }

    const producto = await Producto.findByIdAndUpdate(
      productoId,
      { $set: { ubicacion: ubicacionValidada.valor } },
      { new: true }
    ).select("nombre codigoBarras ubicacion");

    if (!producto) {
      return res.status(404).json({ mensaje: "Producto no encontrado." });
    }

    res.json({ mensaje: "Ubicación actualizada", producto });
  } catch (error) {
    console.error("❌ Error actualizarUbicacionAlmacen:", error);
    res.status(500).json({ mensaje: "Error al actualizar la ubicación." });
  }
};


/* ======================================================
   3) LISTAR LOTES DEL PRODUCTO (solo ajustaAlmacen)
====================================================== */
exports.obtenerLotes = async (req, res) => {
  try {
    const { productoId } = req.params;

    if (!esObjectIdValido(productoId)) {
      return res.status(400).json({ mensaje: "Producto inválido." });
    }

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
    const { lote, fechaCaducidad, cantidad, ubicacion } = req.body;
    const usuarioId = req.usuario._id;
    const ubicacionValidada = leerUbicacion(ubicacion);

    if (!esObjectIdValido(productoId)) {
      return res.status(400).json({ mensaje: "Producto inválido." });
    }

    if (ubicacionValidada.error) {
      return res.status(400).json({ mensaje: ubicacionValidada.error });
    }

    const prod = await Producto.findById(productoId);
    if (!prod) return res.status(404).json({ mensaje: "Producto no encontrado." });

    // Antes de guardar obtenemos el valor del sistema actual
    const existenciaSistema = prod.lotes.reduce((tot, l) => tot + (l.cantidad || 0), 0);

    // Agregar lote
    prod.lotes.push({ lote, fechaCaducidad, cantidad });
    if (ubicacionValidada.presente) {
      prod.ubicacion = ubicacionValidada.valor;
    }
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
    const { lote, fechaCaducidad, cantidad, ubicacion } = req.body;
    const usuarioId = req.usuario._id;
    const ubicacionValidada = leerUbicacion(ubicacion);

    if (!esObjectIdValido(productoId) || !esObjectIdValido(loteId)) {
      return res.status(400).json({ mensaje: "Producto o lote inválido." });
    }

    if (ubicacionValidada.error) {
      return res.status(400).json({ mensaje: ubicacionValidada.error });
    }

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
    if (ubicacionValidada.presente) {
      prod.ubicacion = ubicacionValidada.valor;
    }

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

    if (!esObjectIdValido(productoId) || !esObjectIdValido(loteId)) {
      return res.status(400).json({ mensaje: "Producto o lote inválido." });
    }

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

    if (!esObjectIdValido(id)) {
      return res.status(400).json({ mensaje: "Producto inválido." });
    }

    const prod = await Producto.findById(id)
      .select("nombre codigoBarras categoria unidad precio costo lotes ubicacion");

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

    if (!esObjectIdValido(farmaciaId) || !esObjectIdValido(productoId)) {
      return res.status(400).json({ mensaje: "Farmacia o producto inválido." });
    }

    if (!puedeAccederFarmacia(req, farmaciaId)) {
      return res.status(403).json({ mensaje: "No puedes consultar otras farmacias." });
    }

    const farmaciaExiste = await Farmacia.exists({ _id: farmaciaId });
    if (!farmaciaExiste) {
      return res.status(404).json({ mensaje: "Farmacia no encontrada." });
    }

    const inv = await InventarioFarmacia.findOne({
      farmacia: farmaciaId,
      producto: productoId
    });

    if (!inv) {
      return res.json({ existencia: 0, ubicacionFarmacia: "" }); // No existe → 0
    }

    res.json(inv);

  } catch (error) {
    console.error("❌ Error obtenerInventarioFarmacia:", error);
    res.status(500).json({ mensaje: "Error al obtener existencia." });
  }
};

const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');
const mongoose = require('mongoose');
const { Types } = mongoose;
const ObjectId = Types.ObjectId;

function construirFiltroProducto({ nombre, categoria, codigoBarras, inapam, generico }) {
    const filtros = { $and: [] };

    if (nombre) {
        const palabras = nombre.trim().split(/\s+/);
        filtros.$and.push({
            $or: palabras.map(p => ({ nombre: { $regex: p, $options: 'i' } }))
        });
    }

    if (categoria) {
        const palabrasCat = categoria.trim().split(/\s+/);
        filtros.$and.push({
            $or: palabrasCat.map(p => ({ categoria: { $regex: p, $options: 'i' } }))
        });
    }

    if (codigoBarras) {
        filtros.$and.push({ codigoBarras });
    }

    /* if (typeof inapam === 'string' && (inapam === 'true' || inapam === 'false')) {
        filtros.$and.push({ inapam: inapam === 'true' });
    }

    if (typeof generico === 'string' && (generico === 'true' || generico === 'false')) {
        filtros.$and.push({ generico: generico === 'true' });
    } */

    if (inapam === 'true' || inapam === 'false') {
        filtros.$and.push({ descuentoINAPAM: inapam === 'true' });
    }

    if (generico === 'true' || generico === 'false') {
        filtros.$and.push({ generico: generico === 'true' });
    }

    // Si no hay condiciones en $and, eliminarlo para evitar filtrado vacío
    if (filtros.$and.length === 0) {
        return {};
    }

    return filtros;
}

// Obtener inventario con filtros en farmacia
exports.obtenerInventarioFarmacia = async (req, res) => {
  const {
    farmacia,
    nombre, codigoBarras, categoria, inapam, generico,
    sortBy = 'existencia',          // 'existencia' | 'nombre'
    sortDir = 'asc'                 // 'asc' | 'desc'
  } = req.query;

  if (!farmacia) {
    return res.status(400).json({ mensaje: "Debe especificar una farmacia." });
  }

  try {
    // 1) Filtrado de productos (obtenemos IDs válidos)
    const filtrosProducto = construirFiltroProducto({ nombre, categoria, codigoBarras, inapam, generico });
    const productos = await Producto.find(filtrosProducto).select('_id').lean();
    const productosIds = productos.map(p => p._id);

    if (productosIds.length === 0) {
      return res.json([]); // nada que listar
    }

    // 2) Dirección de orden
    const dir = String(sortDir).toLowerCase() === 'desc' ? -1 : 1;

    // 3) Pipeline: match inventario -> lookup producto -> sort -> project
    const pipe = [
      { $match: { farmacia: new ObjectId(farmacia), producto: { $in: productosIds } } },
      {
        $lookup: {
          from: 'productos',
          localField: 'producto',
          foreignField: '_id',
          as: 'prod'
        }
      },
      { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
      // Orden dinámico
      (String(sortBy) === 'nombre')
        ? { $sort: { 'prod.nombre': dir, _id: 1 } }
        : { $sort: { existencia: dir, _id: 1 } },
      // Proyección con la forma que espera el front
      {
        $project: {
          _id: 1,
          farmacia: 1,
          producto: {
            _id: '$prod._id',
            nombre: '$prod.nombre',
            codigoBarras: '$prod.codigoBarras',
            categoria: '$prod.categoria',
            generico: '$prod.generico',
            descuentoINAPAM: '$prod.descuentoINAPAM',
            stockMinimo: '$prod.stockMinimo',
            stockMaximo: '$prod.stockMaximo'
          },
          ubicacionEnFarmacia: 1,
          existencia: 1,
          stockMax: 1,
          stockMin: 1,
          precioVenta: 1
        }
      }
    ];

    const inventario = await InventarioFarmacia.aggregate(pipe).allowDiskUse(true);
    return res.json(inventario);
  } catch (error) {
    console.error('[obtenerInventarioFarmacia][ERROR]', error);
    return res.status(500).json({ mensaje: "Error al obtener inventario" });
  }
};


// Actualización masiva en farmacia (existencia, stockMax y stockMin)
exports.actualizarInventarioMasivo = async (req, res) => {
    const farmacia = req.params.farmaciaId;
    const cambios = req.body; // Array con { id, existencia, stockMax, stockMin }

    if (!farmacia || !Array.isArray(cambios)) {
        return res.status(400).json({ mensaje: "Datos inválidos para actualización masiva." });
    }

    try {
        const resultados = [];

        for (const cambio of cambios) {
            const { id, existencia, stockMax, stockMin } = cambio;

            const updateData = {};

            if (existencia > 0) updateData.existencia = existencia;
            if (stockMax > 0) updateData.stockMax = stockMax;
            if (stockMin > 0) updateData.stockMin = stockMin;

            if (Object.keys(updateData).length === 0) {
                // No hay nada que actualizar
                continue;
            }

            const resUpdate = await InventarioFarmacia.findByIdAndUpdate(
                id,
                updateData,
                { new: true }
            );
            resultados.push(resUpdate);
        }

        res.json({ mensaje: "Ajuste masivo realizado con éxito", resultados });
    } catch (error) {
        console.error('Error en back al actualizar masivamente:', error);
        res.status(500).json({ mensaje: "Error al actualizar masivamente", error });
    }
};



// Actualización individual de un producto en farmacia
exports.actualizarInventarioIndividual = async (req, res) => {
    const { id } = req.params;
    const { existencia, stockMax, stockMin, precioVenta, ubicacionEnFarmacia } = req.body;

    try {
        const inventario = await InventarioFarmacia.findById(id);
        if (!inventario) {
            return res.status(404).json({ mensaje: "Registro no encontrado" });
        }

        if (existencia !== undefined) inventario.existencia = existencia;
        if (stockMax !== undefined) inventario.stockMax = stockMax;
        if (stockMin !== undefined) inventario.stockMin = stockMin;
        if (precioVenta !== undefined) inventario.precioVenta = precioVenta;
        if (ubicacionEnFarmacia !== undefined) inventario.ubicacionEnFarmacia = ubicacionEnFarmacia;

        await inventario.save();
        res.json({ mensaje: "Inventario actualizado", inventario });
    } catch (error) {
        res.status(500).json({ mensaje: "Error en la actualización individual", error });
    }
};

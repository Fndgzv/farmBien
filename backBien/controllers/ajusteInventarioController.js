const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');
const mongoose = require('mongoose');
const { Types } = mongoose;
const ObjectId = Types.ObjectId;

// Helpers: sanitizar texto y partir en palabras
function normTxt(s) {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function splitWords(s) {
  return normTxt(s).split(' ').filter(Boolean);
}

/* ================= Helpers ================= */

// Normaliza como en el modelo: sin acentos, minúsculas, espacios colapsados
function normLatin(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Divide en palabras (ya normalizadas)
function splitWords(s) {
  return normLatin(s).split(' ').filter(Boolean);
}

// Escapa caracteres especiales de regex
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parsea 'true'/'false' o boolean
function parseMaybeBool(v) {
  if (v === '' || v === undefined) return undefined;
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return undefined;
}

/**
 * Filtro para Producto:
 * - nombre: TODAS las palabras en nombreNorm (cualquier orden/posición)
 * - categoria: TODAS las palabras en categoriaNorm (cualquier orden/posición)
 * - codigoBarras: contains (i)
 * - inapam / generico: igualdad estricta si vienen definidos
 */
function construirFiltroProducto({ nombre, categoria, codigoBarras, inapam, generico }) {
  const and = [];

  // nombre: todas las palabras contra nombreNorm
  if (nombre) {
    const words = splitWords(nombre);
    for (const w of words) {
      and.push({ nombreNorm: { $regex: escapeRegex(w) } }); // ya está en lower, sin acentos
    }
  }

  // categoria: todas las palabras contra categoriaNorm
  if (categoria) {
    const words = splitWords(categoria);
    for (const w of words) {
      and.push({ categoriaNorm: { $regex: escapeRegex(w) } });
    }
  }

  // código de barras: contains
  if (codigoBarras) {
    const pat = escapeRegex(normLatin(codigoBarras));
    // como codigoBarras no está normalizado, usa 'i'
    and.push({ codigoBarras: { $regex: pat, $options: 'i' } });
  }

  const inapamBool = parseMaybeBool(inapam);
  if (inapamBool !== undefined) {
    and.push({ descuentoINAPAM: inapamBool });
  }

  const genericoBool = parseMaybeBool(generico);
  if (genericoBool !== undefined) {
    and.push({ generico: genericoBool });
  }

  return and.length ? { $and: and } : {};
}

/* ============== Obtener inventario con filtros en farmacia ============== */
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
    // 1) Filtro de Producto con "todas las palabras" usando campos *Norm
    const filtrosProducto = construirFiltroProducto({ nombre, categoria, codigoBarras, inapam, generico });

    // 2) Obtener IDs de productos que cumplen
    const productos = await Producto.find(filtrosProducto).select('_id').lean();
    const productosIds = productos.map(p => p._id);

    if (productosIds.length === 0) {
      return res.json([]); // nada que listar
    }

    // 3) Dirección de orden
    const dir = String(sortDir).toLowerCase() === 'desc' ? -1 : 1;

    // 4) Pipeline inventario + producto
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

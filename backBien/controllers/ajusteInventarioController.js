const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');
const Venta = require('../models/Venta');
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
    nombre, codigoBarras, categoria, inapam, generico, ubicacionFarmacia,
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

    // 3.1) Filtro por ubicacionFarmacia (todas las palabras)
    const andUbic = [];
    if (ubicacionFarmacia) {
      const ws = String(ubicacionFarmacia)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tolera acentos
        .toLowerCase().trim().replace(/\s+/g, ' ')
        .split(' ')
        .filter(Boolean);
      for (const w of ws) {
        andUbic.push({ ubicacionFarmacia: { $regex: w, $options: 'i' } });
      }
    }

    // 4) Pipeline inventario + producto
    const baseMatch = { farmacia: new ObjectId(farmacia), producto: { $in: productosIds } };
    const matchInventario = andUbic.length ? { $and: [baseMatch, ...andUbic] } : baseMatch;

    const pipe = [
      { $match: matchInventario },
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
            costo: '$prod.costo',
            codigoBarras: '$prod.codigoBarras',
            categoria: '$prod.categoria',
            generico: '$prod.generico',
            descuentoINAPAM: '$prod.descuentoINAPAM',
            stockMinimo: '$prod.stockMinimo',
            stockMaximo: '$prod.stockMaximo',
            ubicacion: '$prod.ubicacion'
          },
          existencia: 1,
          stockMax: 1,
          stockMin: 1,
          precioVenta: 1,
          ubicacionFarmacia: 1
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

// Actualización masiva en farmacia (existencia, stockMax, stockMin, precioVenta, ubicacionFarmacia)
// helpers seguros
const hasNum = v => typeof v === 'number' && !Number.isNaN(v);

const hasStr = v =>
  v !== undefined && v !== null && String(v).trim() !== '';

exports.actualizarInventarioMasivo = async (req, res) => {
  const farmacia = req.params.farmaciaId;
  const cambios = req.body; // [{ id, existencia?, stockMax?, stockMin?, precioVenta?, ubicacionFarmacia?, clearUbicacion? }]

  if (!farmacia || !Array.isArray(cambios)) {
    return res.status(400).json({ mensaje: "Datos inválidos para actualización masiva." });
  }

  try {
    const ops = [];

    for (const c of cambios) {
      if (!c || !c.id) continue;

      const $set = {};

      if (hasNum(c.existencia)) $set.existencia = Number(c.existencia);
      if (hasNum(c.stockMax)) $set.stockMax = Number(c.stockMax);
      if (hasNum(c.stockMin)) $set.stockMin = Number(c.stockMin);
      if (hasNum(c.precioVenta)) $set.precioVenta = Number(c.precioVenta);

      // Ubicación farmacia: solo setear si vino no-vacía
      if (hasStr(c.ubicacionFarmacia)) {
        $set.ubicacionFarmacia = String(c.ubicacionFarmacia).trim();
      } else if (c.clearUbicacion === true) {
        // si quieres permitir limpiar explícitamente:
        $set.ubicacionFarmacia = '';
      }

      if (Object.keys($set).length === 0) continue;

      ops.push({
        updateOne: {
          filter: { _id: c.id },
          update: { $set }
        }
      });
    }

    if (!ops.length) {
      return res.json({ mensaje: "No hubo cambios que aplicar", matched: 0, modified: 0 });
    }

    const resultado = await InventarioFarmacia.bulkWrite(ops, { ordered: false });
    return res.json({
      mensaje: "Ajuste masivo realizado con éxito",
      matched: resultado.matchedCount,
      modified: resultado.modifiedCount
    });
  } catch (error) {
    console.error('Error en back al actualizar masivamente:', error);
    return res.status(500).json({ mensaje: "Error al actualizar masivamente", error: error.message });
  }
};

// Actualización individual de un producto en farmacia
exports.actualizarInventarioIndividual = async (req, res) => {
  const { id } = req.params;
  const { existencia, stockMax, stockMin, precioVenta, ubicacionFarmacia, clearUbicacion } = req.body;

  try {
    const inv = await InventarioFarmacia.findById(id);
    if (!inv) return res.status(404).json({ mensaje: "Registro no encontrado" });

    if (hasNum(existencia)) inv.existencia = Number(existencia);
    if (hasNum(stockMax)) inv.stockMax = Number(stockMax);
    if (hasNum(stockMin)) inv.stockMin = Number(stockMin);
    if (hasNum(precioVenta)) inv.precioVenta = Number(precioVenta);

    if (hasStr(ubicacionFarmacia)) inv.ubicacionFarmacia = String(ubicacionFarmacia).trim();
    else if (clearUbicacion === true) inv.ubicacionFarmacia = '';

    if (inv.stockMin > inv.stockMax) {
      return res.status(400).json({ mensaje: "stockMin no puede ser mayor a stockMax" });
    }

    await inv.save();
    return res.json({ mensaje: "Inventario actualizado", inventario: inv });
  } catch (error) {
    console.error('Error en la actualización individual:', error);
    return res.status(500).json({ mensaje: "Error en la actualización individual", error: error.message });
  }
};

exports.stockPropuesto = async (req, res) => {
  try {
    const {
      farmaciaId,
      desde,
      hasta,
      diasSurtir,
      categoria,
      productoNombre
    } = req.query;

    /* ================= VALIDACIONES ================= */

    if (!farmaciaId || !desde || !hasta || !diasSurtir) {
      return res.status(400).json({ msg: 'Faltan parámetros obligatorios' });
    }

    const dias = Number(diasSurtir);
    if (!Number.isFinite(dias) || dias <= 0) {
      return res.status(400).json({ msg: 'diasSurtir inválido' });
    }

    if (!Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ msg: 'farmaciaId inválido' });
    }

    const fId = new Types.ObjectId(farmaciaId);
    const fechaIni = new Date(`${desde}T00:00:00.000Z`);
    const fechaFin = new Date(`${hasta}T23:59:59.999Z`);

    const diasPeriodo = Math.max(
      Math.ceil((fechaFin - fechaIni) / (1000 * 60 * 60 * 24)),
      1
    );

    /* ================= HELPERS ================= */

    const norm = (s) =>
      String(s ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const splitWords = (s) => norm(s).split(' ').filter(Boolean);

    const escapeRegex = (s) =>
      String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /* ================= FILTRO PRODUCTO (AND) ================= */

    const andProducto = [];

    if (categoria) {
      for (const w of splitWords(categoria)) {
        andProducto.push({
          'producto.categoriaNorm': { $regex: `^${escapeRegex(w)}` }
        });
      }
    }

    if (productoNombre) {
      for (const w of splitWords(productoNombre)) {
        andProducto.push({
          'producto.nombreNorm': { $regex: escapeRegex(w) }
        });
      }
    }

    /* ================= PIPELINE ================= */

    const pipeline = [
      {
        $match: {
          farmacia: fId,
          fecha: { $gte: fechaIni, $lte: fechaFin }
        }
      },
      { $unwind: '$productos' },

      {
        $group: {
          _id: '$productos.producto',
          cantidadVendida: { $sum: '$productos.cantidad' }
        }
      },

      // 🔗 join con productos
      {
        $lookup: {
          from: 'productos',
          localField: '_id',
          foreignField: '_id',
          as: 'producto'
        }
      },
      { $unwind: '$producto' },

      // 🔍 filtros AND por nombre/categoría
      ...(andProducto.length
        ? [{ $match: { $and: andProducto } }]
        : [])
    ];

    const ventasAgrupadas = await Venta.aggregate(pipeline);
    if (!ventasAgrupadas.length) return res.json([]);

    const productoIds = ventasAgrupadas.map(v => v._id);

    /* ================= INVENTARIO FARMACIA ================= */

    const inventarios = await InventarioFarmacia.find({
      farmacia: fId,
      producto: { $in: productoIds }
    }).populate('producto', 'nombre codigoBarras categoria');

    const mapInventario = new Map(
      inventarios.map(i => [String(i.producto._id), i])
    );

    /* ================= TABLA FINAL ================= */

    const tabla = ventasAgrupadas.map(v => {
      const inv = mapInventario.get(String(v._id));

      const productosPorDia = Number(
        (v.cantidadVendida / diasPeriodo).toFixed(2)
      );

      const stockMaxPropuesto = Math.ceil(productosPorDia * dias * 1.1);
      const stockMinPropuesto = Math.round(stockMaxPropuesto / 3);

      const existencia = inv?.existencia ?? 0;
      return {
        productoId: v._id,
        productoNombre: v.producto.nombre,
        codigoBarras: v.producto.codigoBarras || '',
        categoria: v.producto.categoria || '',
        cantidadVendida: v.cantidadVendida,
        existencia: inv?.existencia ?? 0,
        stockMinActual: inv?.stockMin ?? 0,
        stockMaxActual: inv?.stockMax ?? 0,
        productosPorDia,
        stockMinPropuesto,
        stockMaxPropuesto,
        faltanSobran: stockMaxPropuesto - existencia,
        aplicar: false
      };
    });

    res.json(tabla);

  } catch (err) {
    console.error('❌ Error stockPropuesto:', err);
    res.status(500).json({ msg: 'Error calculando stock propuesto' });
  }

  exports.aplicarCambiosStockAuto = async (req, res) => {
    try {
      const { farmaciaId, productos } = req.body;

      /* ================= VALIDACIONES ================= */

      if (!farmaciaId || !Types.ObjectId.isValid(farmaciaId)) {
        return res.status(400).json({ msg: 'farmaciaId inválido' });
      }

      if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ msg: 'No hay productos para actualizar' });
      }

      /* ================= NORMALIZAR ================= */

      const fId = new Types.ObjectId(farmaciaId);

      const operaciones = productos.map(p => {
        if (
          !p.productoId ||
          !Types.ObjectId.isValid(p.productoId)
        ) {
          return null;
        }

        const stockMin = Number(p.stockMin);
        const stockMax = Number(p.stockMax);

        if (
          !Number.isFinite(stockMin) ||
          !Number.isFinite(stockMax) ||
          stockMin < 0 ||
          stockMax < 0
        ) {
          return null;
        }

        return {
          updateOne: {
            filter: {
              farmacia: fId,
              producto: new Types.ObjectId(p.productoId)
            },
            update: {
              $set: {
                stockMin,
                stockMax
              }
            }
          }
        };
      }).filter(Boolean);

      if (!operaciones.length) {
        return res.status(400).json({ msg: 'No hay operaciones válidas' });
      }

      /* ================= BULK UPDATE ================= */

      const resultado = await InventarioFarmacia.bulkWrite(operaciones);

      res.json({
        ok: true,
        modificados: resultado.modifiedCount
      });

    } catch (err) {
      console.error('❌ Error aplicarCambiosStockAuto:', err);
      res.status(500).json({ msg: 'Error aplicando cambios de stock' });
    }
  };

};

exports.aplicarCambiosStockAuto = async (req, res) => {
  try {
    const { farmaciaId, productos } = req.body;

    /* ================= VALIDACIONES ================= */

    if (!farmaciaId || !Types.ObjectId.isValid(farmaciaId)) {
      return res.status(400).json({ msg: 'farmaciaId inválido' });
    }

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ msg: 'No hay productos para actualizar' });
    }

    /* ================= NORMALIZAR ================= */

    const fId = new Types.ObjectId(farmaciaId);

    const operaciones = productos.map(p => {
      if (
        !p.productoId ||
        !Types.ObjectId.isValid(p.productoId)
      ) {
        return null;
      }

      const stockMin = Number(p.stockMin);
      const stockMax = Number(p.stockMax);

      if (
        !Number.isFinite(stockMin) ||
        !Number.isFinite(stockMax) ||
        stockMin < 0 ||
        stockMax < 0
      ) {
        return null;
      }

      return {
        updateOne: {
          filter: {
            farmacia: fId,
            producto: new Types.ObjectId(p.productoId)
          },
          update: {
            $set: {
              stockMin,
              stockMax
            }
          }
        }
      };
    }).filter(Boolean);

    if (!operaciones.length) {
      return res.status(400).json({ msg: 'No hay operaciones válidas' });
    }

    /* ================= BULK UPDATE ================= */

    const resultado = await InventarioFarmacia.bulkWrite(operaciones);

    res.json({
      ok: true,
      modificados: resultado.modifiedCount
    });

  } catch (err) {
    console.error('❌ Error aplicarCambiosStockAuto:', err);
    res.status(500).json({ msg: 'Error aplicando cambios de stock' });
  }
};

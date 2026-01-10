// backBien\controllers\ajusteInventarioController.js
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

// --- Helpers promos ---
const parseBoolLoose = (v) => {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'yes' || t === 'si') return true;
    if (t === 'false' || t === '0' || t === 'no') return false;
  }
  if (typeof v === 'number') return v === 1;
  return false;
};

function coercePromo(input, etiqueta = 'promo') {
  // Si no viene, no se modifica
  if (input == null) return null;

  if (typeof input !== 'object') {
    throw new Error(`Formato inválido para ${etiqueta}: debe ser objeto`);
  }

  const porcentaje = Number(input.porcentaje);
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    throw new Error(`Porcentaje inválido en ${etiqueta} (0–100)`);
  }

  const inicio = new Date(input.inicio);
  const fin = new Date(input.fin);
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
    throw new Error(`Fechas inválidas en ${etiqueta} (inicio/fin requeridos)`);
  }
  if (inicio > fin) {
    throw new Error(`Rango de fechas inválido en ${etiqueta}: inicio > fin`);
  }

  const monedero = input.monedero != null ? parseBoolLoose(input.monedero) : false;

  return { porcentaje, inicio, fin, monedero };
}


/**
 * Filtro para Producto:
 * - nombre: TODAS las palabras en nombreNorm (cualquier orden/posición)
 * - categoria: TODAS las palabras en categoriaNorm (posición inicial)
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

  // categoria: SOLO prefijo en categoriaNorm (no split de palabras, no "contains")
  if (categoria) {
    // normaliza una sola vez y ancla al inicio ("^")
    const prefijo = escapeRegex(normLatin(String(categoria).trim()));
    if (prefijo) {
      and.push({ categoriaNorm: { $regex: '^' + prefijo } });
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
          ubicacionFarmacia: 1,

          // ✅ PROMOS POR FARMACIA (INVENTARIOFARMACIAS)
          promoLunes: 1,
          promoMartes: 1,
          promoMiercoles: 1,
          promoJueves: 1,
          promoViernes: 1,
          promoSabado: 1,
          promoDomingo: 1,

          promoCantidadRequerida: 1,
          inicioPromoCantidad: 1,
          finPromoCantidad: 1,

          descuentoINAPAM: 1,
          promoDeTemporada: 1
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
  const {
    existencia, stockMax, stockMin, precioVenta,
    ubicacionFarmacia, clearUbicacion,

    // ✅ Promos por día (si vienen, se validan y se actualizan)
    promoLunes, promoMartes, promoMiercoles, promoJueves,
    promoViernes, promoSabado, promoDomingo,

    // ✅ Promos por cantidad
    promoCantidadRequerida, inicioPromoCantidad, finPromoCantidad,

    // ✅ Promo de temporada
    promoDeTemporada,

    // ✅ INAPAM (default = false si no viene)
    descuentoINAPAM
  } = req.body;

  try {
    const inv = await InventarioFarmacia.findById(id);
    if (!inv) return res.status(404).json({ mensaje: "Registro no encontrado" });

    // ------- Campos numéricos base -------
    if (hasNum(existencia)) inv.existencia = Number(existencia);
    if (hasNum(stockMax)) inv.stockMax = Number(stockMax);
    if (hasNum(stockMin)) inv.stockMin = Number(stockMin);
    if (hasNum(precioVenta)) inv.precioVenta = Number(precioVenta);

    // ------- Ubicación en farmacia -------
    if (hasStr(ubicacionFarmacia)) inv.ubicacionFarmacia = String(ubicacionFarmacia).trim();
    else if (clearUbicacion === true) inv.ubicacionFarmacia = '';

    // ------- Validación stockMin/stockMax -------
    if (inv.stockMin > inv.stockMax) {
      return res.status(400).json({ mensaje: "stockMin no puede ser mayor a stockMax" });
    }

    // ------- Promos por día (si vienen, se validan y setean completas) -------
    const dias = [
      ['promoLunes', promoLunes],
      ['promoMartes', promoMartes],
      ['promoMiercoles', promoMiercoles],
      ['promoJueves', promoJueves],
      ['promoViernes', promoViernes],
      ['promoSabado', promoSabado],
      ['promoDomingo', promoDomingo],
    ];

    for (const [campo, payload] of dias) {
      if (payload !== undefined) {             // solo si vino en el body
        const val = coercePromo(payload, campo); // valida porcentaje/inicio/fin y default monedero=false
        inv[campo] = val;                      // si es null no entra; si es objeto, setea
      }
    }

    // ------- Promo de temporada -------
    if (promoDeTemporada !== undefined) {
      const val = coercePromo(promoDeTemporada, 'promoDeTemporada');
      inv.promoDeTemporada = val;
    }

    // ------- Promos por cantidad (2x1, 3x2, 4x3) -------
    const tieneCantidad = (
      promoCantidadRequerida !== undefined ||
      inicioPromoCantidad !== undefined ||
      finPromoCantidad !== undefined
    );

    if (tieneCantidad) {
      // si viene cualquiera, exigir los 3 campos correctos
      const reqNum = Number(promoCantidadRequerida);
      if (![2, 3, 4].includes(reqNum)) {
        throw new Error('promoCantidadRequerida debe ser 2, 3 o 4');
      }
      const ini = new Date(inicioPromoCantidad);
      const fin = new Date(finPromoCantidad);
      if (isNaN(ini.getTime()) || isNaN(fin.getTime())) {
        throw new Error('inicioPromoCantidad/finPromoCantidad inválidos');
      }
      if (ini > fin) {
        throw new Error('Rango inválido en promo por cantidad: inicio > fin');
      }

      inv.promoCantidadRequerida = reqNum;
      inv.inicioPromoCantidad = ini;
      inv.finPromoCantidad = fin;
    }

    inv.descuentoINAPAM = (descuentoINAPAM !== undefined)
      ? parseBoolLoose(descuentoINAPAM)
      : inv.descuentoINAPAM; // respeta valor actual


    await inv.save();

    return res.json({ mensaje: "Inventario actualizado", inventario: inv });
  } catch (error) {
    console.error('Error en la actualización individual:', error);
    return res.status(400).json({
      mensaje: error.message || "Error en la actualización individual"
    });
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


// ====== Aplicar promos + precios masivo ======
exports.actualizarPromosYPreciosMasivo = async (req, res) => {
  const { farmaciaId } = req.params;
  const { ids, set, precio } = req.body || {};

  if (!farmaciaId || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ mensaje: 'farmaciaId e ids[] son obligatorios' });
  }

  // ---- helpers locales (si ya los tienes, puedes reutilizarlos) ----
  const parseBoolLoose = (v) => {
    if (v === true || v === false) return v;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t === 'true') return true;
      if (t === 'false') return false;
    }
    return Boolean(v);
  };

  const toDate = (v) => {
    if (v == null || v === '') return null;
    const d = (v instanceof Date) ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // null => "quiero limpiar" (unset)
  // undefined => "no tocar"
  // objeto => validar completo (porcentaje/inicio/fin) + monedero default false
  const coercePromo = (payload, campo) => {
    if (payload === undefined) return { mode: 'skip' };     // no tocar
    if (payload === null) return { mode: 'unset' };         // limpiar

    if (typeof payload !== 'object') {
      throw new Error(`${campo}: formato inválido`);
    }

    const porcentaje = Number(payload.porcentaje);
    const inicio = toDate(payload.inicio);
    const fin = toDate(payload.fin);
    const monedero = payload.monedero !== undefined ? parseBoolLoose(payload.monedero) : false;

    // exigir completos
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      throw new Error(`${campo}: porcentaje inválido (0-100)`);
    }
    if (!inicio || !fin) {
      throw new Error(`${campo}: inicio/fin obligatorios`);
    }
    if (inicio > fin) {
      throw new Error(`${campo}: rango inválido (inicio > fin)`);
    }

    return { mode: 'set', value: { porcentaje, inicio, fin, monedero } };
  };

  const normalizePrecio = (p) => {
    if (!p) return null;
    const modo = String(p.modo || '').toLowerCase();
    const valor = Number(p.valor);
    const redondear = (p.redondear === 0 || p.redondear === 1 || p.redondear === 2) ? p.redondear : 2;

    if (!['pct', 'monto', 'set'].includes(modo)) {
      throw new Error('precio.modo debe ser: pct | monto | set');
    }
    if (!Number.isFinite(valor)) {
      throw new Error('precio.valor inválido');
    }
    return { modo, valor, redondear };
  };

  try {
    const fId = new ObjectId(farmaciaId);
    const objIds = ids.map(x => new ObjectId(x));

    // 1) Traer docs actuales SOLO de esa farmacia y SOLO seleccionados
    const docs = await InventarioFarmacia.find({
      farmacia: fId,
      _id: { $in: objIds }
    }).select('_id precioVenta').lean();

    if (!docs.length) {
      return res.json({ mensaje: 'No se encontraron registros para actualizar', matched: 0, modified: 0 });
    }

    // 2) Construir $set / $unset desde "set"
    const $set = {};
    const $unset = {};

    if (set && typeof set === 'object') {
      // INAPAM: solo cambia si viene definido
      if (set.descuentoINAPAM !== undefined) {
        $set.descuentoINAPAM = parseBoolLoose(set.descuentoINAPAM);
      }

      // Promos por día
      const dias = [
        ['promoLunes', set.promoLunes],
        ['promoMartes', set.promoMartes],
        ['promoMiercoles', set.promoMiercoles],
        ['promoJueves', set.promoJueves],
        ['promoViernes', set.promoViernes],
        ['promoSabado', set.promoSabado],
        ['promoDomingo', set.promoDomingo],
      ];

      for (const [campo, payload] of dias) {
        const r = coercePromo(payload, campo);
        if (r.mode === 'set') $set[campo] = r.value;
        if (r.mode === 'unset') $unset[campo] = 1;
      }

      // Temporada
      {
        const r = coercePromo(set.promoDeTemporada, 'promoDeTemporada');
        if (r.mode === 'set') $set.promoDeTemporada = r.value;
        if (r.mode === 'unset') $unset.promoDeTemporada = 1;
      }

      // Cantidad
      if (set.promoCantidad !== undefined) {
        if (set.promoCantidad === null) {
          $unset.promoCantidadRequerida = 1;
          $unset.inicioPromoCantidad = 1;
          $unset.finPromoCantidad = 1;
        } else {
          const reqNum = Number(set.promoCantidad.requerida);
          const ini = toDate(set.promoCantidad.inicio);
          const fin = toDate(set.promoCantidad.fin);

          if (![2, 3, 4].includes(reqNum)) {
            throw new Error('promoCantidad.requerida debe ser 2, 3 o 4');
          }
          if (!ini || !fin) throw new Error('promoCantidad inicio/fin obligatorios');
          if (ini > fin) throw new Error('promoCantidad rango inválido');

          $set.promoCantidadRequerida = reqNum;
          $set.inicioPromoCantidad = ini;
          $set.finPromoCantidad = fin;
        }
      }
    }

    // 3) Ajuste masivo de precio (opcional)
    const precioCfg = normalizePrecio(precio);

    // 4) Hacer bulkWrite por id (así soportas precio calculado por doc)
    const ops = [];
    for (const d of docs) {
      const update = {};
      const $setLocal = { ...$set };
      const $unsetLocal = { ...$unset };

      if (precioCfg) {
        const actual = Number(d.precioVenta || 0);
        let nuevo = actual;

        if (precioCfg.modo === 'pct') {
          nuevo = actual * (1 + (precioCfg.valor / 100));
        } else if (precioCfg.modo === 'monto') {
          nuevo = actual + precioCfg.valor;
        } else if (precioCfg.modo === 'set') {
          nuevo = precioCfg.valor;
        }

        // no permitir <=0
        if (!Number.isFinite(nuevo) || nuevo <= 0) {
          // si uno sale inválido, truena todo para evitar dejar mitad actualizada
          throw new Error(`Precio resultante inválido para ${d._id}`);
        }

        const factor = Math.pow(10, precioCfg.redondear);
        nuevo = Math.round(nuevo * factor) / factor;

        $setLocal.precioVenta = nuevo;
      }

      if (Object.keys($setLocal).length) update.$set = $setLocal;
      if (Object.keys($unsetLocal).length) update.$unset = $unsetLocal;

      if (!Object.keys(update).length) continue;

      ops.push({
        updateOne: {
          filter: { _id: d._id, farmacia: fId },
          update
        }
      });
    }

    if (!ops.length) {
      return res.json({ mensaje: 'No hubo cambios que aplicar', matched: 0, modified: 0 });
    }

    const r = await InventarioFarmacia.bulkWrite(ops, { ordered: false });

    return res.json({
      mensaje: 'Cambios masivos aplicados',
      matched: r.matchedCount,
      modified: r.modifiedCount
    });

  } catch (err) {
    console.error('[actualizarPromosYPreciosMasivo][ERROR]', err);
    return res.status(400).json({ mensaje: err.message || 'Error aplicando cambios masivos' });
  }
};

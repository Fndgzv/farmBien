// backBien/controllers/reportesPresupuestoController.js
const mongoose = require('mongoose');
const Producto = require('../models/Producto');

// ========================================
// Helper: rango [gte, lt) en UTC desde fechas locales (MX)
// fechaIni/fechaFin en 'YYYY-MM-DD' (obligatorias)
// ========================================
function dayRangeUtcFromQuery(fechaIni, fechaFin) {
  if (!fechaIni || !fechaFin) {
    throw new Error('fechaIni y fechaFin son obligatorias (formato YYYY-MM-DD).');
  }
  // Construye medianoche local y transpórtala a UTC
  const startLocal = new Date(`${fechaIni}T00:00:00`);
  const endLocal   = new Date(`${fechaFin}T00:00:00`);

  const gte = new Date(startLocal.getTime() - startLocal.getTimezoneOffset() * 60000);
  // lt es exclusivo → sumamos 1 día a fin local y convertimos a UTC
  const finMasUnoLocal = new Date(endLocal.getTime() + 24 * 60 * 60 * 1000);
  const lt  = new Date(finMasUnoLocal.getTime() - finMasUnoLocal.getTimezoneOffset() * 60000);

  return { gte, lt };
}

// ========================================
// GET /api/reportes/presupuesto
// Query:
//   fechaIni, fechaFin (YYYY-MM-DD) [OBLIGATORIAS]
//   categoria (opcional, búsqueda por palabras)
//   nombre    (opcional, búsqueda por palabras)
//   soloExistMenorQueVentas = true|false (default false)
//   sortBy = nombre|categoria|existencia|vendidos (default 'nombre')
//   sortDir = asc|desc (default 'asc')
//   page = 1, limit = 20
// ========================================
const reportePresupuesto = async (req, res) => {
  try {
    const {
      fechaIni, fechaFin,
      categoria = '',
      nombre = '',
      soloExistMenorQueVentas = 'false',
      sortBy = 'nombre',
      sortDir = 'asc',
      page = 1,
      limit = 20,
    } = req.query;

    // 1) Rango de fechas local MX → UTC half-open
    const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);

    // 2) Filtro base por producto
    const matchProd = {};
    // nombre: todas las palabras (AND)
    const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const nombreWords = norm(nombre).split(' ').filter(Boolean);
    if (nombreWords.length) {
      matchProd.$and = (matchProd.$and || []).concat(
        nombreWords.map(w => ({ nombre: { $regex: escapeRx(w), $options: 'i' } }))
      );
    }

    const categoriaWords = norm(categoria).split(' ').filter(Boolean);
    if (categoriaWords.length) {
      matchProd.$and = (matchProd.$and || []).concat(
        categoriaWords.map(w => ({ categoria: { $regex: escapeRx(w), $options: 'i' } }))
      );
    }

    // 3) Ordenamiento solicitado
    const sortMap = {
      nombre: 'nombre',
      categoria: 'categoria',
      existencia: 'existencia',
      vendidos: 'vendidosSMaxE',
    };
    const sortField = sortMap[sortBy] || 'nombre';
    const sortStage = { [sortField]: (String(sortDir).toLowerCase() === 'desc' ? -1 : 1), _id: 1 };

    // 4) Paginación
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const skipNum = (pageNum - 1) * limitNum;

    // 5) Pipeline
    const pipeline = [
      { $match: matchProd },

      // Existencia = sum(lotes.cantidad)
      {
        $addFields: {
          existencia: {
            $sum: {
              $map: {
                input: { $ifNull: ['$lotes', []] },
                as: 'l',
                in: { $ifNull: ['$$l.cantidad', 0] }
              }
            }
          }
        }
      },

      // Traer vendidos del periodo desde 'ventas'
      {
        $lookup: {
          from: 'ventas',
          let: { prodId: '$_id' },
          pipeline: [
            { $match: { fecha: { $gte: gte, $lt: lt } } },
            { $unwind: '$productos' },
            {
              $match: {
                $expr: { $eq: ['$productos.producto', '$$prodId'] }
              }
            },
            {
              $group: {
                _id: '$productos.producto',
                vendidos: { $sum: { $ifNull: ['$productos.cantidad', 0] } }
              }
            }
          ],
          as: 'ventasAgg'
        }
      },
      {
        $addFields: {
          vendidosSMaxE: {
            $ifNull: [{ $first: '$ventasAgg.vendidos' }, 0]
          }
        }
      },

      // Campos calculados: SMinE, Comprar, Costo Est.
      {
        $addFields: {
          sMinE: { $ceil: { $multiply: [0.3, '$vendidosSMaxE'] } },
          comprar: {
            $max: [
              { $subtract: ['$vendidosSMaxE', '$existencia'] },
              0
            ]
          },
          costoEst: { $multiply: [{ $ifNull: ['$costo', 0] }, { $max: [{ $subtract: ['$vendidosSMaxE', '$existencia'] }, 0] }] }
        }
      },

      // Filtro opcional: existencia < vendidosSMaxE
      ...(String(soloExistMenorQueVentas).toLowerCase() === 'true'
        ? [{ $match: { $expr: { $lt: ['$existencia', '$vendidosSMaxE'] } } }]
        : []),

      // Proyección final (las columnas que pediste)
      {
        $project: {
          _id: 1,
          grabar: { $literal: false }, // default en la tabla
          producto: '$nombre',
          codigoBarras: '$codigoBarras',
          categoria: 1,
          existencia: 1,
          stockMax: '$stockMaximo',
          stockMin: '$stockMinimo',
          vendidosSMaxE: 1,
          sMinE: 1,
          comprar: 1,
          costoEst: 1,
        }
      },

      // Orden, paginación y totalización en un $facet
      {
        $facet: {
          rows: [
            { $sort: sortStage },
            { $skip: skipNum },
            { $limit: limitNum },
          ],
          totalCosto: [
            { $group: { _id: null, sumaCostoEst: { $sum: '$costoEst' }, totalRows: { $sum: 1 } } }
          ]
        }
      }
    ];

    const [out] = await Producto.aggregate(pipeline).allowDiskUse(true);

    const rows = out?.rows ?? [];
    const totalCosto = out?.totalCosto?.[0]?.sumaCostoEst ?? 0;
    const total = out?.totalCosto?.[0]?.totalRows ?? 0;

    return res.json({
      paginacion: { page: pageNum, limit: limitNum, total },
      resumen: { totalCostoEst: totalCosto },
      rows
    });
  } catch (err) {
    console.error('reportePresupuesto error:', err);
    return res.status(400).json({ mensaje: err.message || 'Error al generar el reporte de presupuesto' });
  }
};

// ========================================
// POST /api/reportes/presupuesto/grabar
// Body: { items: [{ productoId, vendidosSMaxE }, ...] }
//   Aplica: stockMaximo = vendidosSMaxE
//           stockMinimo = ceil(0.3 * stockMaximo)
// ========================================
const grabarPresupuestoStock = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ mensaje: 'items vacío o no válido.' });
    }

    // Sanitiza entradas
    const ops = [];
    for (const it of items) {
      const id = it?.productoId;
      const vendidos = Number(it?.vendidosSMaxE ?? 0);
      if (!id || !mongoose.isValidObjectId(id)) continue;

      const stockMaximo = Math.max(0, Math.floor(vendidos)); // entero
      const stockMinimo = Math.ceil(stockMaximo * 0.3);

      ops.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: {
            $set: {
              stockMaximo,
              stockMinimo
            }
          }
        }
      });
    }

    if (!ops.length) {
      return res.status(400).json({ mensaje: 'No hay operaciones válidas para aplicar.' });
    }

    const result = await Producto.bulkWrite(ops, { ordered: false });
    return res.json({ ok: true, modified: result?.modifiedCount ?? 0, matched: result?.matchedCount ?? 0 });
  } catch (err) {
    console.error('grabarPresupuestoStock error:', err);
    return res.status(500).json({ mensaje: err.message || 'Error al grabar stock máximo/mínimo' });
  }
};

module.exports = {
  reportePresupuesto,
  grabarPresupuestoStock,
};

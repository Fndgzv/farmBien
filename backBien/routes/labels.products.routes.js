const router = require('express').Router();
const Producto = require('../models/Producto');
const { Types } = require('mongoose');

const authMiddleware = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');

/** Normaliza igual que en el modelo: sin acentos, minúsculas, espacios colapsados */
function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convierte el texto en un array de tokens normalizados (palabras) */
function tokens(s) {
  const n = norm(s);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

// GET /api/labels/products
// Query:
//   farmaciaId=... (OBLIGATORIO)
//   nombre=...         (opcional, busca en nombreNorm por todas las palabras)
//   categoria=...      (opcional, busca en categoriaNorm por todas las palabras)
//   sortBy=nombre|categoria  (opcional, default 'nombre')
//   sortDir=asc|desc          (opcional, default 'asc')
//   page, limit
router.get('/products', authMiddleware, isAdmin, async (req, res) => {
  try {
    const {
      farmaciaId,
      nombre = '',
      categoria = '',
      sortBy = 'nombre',
      sortDir = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    if (!farmaciaId) {
      return res.status(400).json({ error: 'farmaciaId es requerido' });
    }

    // -------- Filtro por palabras (todas deben aparecer) SIN ACENTOS ----------
    const andMatch = [];

    const nombreTokens = tokens(nombre);
    if (nombreTokens.length) {
      for (const t of nombreTokens) {
        andMatch.push({ nombreNorm:   { $regex: t, $options: 'i' } });
      }
    }

    const categoriaTokens = tokens(categoria);
    if (categoriaTokens.length) {
      for (const t of categoriaTokens) {
        andMatch.push({ categoriaNorm: { $regex: t, $options: 'i' } });
      }
    }

    const matchProd = andMatch.length ? { $and: andMatch } : {};

    // --------- Ordenamiento seguro ----------
    const sortField = (sortBy === 'categoria') ? 'categoria' : 'nombre';
    const sortDirNum = (String(sortDir).toLowerCase() === 'desc') ? -1 : 1;
    const sortStage = { [sortField]: sortDirNum, _id: 1 }; // _id como desempate estable

    // --------- Pipeline base (lookup a inventario de la farmacia) ------------
    const base = [
      { $match: matchProd },
      {
        $lookup: {
          from: 'inventariofarmacias',
          let: { prodId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$producto', '$$prodId'] },
                    { $eq: ['$farmacia', new Types.ObjectId(farmaciaId)] }
                  ]
                }
              }
            },
            { $project: { precioVenta: 1, existencia: 1 } }
          ],
          as: 'inv'
        }
      },
      {
        $project: {
          _id: 1,
          nombre: 1,
          codigoBarras: 1,
          categoria: 1,
          renglon1: 1,
          renglon2: 1,
          // campos norm NO se devuelven; sólo se usan para filtrar
          precioVenta: { $ifNull: [{ $arrayElemAt: ['$inv.precioVenta', 0] }, 0] },
          existencia: { $ifNull: [{ $arrayElemAt: ['$inv.existencia', 0] }, 0] }
        }
      },
      // Evita registros “vacíos” que te provocan filas inútiles
      {
        $match: {
          $and: [
            { nombre: { $ne: null } }, { nombre: { $ne: '' } },
            { codigoBarras: { $ne: null } }, { codigoBarras: { $ne: '' } }
          ]
        }
      }
    ];

    const p = Math.max(1, Number(page) || 1);
    const l = Math.max(1, Math.min(500, Number(limit) || 20));

    // -------------- facet para data + total con mismo filtro -----------------
    const [{ data = [], total = [{ count: 0 }] } = {}] = await Producto.aggregate([
      {
        $facet: {
          data: [
            ...base,
            { $sort: sortStage },
            { $skip: (p - 1) * l },
            { $limit: l }
          ],
          total: [
            ...base,
            { $count: 'count' }
          ]
        }
      }
    ]);

    const rows = data;
    const totalCount = total[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / l));

    res.json({
      rows,
      paginacion: { page: p, limit: l, total: totalCount, totalPages }
    });

  } catch (error) {
    console.error('Error en /api/labels/products:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;

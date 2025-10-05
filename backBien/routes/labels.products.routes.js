// backBien/routes/labels.products.routes.js
const router = require('express').Router();
const Producto = require('../models/Producto');
const { Types } = require('mongoose');
const authMiddleware = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');

router.get('/products', authMiddleware, isAdmin, async (req, res) => {
  try {
    const {
      farmaciaId,
      nombre = '',
      categoria = '',
      page = 1,
      limit = 20
    } = req.query;

    if (!farmaciaId) {
      return res.status(400).json({ error: 'farmaciaId es requerido' });
    }

    const matchProd = {};
    if (nombre)   matchProd.nombre   = { $regex: String(nombre),   $options: 'i' };
    if (categoria) matchProd.categoria = { $regex: String(categoria), $options: 'i' }; // 👈 parcial e insensitive

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
          precioVenta: { $ifNull: [{ $arrayElemAt: ['$inv.precioVenta', 0] }, 0] },
          existencia: { $ifNull: [{ $arrayElemAt: ['$inv.existencia', 0] }, 0] }
        }
      },
      // evitar documentos “vacíos” que dan páginas en blanco
      {
        $match: {
          $and: [
            { nombre: { $ne: null } }, { nombre: { $ne: '' } },
            { codigoBarras: { $ne: null } }, { codigoBarras: { $ne: '' } }
          ]
        }
      }
    ];

    const p = Number(page) || 1;
    const l = Number(limit) || 20;

    const [{ data = [], total = [{ count: 0 }] } = {}] = await Producto.aggregate([
      {
        $facet: {
          data: [
            ...base,
            { $sort: { nombre: 1 } },
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

// backBien/routes/labels.products.routes.js
const router = require('express').Router();
const Producto = require('../models/Producto');
const { Types } = require('mongoose');

// ✅ Middlewares correctos
const authMiddleware = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/isAdmin');

// GET /api/labels/products?farmaciaId=...&nombre=...&categoria=...&limit=50&page=1
router.get('/products', authMiddleware, isAdmin, async (req, res) => {
  
  const {
    farmaciaId,
    nombre = '',
    categoria = '',
    page = 1,
    limit = 50
  } = req.query;

  if (!farmaciaId) return res.status(400).json({ error: 'farmaciaId es requerido' });

  const matchProd = {};
  if (nombre) matchProd.nombre = { $regex: nombre, $options: 'i' };
  if (categoria) matchProd.categoria = categoria;

  const pipeline = [
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
        nombre: 1,
        codigoBarras: 1,
        renglon1: 1,
        renglon2: 1,
        categoria: 1,
        precioVenta: { $ifNull: [{ $arrayElemAt: ['$inv.precioVenta', 0] }, null] },
        existencia: { $ifNull: [{ $arrayElemAt: ['$inv.existencia', 0] }, null] }
      }
    },
    { $sort: { nombre: 1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) }
  ];

  const rows = await Producto.aggregate(pipeline);
  res.json({ rows, paginacion: { page: Number(page), limit: Number(limit) } });
});

module.exports = router;

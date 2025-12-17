// backBien/controllers/reportesRankingProductos.controller.js
const Venta = require('../models/Venta');
const mongoose = require('mongoose');

const rankingProductosPorFarmacia = async (req, res) => {
  try {
    const { desde, hasta, farmacia, clasificacion, page = 1, limit = 20 } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ msg: 'Debe enviar desde y hasta' });
    }

    const pageNum = Math.max(+page || 1, 1);
    const limitNum = Math.min(+limit || 20, 200);
    const skip = (pageNum - 1) * limitNum;

    const match = {
      fecha: {
        $gte: new Date(`${desde}T00:00:00.000`),
        $lte: new Date(`${hasta}T23:59:59.999`)
      }
    };

    if (farmacia && farmacia !== 'ALL') {
      match.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    const pipeline = [
      { $match: match },
      { $unwind: '$productos' },

      // 🧠 JOIN catálogo
      {
        $lookup: {
          from: 'productos',
          localField: 'productos.producto',
          foreignField: '_id',
          as: 'productoInfo'
        }
      },
      { $unwind: { path: '$productoInfo', preserveNullAndEmptyArrays: true } },

      // 📦 Agrupar por producto (USANDO totalRen)
      {
        $group: {
          _id: '$productos.producto',
          producto: { $first: '$productoInfo.nombre' },
          categoria: { $first: '$productos.categoria' },
          cantidadVendida: { $sum: '$productos.cantidad' },
          ventas: { $sum: '$productos.totalRen' },
          costo: {
            $sum: {
              $multiply: ['$productos.costo', '$productos.cantidad']
            }
          }
        }
      },

      // 💰 Utilidad y margen REAL
      {
        $addFields: {
          utilidad: { $subtract: ['$ventas', '$costo'] },
          margen: {
            $cond: [
              { $gt: ['$ventas', 0] },
              { $round: [{ $multiply: [{ $divide: ['$utilidad', '$ventas'] }, 100] }, 2] },
              0
            ]
          }
        }
      },

      // 🔢 Orden GLOBAL
      { $sort: { utilidad: -1 } },

      // 🧮 Ventanas Pareto
      {
        $setWindowFields: {
          sortBy: { utilidad: -1 },
          output: {
            utilidadTotal: { $sum: '$utilidad', window: { documents: ['unbounded', 'unbounded'] } },
            utilidadAcumulada: { $sum: '$utilidad', window: { documents: ['unbounded', 'current'] } }
          }
        }
      },

      // 🅰️🅱️🅲🅳
      {
        $addFields: {
          porcentajeAcumulado: {
            $multiply: [{ $divide: ['$utilidadAcumulada', '$utilidadTotal'] }, 100]
          }
        }
      },
      {
        $addFields: {
          clase: {
            $switch: {
              branches: [
                { case: { $lte: ['$porcentajeAcumulado', 70] }, then: 'A' },
                { case: { $lte: ['$porcentajeAcumulado', 90] }, then: 'B' },
                { case: { $lte: ['$porcentajeAcumulado', 98] }, then: 'C' }
              ],
              default: 'D'
            }
          }
        }
      },

      ...(clasificacion && clasificacion !== 'ALL'
        ? [{ $match: { clase: clasificacion } }]
        : []),

      {
        $project: {
          _id: 0,
          productoId: '$_id',
          producto: 1,
          categoria: 1,
          cantidadVendida: 1,
          ventas: { $round: ['$ventas', 2] },
          costo: { $round: ['$costo', 2] },
          utilidad: { $round: ['$utilidad', 2] },
          margen: {
            $cond: [
              { $gt: ['$ventas', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$utilidad', '$ventas'] },
                      100
                    ]
                  },
                  1
                ]
              },
              0
            ]
          },
          clase: 1
        }
      },

      { $skip: skip },
      { $limit: limitNum }
    ];

    res.json(await Venta.aggregate(pipeline));

  } catch (e) {
    console.error(e);
    res.status(500).json({ msg: 'Error ranking productos' });
  }
};

const rankingProductosPorFarmaciaCount = async (req, res) => {
  try {
    const { desde, hasta, farmacia, clasificacion } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        msg: 'Debe enviar desde y hasta'
      });
    }

    const fechaDesde = new Date(`${desde}T00:00:00.000`);
    const fechaHasta = new Date(`${hasta}T23:59:59.999`);

    const match = {
      fecha: { $gte: fechaDesde, $lte: fechaHasta }
    };

    if (farmacia && farmacia !== 'ALL') {
      match.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    const pipeline = [
      { $match: match },
      { $unwind: '$productos' },

      {
        $lookup: {
          from: 'productos',
          localField: 'productos.producto',
          foreignField: '_id',
          as: 'productoInfo'
        }
      },
      {
        $unwind: {
          path: '$productoInfo',
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $addFields: {
          ingresoRen: {
            $multiply: [
              { $toDouble: { $ifNull: ['$productos.precio', 0] } },
              '$productos.cantidad'
            ]
          },
          costoRen: {
            $multiply: [
              { $toDouble: { $ifNull: ['$productos.costo', 0] } },
              '$productos.cantidad'
            ]
          }

        }
      },

      {
        $group: {
          _id: '$productos.producto',
          ventas: { $sum: '$ingresoRen' },
          costo: { $sum: '$costoRen' }
        }
      },

      {
        $addFields: {
          utilidad: { $subtract: ['$ventas', '$costo'] }
        }
      },

      { $sort: { utilidad: -1 } },

      // 🔢 Ventana global
      {
        $setWindowFields: {
          sortBy: { utilidad: -1 },
          output: {
            utilidadTotalGlobal: {
              $sum: '$utilidad',
              window: { documents: ['unbounded', 'unbounded'] }
            },
            utilidadAcumulada: {
              $sum: '$utilidad',
              window: { documents: ['unbounded', 'current'] }
            }
          }
        }
      },

      {
        $addFields: {
          porcentajeAcumulado: {
            $cond: [
              { $gt: ['$utilidadTotalGlobal', 0] },
              {
                $multiply: [
                  { $divide: ['$utilidadAcumulada', '$utilidadTotalGlobal'] },
                  100
                ]
              },
              0
            ]
          }
        }
      },

      {
        $addFields: {
          clase: {
            $switch: {
              branches: [
                { case: { $lte: ['$porcentajeAcumulado', 70] }, then: 'A' },
                { case: { $lte: ['$porcentajeAcumulado', 90] }, then: 'B' },
                { case: { $lte: ['$porcentajeAcumulado', 98] }, then: 'C' }
              ],
              default: 'D'
            }
          }
        }
      },

      ...(clasificacion && clasificacion !== 'ALL'
        ? [{ $match: { clase: clasificacion } }]
        : []),

      { $count: 'total' }
    ];

    const result = await Venta.aggregate(pipeline);
    const total = result.length ? result[0].total : 0;

    res.json({ total });

  } catch (error) {
    console.error('rankingProductosPorFarmaciaCount:', error);
    res.status(500).json({
      msg: 'Error conteo ranking productos'
    });
  }
};


module.exports = {
  rankingProductosPorFarmacia,
  rankingProductosPorFarmaciaCount
};

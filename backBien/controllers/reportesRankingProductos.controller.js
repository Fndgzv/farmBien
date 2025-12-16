const Venta = require('../models/Venta');
const mongoose = require('mongoose');

const rankingProductosPorFarmacia = async (req, res) => {
  try {
    const {
      desde,
      hasta,
      farmacia,
      clasificacion,
      page = 1,
      limit = 20
    } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        msg: 'Debe enviar desde y hasta'
      });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(parseInt(limit, 10) || 20, 200);
    const skip = (pageNum - 1) * limitNum;

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

      // 🔥 JOIN catálogo productos
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

      // 💰 Cálculos por renglón
      {
        $addFields: {
          ingresoRen: {
            $multiply: ['$productos.precio', '$productos.cantidad']
          },
          costoRen: {
            $multiply: ['$productos.costo', '$productos.cantidad']
          }
        }
      },

      // 📦 Agrupar por producto
      {
        $group: {
          _id: '$productos.producto',
          producto: { $first: '$productoInfo.nombre' },
          categoria: { $first: '$productoInfo.categoria' },
          cantidadVendida: { $sum: '$productos.cantidad' },
          ventas: { $sum: '$ingresoRen' },
          costo: { $sum: '$costoRen' }
        }
      },

      // 📈 Utilidad y margen
      {
        $addFields: {
          utilidad: { $subtract: ['$ventas', '$costo'] },
          margen: {
            $cond: [
              { $gt: ['$ventas', 0] },
              { $multiply: [{ $divide: ['$utilidad', '$ventas'] }, 100] },
              0
            ]
          }
        }
      },

      // 🔢 Orden global por utilidad
      { $sort: { utilidad: -1 } },

      // 🧮 Total utilidad global
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

      // 🅰️🅱️🅲🅳 Clasificación Pareto REAL
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

      // 🔍 Filtro por clase (opcional)
      ...(clasificacion && clasificacion !== 'ALL'
        ? [{ $match: { clase: clasificacion } }]
        : []),

      // 🧾 Proyección final
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
          margen: { $round: ['$margen', 2] },
          clase: 1
        }
      },

      // 🧭 Orden definitivo
      { $sort: { clase: 1, utilidad: -1 } },

      // 📄 Paginación (AL FINAL)
      { $skip: skip },
      { $limit: limitNum }
    ];

    const data = await Venta.aggregate(pipeline);
    res.json(data);

  } catch (error) {
    console.error('rankingProductosPorFarmacia:', error);
    res.status(500).json({
      msg: 'Error ranking productos'
    });
  }
};

module.exports = {
  rankingProductosPorFarmacia
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
            $multiply: ['$productos.precio', '$productos.cantidad']
          },
          costoRen: {
            $multiply: ['$productos.costo', '$productos.cantidad']
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

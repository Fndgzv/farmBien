// backBien/controllers/reportesRankingProductosKPIs.controller.js
const Venta = require('../models/Venta');
const mongoose = require('mongoose');
const { dayRangeUtc } = require('../utils/fechas');

const rankingProductosKPIs = async (req, res) => {
  try {
    const { desde, hasta, farmacia } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ msg: 'Debe enviar desde y hasta' });
    }

    const { gte, lt } = dayRangeUtc(desde, hasta);

    const match = {
      fecha: { $gte: gte, $lt: lt }
    };

    if (farmacia && farmacia !== 'ALL') {
      match.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    const pipeline = [
      { $match: match },
      { $unwind: '$productos' },

      {
        $addFields: {
          ventaRen: {
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
          ventas: { $sum: '$ventaRen' },
          costo: { $sum: '$costoRen' }
        }
      },

      {
        $addFields: {
          utilidad: { $subtract: ['$ventas', '$costo'] }
        }
      },

      {
        $group: {
          _id: null,
          ventasTotales: { $sum: '$ventas' },
          utilidadTotal: { $sum: '$utilidad' },
          productosAnalizados: { $sum: 1 }
        }
      },

      {
        $addFields: {
          margenPromedio: {
            $cond: [
              { $gt: ['$ventasTotales', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$utilidadTotal', '$ventasTotales'] },
                      100
                    ]
                  },
                  1
                ]
              },
              0
            ]
          }
        }
      }
    ];

    const [kpis] = await Venta.aggregate(pipeline);

    res.json(kpis ?? {
      ventasTotales: 0,
      utilidadTotal: 0,
      margenPromedio: 0,
      productosAnalizados: 0
    });

  } catch (error) {
    console.error('rankingProductosKPIs:', error);
    res.status(500).json({ msg: 'Error KPIs ranking productos' });
  }
};

module.exports = { rankingProductosKPIs };

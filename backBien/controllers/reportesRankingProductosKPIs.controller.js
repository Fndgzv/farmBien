// backBien/controllers/reportesRankingProductosKPIs.controller.js
const Venta = require('../models/Venta');
const mongoose = require('mongoose');

const inicioDiaLocal = (fechaStr) => {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const finDiaLocal = (fechaStr) => {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};


const rankingProductosKPIs = async (req, res) => {
  try {
    const { desde, hasta, farmacia } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        msg: 'Debe enviar desde y hasta'
      });
    }

    const fechaDesde = inicioDiaLocal(desde);
    const fechaHasta = finDiaLocal(hasta);

    const match = {
      fecha: { $gte: fechaDesde, $lte: fechaHasta }
    };


    if (farmacia && farmacia !== 'ALL') {
      match.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    const pipeline = [
      { $match: match },
      { $unwind: '$productos' },

      // 🔹 Cálculo seguro de ventas y costo
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

      // 🔹 Agrupar por producto
      {
        $group: {
          _id: '$productos.producto',
          ventas: { $sum: '$ventaRen' },
          costo: { $sum: '$costoRen' }
        }
      },

      // 🔹 Utilidad y margen por producto
      {
        $addFields: {
          utilidad: { $subtract: ['$ventas', '$costo'] },
          margen: {
            $cond: [
              { $gt: ['$ventas', 0] },
              {
                $multiply: [
                  { $divide: ['$utilidad', '$ventas'] },
                  100
                ]
              },
              0
            ]
          }
        }
      },

      // 🔹 KPIs finales
      {
        $group: {
          _id: null,
          ventasTotales: { $sum: '$ventas' },
          costoTotal: { $sum: '$costo' },
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
    res.status(500).json({
      msg: 'Error KPIs ranking productos'
    });
  }
};

module.exports = { rankingProductosKPIs };

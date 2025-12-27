const mongoose = require('mongoose');
const Venta = require('../models/Venta');
const { dayRangeUtc } = require('../utils/fechas');

/* ================== CONSTANTES DE NEGOCIO ================== */
const TZ = 'America/Mexico_City';
const CARD_FEE = 0.04;
const CARD_NET = 1 - CARD_FEE;

/* ================== GROUP ID DINÁMICO ================== */
const buildGroupId = (escala) => {
  if (escala === 'hora') {
    return {
      year: { $year: { date: '$fecha', timezone: TZ } },
      month: { $month: { date: '$fecha', timezone: TZ } },
      day: { $dayOfMonth: { date: '$fecha', timezone: TZ } },
      hour: { $hour: { date: '$fecha', timezone: TZ } }
    };
  }

  if (escala === 'dia') {
    return {
      year: { $year: { date: '$fecha', timezone: TZ } },
      month: { $month: { date: '$fecha', timezone: TZ } },
      day: { $dayOfMonth: { date: '$fecha', timezone: TZ } }
    };
  }

  if (escala === 'mes') {
    return {
      year: { $year: { date: '$fecha', timezone: TZ } },
      month: { $month: { date: '$fecha', timezone: TZ } }
    };
  }

  // año
  return {
    year: { $year: { date: '$fecha', timezone: TZ } }
  };
};

/* ================== CONTROLADOR ================== */
const ingresosPorTiempo = async (req, res) => {
  try {
    const { desde, hasta, escala = 'dia', farmacia = 'ALL' } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ msg: 'Debe enviar desde y hasta' });
    }

    const { gte, lt } = dayRangeUtc(desde, hasta);

    const matchFarmacia =
      farmacia !== 'ALL'
        ? new mongoose.Types.ObjectId(farmacia)
        : null;

    const groupId = buildGroupId(escala);

    const pipeline = [

      /* ====================== VENTAS ====================== */
      {
        $match: {
          fecha: { $gte: gte, $lt: lt },
          ...(matchFarmacia && { farmacia: matchFarmacia })
        }
      },
      { $unwind: '$productos' },

      {
        $group: {
          _id: '$_id',
          fecha: { $first: '$fecha' },
          totalVenta: { $first: '$total' },
          vale: { $first: { $ifNull: ['$formaPago.vale', 0] } },
          tarjeta: { $first: { $ifNull: ['$formaPago.tarjeta', 0] } },
          costoVenta: {
            $sum: {
              $multiply: ['$productos.costo', '$productos.cantidad']
            }
          }
        }
      },

      {
        $project: {
          fecha: 1,
          ingreso: {
            $subtract: [
              { $subtract: ['$totalVenta', '$vale'] },
              { $multiply: ['$tarjeta', CARD_FEE] }
            ]
          },
          egreso: '$costoVenta',
          ventas: { $literal: 1 },
          pedidos: { $literal: 0 }
        }
      },

      /* ====================== PEDIDOS ====================== */
      {
        $unionWith: {
          coll: 'pedidos',
          pipeline: [
            {
              $match: {
                fechaPedido: { $gte: gte, $lt: lt },
                estado: 'entregado',
                ...(matchFarmacia && { farmacia: matchFarmacia })
              }
            },
            {
              $project: {
                fecha: '$fechaPedido',
                ingreso: {
                  $add: [
                    '$pagoACuenta.efectivo',
                    '$pagoACuenta.transferencia',
                    { $multiply: ['$pagoACuenta.tarjeta', CARD_NET] },
                    '$pagoResta.efectivo',
                    '$pagoResta.transferencia',
                    { $multiply: ['$pagoResta.tarjeta', CARD_NET] }
                  ]
                },
                egreso: '$costo',
                ventas: { $literal: 0 },
                pedidos: { $literal: 1 }
              }
            }
          ]
        }
      },

      /* ====================== DEVOLUCIONES ====================== */
      {
        $unionWith: {
          coll: 'devoluciones',
          pipeline: [
            {
              $match: {
                fecha: { $gte: gte, $lt: lt },
                ...(matchFarmacia && { farmacia: matchFarmacia })
              }
            },
            {
              $project: {
                fecha: '$fecha',
                ingreso: { $literal: 0 },
                egreso: '$totalDevuelto',
                ventas: { $literal: 0 },
                pedidos: { $literal: 0 }
              }
            }
          ]
        }
      },

      /* ====================== CANCELACIONES ====================== */
      {
        $unionWith: {
          coll: 'cancelaciones',
          pipeline: [
            {
              $match: {
                fechaCancelacion: { $gte: gte, $lt: lt },
                ...(matchFarmacia && { farmacia: matchFarmacia })
              }
            },
            {
              $project: {
                fecha: '$fechaCancelacion',
                ingreso: { $literal: 0 },
                egreso: '$totalDevuelto',
                ventas: { $literal: 0 },
                pedidos: { $literal: 0 }
              }
            }
          ]
        }
      },

      /* ====================== AGRUPACIÓN FINAL ====================== */
      {
        $group: {
          _id: groupId,
          ingresos: { $sum: '$ingreso' },
          egresos: { $sum: '$egreso' },
          ventas: { $sum: '$ventas' },
          pedidos: { $sum: '$pedidos' },
          fecha: { $min: '$fecha' }
        }
      },

      {
        $project: {
          _id: 0,
          periodo: {
            $dateToString: {
              date: '$fecha',
              timezone: TZ,
              format: escala === 'hora'
                ? '%Y-%m-%d %H:00'
                : escala === 'dia'
                  ? '%Y-%m-%d'
                  : escala === 'mes'
                    ? '%Y-%m'
                    : '%Y'
            }
          },
          ingresos: { $round: ['$ingresos', 2] },
          egresos: { $round: ['$egresos', 2] },
          utilidad: {
            $round: [{ $subtract: ['$ingresos', '$egresos'] }, 2]
          },
          ventas: 1,
          pedidos: 1
        }
      },

      { $sort: { periodo: 1 } }
    ];

    const data = await Venta.aggregate(pipeline);
    res.json(data);

  } catch (err) {
    console.error('Error ingresosPorTiempo:', err);
    res.status(500).json({ msg: 'Error al generar reporte financiero' });
  }
};

module.exports = {
  ingresosPorTiempo
};

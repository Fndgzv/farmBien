// backBien/controllers/reportesVentas.controller.js
const Venta = require('../models/Venta');
const mongoose = require('mongoose');
const { dayRangeUtc } = require('../utils/fechas');

const ventasPorTiempo = async (req, res) => {
  try {
    const { desde, hasta, escala = 'dia', farmacia = 'ALL' } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ msg: 'Debe enviar desde y hasta' });
    }

    const tz = 'America/Mexico_City';
    const { gte, lt } = dayRangeUtc(desde, hasta);

    const match = {
      fecha: { $gte: gte, $lt: lt }
    };

    if (farmacia !== 'ALL') {
      match.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    let groupId = {};
    let projectPeriodo = {};

    if (escala === 'hora') {
      groupId = {
        year: { $year: { date: '$fecha', timezone: tz } },
        month: { $month: { date: '$fecha', timezone: tz } },
        day: { $dayOfMonth: { date: '$fecha', timezone: tz } },
        hour: { $hour: { date: '$fecha', timezone: tz } }
      };

      projectPeriodo = {
        $dateToString: {
          date: '$fecha',
          format: '%Y-%m-%d %H:00',
          timezone: tz
        }
      };
    }

    if (escala === 'dia') {
      groupId = {
        year: { $year: { date: '$fecha', timezone: tz } },
        month: { $month: { date: '$fecha', timezone: tz } },
        day: { $dayOfMonth: { date: '$fecha', timezone: tz } }
      };

      projectPeriodo = {
        $dateToString: {
          date: '$fecha',
          format: '%Y-%m-%d',
          timezone: tz
        }
      };
    }

    const data = await Venta.aggregate([
      { $match: match },
      { $unwind: '$productos' },

      {
        $addFields: {
          costoRen: {
            $multiply: ['$productos.costo', '$productos.cantidad']
          }
        }
      },

      {
        $group: {
          _id: '$_id',
          fecha: { $first: '$fecha' },
          folio: { $first: '$folio' },
          totalVenta: { $first: '$total' },
          vale: { $first: { $ifNull: ['$formaPago.vale', 0] } },
          tarjeta: { $first: { $ifNull: ['$formaPago.tarjeta', 0] } },
          costoVenta: { $sum: '$costoRen' }
        }
      },

      {
        $addFields: {
          ingresoRealVenta: { $subtract: ['$totalVenta', '$vale'] },
          comisionTarjeta: { $multiply: ['$tarjeta', 0.04] }
        }
      },

      {
        $group: {
          _id: groupId,
          totalVentas: { $sum: '$ingresoRealVenta' },
          totalCosto: { $sum: '$costoVenta' },
          totalComisionTarjeta: { $sum: '$comisionTarjeta' },
          ventas: { $addToSet: '$folio' }
        }
      },

      {
        $project: {
          _id: 0,
          periodo: projectPeriodo,
          totalVentas: { $round: ['$totalVentas', 2] },
          utilidad: {
            $round: [
              {
                $subtract: [
                  { $subtract: ['$totalVentas', '$totalCosto'] },
                  '$totalComisionTarjeta'
                ]
              },
              2
            ]
          },
          numeroVentas: { $size: '$ventas' }
        }
      },

      { $sort: { periodo: 1 } }
    ]);

    res.json(data);

  } catch (err) {
    console.error('Error ventasPorTiempo:', err);
    res.status(500).json({ msg: 'Error al generar reporte' });
  }
};

module.exports = { ventasPorTiempo };

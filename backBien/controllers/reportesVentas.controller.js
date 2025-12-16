const Venta = require('../models/Venta');
const mongoose = require('mongoose');

const ventasPorTiempo = async (req, res) => {
  try {
    const { desde, hasta, escala = 'dia', farmacia = 'ALL' } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({ msg: 'Debe enviar desde y hasta' });
    }

    const tz = 'America/Mexico_City';
    const fechaDesde = new Date(`${desde}T00:00:00.000`);
    const fechaHasta = new Date(`${hasta}T23:59:59.999`);

    const match = {
      fecha: { $gte: fechaDesde, $lte: fechaHasta }
    };

    if (farmacia !== 'ALL') {
      match.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    // =============================
    // GROUP ID + PERIODO
    // =============================
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
        $concat: [
          { $toString: '$_id.year' }, '-',
          {
            $cond: [
              { $lt: ['$_id.month', 10] },
              { $concat: ['0', { $toString: '$_id.month' }] },
              { $toString: '$_id.month' }
            ]
          }, '-',
          {
            $cond: [
              { $lt: ['$_id.day', 10] },
              { $concat: ['0', { $toString: '$_id.day' }] },
              { $toString: '$_id.day' }
            ]
          },
          ' ',
          {
            $cond: [
              { $lt: ['$_id.hour', 10] },
              { $concat: ['0', { $toString: '$_id.hour' }] },
              { $toString: '$_id.hour' }
            ]
          },
          ':00'
        ]
      };
    }

    if (escala === 'dia') {
      groupId = {
        year: { $year: { date: '$fecha', timezone: tz } },
        month: { $month: { date: '$fecha', timezone: tz } },
        day: { $dayOfMonth: { date: '$fecha', timezone: tz } }
      };

      projectPeriodo = {
        $concat: [
          { $toString: '$_id.year' }, '-',
          {
            $cond: [
              { $lt: ['$_id.month', 10] },
              { $concat: ['0', { $toString: '$_id.month' }] },
              { $toString: '$_id.month' }
            ]
          }, '-',
          {
            $cond: [
              { $lt: ['$_id.day', 10] },
              { $concat: ['0', { $toString: '$_id.day' }] },
              { $toString: '$_id.day' }
            ]
          }
        ]
      };
    }

    const data = await Venta.aggregate([
      { $match: match },

      // =============================
      // 1️⃣ UNA FILA POR PRODUCTO
      // =============================
      { $unwind: '$productos' },

      {
        $addFields: {
          costoRen: {
            $multiply: ['$productos.costo', '$productos.cantidad']
          }
        }
      },

      // =============================
      // 2️⃣ UNA FILA POR VENTA
      // =============================
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
          ingresoRealVenta: {
            $subtract: ['$totalVenta', '$vale']
          },
          comisionTarjeta: {
            $multiply: ['$tarjeta', 0.04]
          }
        }
      },

      // =============================
      // 3️⃣ AGRUPAR POR PERIODO
      // =============================
      {
        $group: {
          _id: groupId,

          totalVentas: { $sum: '$ingresoRealVenta' },
          totalCosto: { $sum: '$costoVenta' },
          totalComisionTarjeta: { $sum: '$comisionTarjeta' },

          ventas: { $addToSet: '$folio' }
        }
      },

      // =============================
      // 4️⃣ PROYECCIÓN FINAL
      // =============================
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

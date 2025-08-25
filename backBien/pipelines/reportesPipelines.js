// backBien/pipelines/reportesPipelines.js
const { Types } = require('mongoose');

// Helpers
const toObjectIdOrNull = (hex) =>
  (!hex ? null : (Types.ObjectId.isValid(hex) ? new Types.ObjectId(hex) : null));

const toObjectIdOrThrow = (hex, field = 'id') => {
  if (!Types.ObjectId.isValid(hex)) throw new Error(`${field} inválido`);
  return new Types.ObjectId(hex);
};

/**
 * Resumen por producto (todas las ventas en el rango)
 * Base: colección "ventas"
 */
function pipelineVentasPorFarmacia({ farmaciaId, fechaIni, fechaFin }) {
  const match = { fecha: { $gte: fechaIni, $lt: fechaFin } }; // ⬅️ half-open
  const farmId = toObjectIdOrNull(farmaciaId);
  if (farmId) match.farmacia = farmId;

  return [
    { $match: match },
    { $unwind: '$productos' },
    {
      $group: {
        _id: '$productos.producto',
        cantidadVendida: { $sum: '$productos.cantidad' },
        importeVendido: { $sum: '$productos.totalRen' },
        costoTotal: {
          $sum: {
            $multiply: [
              { $ifNull: ['$productos.costo', 0] },
              '$productos.cantidad'
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'productos',
        localField: '_id',
        foreignField: '_id',
        as: 'prod'
      }
    },
    { $unwind: '$prod' },
    {
      $addFields: {
        utilidad: { $subtract: ['$importeVendido', '$costoTotal'] },
        margenPct: {
          $cond: [
            { $gt: ['$importeVendido', 0] },
            {
              $multiply: [
                { $divide: [{ $subtract: ['$importeVendido', '$costoTotal'] }, '$importeVendido'] },
                100
              ]
            },
            null
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        productoId: '$_id',
        codigoBarras: '$prod.codigoBarras',
        nombre: '$prod.nombre',
        unidad: '$prod.unidad',
        categoria: '$prod.categoria',
        cantidadVendida: 1,
        importeVendido: 1,
        costoTotal: 1,
        utilidad: 1,
        margenPct: 1
      }
    },
    { $sort: { utilidad: -1 } }
  ];
}

/**
 * Detalle de ventas de un producto en el rango (por tickets/renglones)
 */
function pipelineVentasProductoDetalle({ productoId, farmaciaId, fechaIni, fechaFin }) {
  const prodId = toObjectIdOrThrow(productoId, 'productoId');

  const match = { fecha: { $gte: fechaIni, $lt: fechaFin } }; // ⬅️ half-open
  const farmId = toObjectIdOrNull(farmaciaId);
  if (farmId) match.farmacia = farmId;

  return [
    { $match: match },
    { $unwind: '$productos' },
    { $match: { 'productos.producto': prodId } },

    {
      $facet: {
        items: [
          { $lookup: { from: 'productos', localField: 'productos.producto', foreignField: '_id', as: 'prod' } },
          { $unwind: '$prod' },
          { $lookup: { from: 'farmacias', localField: 'farmacia', foreignField: '_id', as: 'farm' } },
          { $unwind: '$farm' },
          { $lookup: { from: 'usuarios', localField: 'usuario', foreignField: '_id', as: 'us' } },
          { $unwind: '$us' },

          {
            $addFields: {
              costoUnitario: { $ifNull: ['$productos.costo', 0] },
              costoTotal: {
                $multiply: [
                  { $ifNull: ['$productos.costo', 0] },
                  '$productos.cantidad'
                ]
              },
              utilidadRenglon: {
                $subtract: [
                  '$productos.totalRen',
                  {
                    $multiply: [
                      { $ifNull: ['$productos.costo', 0] },
                      '$productos.cantidad'
                    ]
                  }
                ]
              }
            }
          },
          {
            $addFields: {
              margenRenglonPct: {
                $cond: [
                  { $gt: ['$productos.totalRen', 0] },
                  {
                    $multiply: [
                      { $divide: ['$utilidadRenglon', '$productos.totalRen'] },
                      100
                    ]
                  },
                  null
                ]
              }
            }
          },
          {
            $project: {
              _id: 0,
              fecha: 1,
              folio: '$folio',
              farmaciaNombre: '$farm.nombre',
              usuarioNombre: '$us.nombre',
              codigoBarras: '$prod.codigoBarras',
              productoNombre: '$prod.nombre',
              cantidadVendida: '$productos.cantidad',
              importeTotal: '$productos.totalRen',
              costoUnitario: 1,
              costoTotal: 1,
              utilidad: '$utilidadRenglon',
              margenRenglonPct: 1
            }
          },
          { $sort: { fecha: 1, folio: 1 } }
        ],
        resumen: [
          {
            $group: {
              _id: null,
              totalCantidad: { $sum: '$productos.cantidad' },
              totalImporte: { $sum: '$productos.totalRen' },
              totalCosto: {
                $sum: {
                  $multiply: [
                    { $ifNull: ['$productos.costo', 0] },
                    '$productos.cantidad'
                  ]
                }
              }
            }
          },
          {
            $addFields: {
              totalUtilidad: { $subtract: ['$totalImporte', '$totalCosto'] },
              margenPct: {
                $cond: [
                  { $gt: ['$totalImporte', 0] },
                  {
                    $round: [
                      {
                        $multiply: [
                          { $divide: ['$totalUtilidad', '$totalImporte'] },
                          100
                        ]
                      },
                      2
                    ]
                  },
                  null
                ]
              }
            }
          },
          { $project: { _id: 0, totalCantidad: 1, totalImporte: 1, totalCosto: 1, totalUtilidad: 1, margenPct: 1 } }
        ]
      }
    }
  ];
}

module.exports = {
  pipelineVentasPorFarmacia,
  pipelineVentasProductoDetalle
};

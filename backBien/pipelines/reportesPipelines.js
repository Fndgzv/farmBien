// backBien/pipelines/reportesPipelines.js
const { Types } = require('mongoose');

// Helpers seguros
const toObjectIdOrNull = (hex) => (!hex ? null : (Types.ObjectId.isValid(hex) ? new Types.ObjectId(hex) : null));
const toObjectIdOrThrow = (hex, field = 'id') => {
  if (!Types.ObjectId.isValid(hex)) throw new Error(`${field} inválido`);
  return new Types.ObjectId(hex);
};


/**
 * Ventas por farmacia y rango de fechas.
 * Base: colección "ventas"
 */
function pipelineVentasPorFarmacia({ farmaciaId, fechaIni, fechaFin }) {
  const match = { fecha: { $gte: fechaIni, $lte: fechaFin } };
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
      $project: {
        _id: 0,
        productoId: '$_id',
        codigoBarras: '$prod.codigoBarras',
        nombre: '$prod.nombre',
        unidad: '$prod.unidad',
        categoria: '$prod.categoria',
        cantidadVendida: 1,
        importeVendido: 1
      }
    },
    { $sort: { importeVendido: -1 } }
  ];
}

function pipelineVentasProductoDetalle({ productoId, farmaciaId, fechaIni, fechaFin }) {
  const prodId = toObjectIdOrThrow(productoId, 'productoId');

  const match = { fecha: { $gte: fechaIni, $lte: fechaFin } };
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
            $project: {
              _id: 0,
              fecha: 1,
              folio: '$folio',
              farmaciaNombre: '$farm.nombre',
              usuarioNombre: '$us.nombre',
              codigoBarras: '$prod.codigoBarras',
              productoNombre: '$prod.nombre',
              cantidadVendida: '$productos.cantidad',
              importeTotal: '$productos.totalRen'
            }
          },
          { $sort: { fecha: 1, folio: 1 } }
        ],
        resumen: [
          {
            $group: {
              _id: null,
              totalCantidad: { $sum: '$productos.cantidad' },
              totalImporte: { $sum: '$productos.totalRen' }
            }
          },
          { $project: { _id: 0, totalCantidad: 1, totalImporte: 1 } }
        ]
      }
    }
  ];
}


module.exports = {
  pipelineVentasPorFarmacia,
  pipelineVentasProductoDetalle
};

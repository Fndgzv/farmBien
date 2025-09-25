// controllers/reportesComprasVentas.controller.js
const mongoose = require('mongoose');
const Compra = require('../models/Compra');
const { dayRangeUtcFromQuery } = require('../utils/fechas');

const toId = v => { try { return v ? new mongoose.Types.ObjectId(String(v)) : null; } catch { return null; } };

exports.reporteComprasConVentas = async (req, res) => {
  try {
    const {
      fechaIni, fechaFin,
      productoId, proveedorId,
      codigoBarras, lote,
      sortBy = 'caducidad',
      sortDir = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    const { gte, lt } = dayRangeUtcFromQuery(fechaIni, fechaFin);
    const _page  = Math.max(parseInt(page)  || 1, 1);
    const _limit = Math.min(Math.max(parseInt(limit) || 20, 1), 500);
    const _skip  = (_page - 1) * _limit;

    // 🔹 Map de ordenamiento (SIN costoTotal)
    const sortMap = {
      fecCompra  : { fecCompra  : sortDir === 'asc' ? 1 : -1 },
      proveedor  : { proveedor  : sortDir === 'asc' ? 1 : -1 },
      producto   : { producto   : sortDir === 'asc' ? 1 : -1 },
      cb         : { cb         : sortDir === 'asc' ? 1 : -1 },
      lote       : { lote       : sortDir === 'asc' ? 1 : -1 },
      existencia : { existencia : sortDir === 'asc' ? 1 : -1 },
      caducidad  : { caducidad  : sortDir === 'asc' ? 1 : -1 },
      costo      : { costo      : sortDir === 'asc' ? 1 : -1 },
      cantidad   : { cantidad   : sortDir === 'asc' ? 1 : -1 },
    };
    const sortStage = sortMap[sortBy] || sortMap.caducidad;

    const pipeline = [];

    // 1) Filtro por fecha / proveedor
    const matchCompra = { fecha: { $gte: gte, $lt: lt } };
    const provId = toId(proveedorId);
    if (provId) matchCompra.proveedor = provId;
    pipeline.push({ $match: matchCompra });

    // 2) Explotar productos
    pipeline.push({ $unwind: '$productos' });

    // 3) Filtros opcionales
    const prodId = toId(productoId);
    if (prodId) pipeline.push({ $match: { 'productos.producto': prodId } });
    if (lote)    pipeline.push({ $match: { 'productos.lote': { $regex: String(lote), $options: 'i' } } });

    // 4) Join producto
    pipeline.push(
      {
        $lookup: {
          from: 'productos',
          localField: 'productos.producto',
          foreignField: '_id',
          as: 'prod'
        }
      },
      { $unwind: '$prod' }
    );

    // 5) Filtro opcional por código de barras
    if (codigoBarras) {
      pipeline.push({ $match: { 'prod.codigoBarras': { $regex: String(codigoBarras), $options: 'i' } } });
    }

    // 6) Join proveedor (colección correcta)
    pipeline.push(
      {
        $lookup: {
          from: 'proveedores',
          localField: 'proveedor',
          foreignField: '_id',
          as: 'prov'
        }
      },
      { $unwind: { path: '$prov', preserveNullAndEmptyArrays: true } }
    );

    // 7) Lote del producto (case-insensitive)
    pipeline.push({
      $addFields: {
        _loteObj: {
          $let: {
            vars: { lc: { $toLower: '$productos.lote' } },
            in: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: '$prod.lotes',
                    as: 'l',
                    cond: { $eq: [ { $toLower: '$$l.lote' }, '$$lc' ] }
                  }
                },
                0
              ]
            }
          }
        }
      }
    });

    // 8) Ventas por farmacia (del PRODUCTO), en el rango
    pipeline.push({
      $lookup: {
        from: 'ventas',
        let: { pId: '$productos.producto' },
        pipeline: [
          { $match: { $expr: { $and: [ { $gte: ['$fecha', gte] }, { $lt: ['$fecha', lt] } ] } } },
          { $unwind: '$productos' },
          { $match: { $expr: { $eq: ['$productos.producto', '$$pId'] } } },
          { $group: { _id: '$farmacia', vendidos: { $sum: '$productos.cantidad' } } },
          {
            $lookup: {
              from: 'farmacias',
              localField: '_id',
              foreignField: '_id',
              as: 'farm'
            }
          },
          { $unwind: { path: '$farm', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 0, farmaciaId: '$farm._id', farmacia: '$farm.nombre', vendidos: 1 } }
        ],
        as: 'ventasPorFarmacia'
      }
    });

    // 9) Proyección final (SIN costoTotal)
    pipeline.push({
      $project: {
        fecCompra : '$fecha',
        proveedor : '$prov.nombre',
        producto  : '$prod.nombre',
        cb        : '$prod.codigoBarras',
        lote      : '$productos.lote',
        existencia: { $ifNull: ['$_loteObj.cantidad', 0] },
        caducidad : { $ifNull: ['$_loteObj.fechaCaducidad', '$productos.fechaCaducidad'] },
        costo     : '$productos.costoUnitario',
        cantidad  : '$productos.cantidad',
        ventasPorFarmacia: 1
      }
    });

    // 10) Orden
    pipeline.push({ $sort: sortStage });

    // 11) Paginación + resumenes
    pipeline.push(
      {
        $facet: {
          rows: [
            { $skip: _skip },
            { $limit: _limit }
          ],
          totalDocs: [ { $count: 'count' } ],

          // sumas simples a nivel de renglón
          resumenSumas: [
            { $group: {
                _id: null,
                sumCantidad: { $sum: '$cantidad' },
                sumExistencia: { $sum: '$existencia' }
            } }
          ],

          // promedio global de vendidos por farmacia (se promedian TODAS las filas de ventasPorFarmacia)
          resumenVendidos: [
            { $unwind: { path: '$ventasPorFarmacia', preserveNullAndEmptyArrays: false } },
            { $group: { _id: null, avgVendidosFarmacia: { $avg: '$ventasPorFarmacia.vendidos' } } }
          ]
        }
      },
      {
        $project: {
          rows: 1,
          total: { $ifNull: [ { $arrayElemAt: ['$totalDocs.count', 0] }, 0 ] },
          sumCantidad: { $ifNull: [ { $arrayElemAt: ['$resumenSumas.sumCantidad', 0] }, 0 ] },
          sumExistencia: { $ifNull: [ { $arrayElemAt: ['$resumenSumas.sumExistencia', 0] }, 0 ] },
          avgVendidosFarmacia: { $ifNull: [ { $arrayElemAt: ['$resumenVendidos.avgVendidosFarmacia', 0] }, 0 ] }
        }
      }
    );

    const [out] = await Compra.aggregate(pipeline).allowDiskUse(true);

    res.json({
      nota:
        '#prod. vendidos corresponde a la SUMA vendida por farmacia del PRODUCTO dentro del rango seleccionado. ' +
        'No se asume asignación al lote mostrado en el renglón.',
      filtros: { fechaIni, fechaFin, productoId, proveedorId, codigoBarras, lote },
      paginacion: { page: _page, limit: _limit, total: out?.total ?? 0 },
      resumen: {
        sumCantidad: out?.sumCantidad ?? 0,
        sumExistencia: out?.sumExistencia ?? 0,
        avgVendidosFarmacia: out?.avgVendidosFarmacia ?? 0
      },
      rows: out?.rows ?? []
    });
  } catch (err) {
    console.error('[reporteComprasConVentas][ERROR]', err);
    res.status(500).json({ mensaje: 'Error al generar reporte' });
  }
};

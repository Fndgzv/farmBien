// corteController.js

const CorteCaja = require('../models/CorteCaja');
const Venta = require('../models/Venta');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');

const { DateTime } = require('luxon');
const Usuario = require('../models/Usuario');
const mongoose = require('mongoose');

const { Types } = require('mongoose');

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

const crearCorte = async (req, res) => {
  const usuario = req.usuario;
  const { efectivoInicial, saldoInicialRecargas, farmaciaId } = req.body;

  const efectivo = Number(efectivoInicial);
  const saldoRecargas = Number(saldoInicialRecargas);
  if (!farmaciaId) {
    return res.status(400).json({ mensaje: 'Falta el ID de la farmacia.' });
  }
  if (!Number.isFinite(efectivo) || efectivo <= 0) {
    return res.status(400).json({ mensaje: 'El efectivo inicial debe ser mayor a 0.' });
  }
  if (!Number.isFinite(saldoRecargas) || saldoRecargas < 0) {
    return res.status(400).json({ mensaje: 'El saldo inicial de recargas debe ser 0 o mayor.' });
  }

  try {
    // ✅ Evitar cortes duplicados (uno activo por usuario/farmacia)
    const yaActivo = await CorteCaja.findOne({
      usuario: usuario._id,
      farmacia: farmaciaId,
      $or: [{ fechaFin: { $exists: false } }, { fechaFin: null }]
    });

    if (yaActivo) {
      return res.status(409).json({
        mensaje: 'Ya tienes un turno de caja activo en esta farmacia.',
        corte: yaActivo
      });
    }

    const corte = new CorteCaja({
      fechaInicio: new Date(),
      usuario: usuario._id,
      farmacia: farmaciaId,
      efectivoInicial: efectivo,
      saldoInicialRecargas: saldoRecargas
    });

    await corte.save();
    res.status(201).json({ mensaje: 'Turno iniciado', corte });

  } catch (err) {
    console.error('Error al iniciar turno:', err);
    res.status(500).json({ mensaje: 'Error al iniciar turno' });
  }

};

const finalizarCorte = async (req, res) => {
  const corteId = req.params.corteId;
  const grabar = req.params.grabar === 'true';

  const ahora = new Date();

  try {
    const corte = await CorteCaja.findById(corteId);
    if (!corte) return res.status(404).json({ mensaje: 'Corte no encontrado' });

    const usuarioId = corte.usuario.toString(); // importante para filtrar

    // 🔸 Ventas por usuario y farmacia en el periodo del corte
    const ventas = await Venta.find({
      farmacia: corte.farmacia,
      usuario: usuarioId,
      fecha: { $gte: corte.fechaInicio, $lte: ahora }
    })
      .populate('productos.producto', 'categoria');

    const ventasEfectivo = ventas.reduce((acc, v) => acc + (v.formaPago.efectivo || 0), 0);
    const ventasTarjeta = ventas.reduce((acc, v) => acc + (v.formaPago.tarjeta || 0), 0);
    const ventasTransferencia = ventas.reduce((acc, v) => acc + (v.formaPago.transferencia || 0), 0);
    const ventasVale = ventas.reduce((acc, v) => acc + (v.formaPago.vale || 0), 0);
    const abonosMonedero = ventas.reduce((acc, v) => acc + (v.totalMonederoCliente || 0), 0);
    const totalRecargas = ventas
      .flatMap(v => v.productos)                          // aplana todos los detalles
      .filter(d => d.producto?.categoria === 'Recargas')  // sólo recargas
      .reduce((sum, d) => sum + d.totalRen, 0);

    // 🔸 Devoluciones por usuario y farmacia en el periodo
    const devoluciones = await Devolucion.find({
      farmacia: corte.farmacia,
      usuario: usuarioId,
      fecha: { $gte: corte.fechaInicio, $lte: ahora }
    });

    // devoluciones en Vale
    const devolucionesVale = devoluciones.reduce((acc, p) => acc + (p.valeDevuelto || 0), 0);
    const devolucionesEfectivo = devoluciones.reduce((acc, p) => acc + (p.dineroDevuelto || 0), 0);

    // 🔸 Anticipos de pedidos: usuarioPidio y fechaPedido
    const anticipos = await Pedido.find({
      farmacia: corte.farmacia,
      usuarioPidio: usuarioId,
      fechaPedido: { $gte: corte.fechaInicio, $lte: ahora },
    });

    const anticiposEfectivo = anticipos.reduce((acc, p) => acc + (p.pagoACuenta?.efectivo || 0), 0);
    const anticiposTarjeta = anticipos.reduce((acc, p) => acc + (p.pagoACuenta?.tarjeta || 0), 0);
    const anticiposTransferencia = anticipos.reduce((acc, p) => acc + (p.pagoACuenta?.transferencia || 0), 0);
    const anticiposVale = anticipos.reduce((acc, p) => acc + (p.pagoACuenta?.vale || 0), 0);

    // 🔸 Entregas de pedidos: usuarioSurtio y fechaEntrega
    const entregas = await Pedido.find({
      farmacia: corte.farmacia,
      usuarioSurtio: usuarioId,
      fechaEntrega: { $gte: corte.fechaInicio, $lte: ahora },
      estado: 'entregado'
    });
    const restoEfectivo = entregas.reduce((acc, p) => acc + (p.pagoResta?.efectivo || 0), 0);
    const restoTarjeta = entregas.reduce((acc, p) => acc + (p.pagoResta?.tarjeta || 0), 0);
    const restoTransferencia = entregas.reduce((acc, p) => acc + (p.pagoResta?.transferencia || 0), 0);
    const restoVale = entregas.reduce((acc, p) => acc + (p.pagoResta?.vale || 0), 0);

    const cancelaciones = await Cancelacion.find({
      farmacia: corte.farmacia,
      usuario: usuarioId,
      fechaCancelacion: { $gte: corte.fechaInicio, $lte: ahora }
    });

    const cancelacionesVale = cancelaciones.reduce((acc, p) => acc + (p.valeDevuelto || 0), 0);
    const cancelacionesEfectivo = cancelaciones.reduce((acc, p) => acc + (p.dineroDevuelto || 0), 0);

    // 🔸 Sumar totales de pedidos anticipo + resto
    const pedidosEfectivo = anticiposEfectivo + restoEfectivo;
    const pedidosTarjeta = anticiposTarjeta + restoTarjeta;
    const pedidosTransferencia = anticiposTransferencia + restoTransferencia;
    const pedidosVale = anticiposVale + restoVale;

    // Grandes totales
    const totalTarjeta = ventasTarjeta + pedidosTarjeta;
    const totalTransferencia = ventasTransferencia + pedidosTransferencia;
    const totalVale = ventasVale - devolucionesVale + pedidosVale - cancelacionesVale;
    const totalEfectivoEnCaja = corte.efectivoInicial + ventasEfectivo - devolucionesEfectivo + pedidosEfectivo - cancelacionesEfectivo;

    // 🔸 Guardar en corte
    corte.fechaFin = ahora;

    corte.ventasEfectivo = ventasEfectivo;
    corte.ventasTarjeta = ventasTarjeta;
    corte.ventasTransferencia = ventasTransferencia;
    corte.ventasVale = ventasVale;
    corte.devolucionesVale = devolucionesVale;
    corte.devolucionesEfectivo = devolucionesEfectivo;

    corte.pedidosEfectivo = pedidosEfectivo;
    corte.pedidosTarjeta = pedidosTarjeta;
    corte.pedidosTransferencia = pedidosTransferencia;
    corte.pedidosVale = pedidosVale;
    corte.pedidosCanceladosEfectivo = cancelacionesEfectivo;
    corte.pedidosCanceladosVale = cancelacionesVale;

    corte.totalEfectivoEnCaja = totalEfectivoEnCaja;
    corte.totalTarjeta = totalTarjeta;
    corte.totalTransferencia = totalTransferencia;
    corte.totalVale = totalVale;
    corte.totalRecargas = totalRecargas;
    corte.abonosMonederos = abonosMonedero;

    corte.ventasRealizadas = ventas.length;
    corte.devolucionesRealizadas = devoluciones.length;
    corte.pedidosLevantados = anticipos.length;
    corte.pedidosEntregados = entregas.length;
    corte.pedidosCancelados = cancelaciones.length;

    if (grabar) await corte.save();

    res.status(200).json({ mensaje: 'Corte finalizado', corte });
  } catch (error) {
    console.error('Error al finalizar corte:', error);
    res.status(500).json({ mensaje: 'Error al finalizar corte' });
  }
};

const obtenerCorteActivo = async (req, res) => {
  const { usuarioId, farmaciaId } = req.params;

  try {
    const cortes = await CorteCaja.find({
      usuario: usuarioId,
      farmacia: farmaciaId,
      fechaFin: null
    }).sort({ fechaInicio: -1 });

    if (cortes.length > 1) {
      return res.status(409).json({
        mensaje: 'Se detectaron múltiples cortes activos para este usuario. Contacte a soporte.',
        cortes
      });
    }

    const corte = cortes[0] || null;
    res.json({ corte });
  } catch (err) {
    console.error('Error al consultar corte activo:', err);
    res.status(500).json({ mensaje: 'Error al consultar corte activo' });
  }
};

const obtenerCortesFiltrados = async (req, res) => {
  try {
    const {
      // filtros
      fechaInicioDesde,
      fechaInicioHasta,
      nombreUsuario,
      farmacia,              // id de farmacia

      // paginación + sort
      page = 1,
      limit = 20,
      sortBy = 'fechaInicio',
      sortDir = 'desc',
    } = req.query;

    // ---------- paginación ----------
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitCap = 200;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), limitCap);
    const skip = (pageNum - 1) * limitNum;

    // ---------- filtro base ----------
    const filtro = {};

    // Rango de fechas local -> UTC [start, nextStart)
    if (fechaInicioDesde || fechaInicioHasta) {
      const dStr = (fechaInicioDesde || fechaInicioHasta).slice(0, 10); // 'YYYY-MM-DD'
      const hStr = (fechaInicioHasta || fechaInicioDesde).slice(0, 10);

      let startLocal = DateTime.fromISO(dStr, { zone: ZONE }).startOf('day');
      let endLocalExclusive = DateTime.fromISO(hStr, { zone: ZONE }).plus({ days: 1 }).startOf('day');

      if (endLocalExclusive < startLocal) {
        const tmp = startLocal;
        startLocal = endLocalExclusive.minus({ days: 1 });
        endLocalExclusive = tmp.plus({ days: 1 });
      }

      filtro.fechaInicio = {
        $gte: startLocal.toUTC().toJSDate(),
        $lt: endLocalExclusive.toUTC().toJSDate(),
      };
    }

    // filtro por usuario (regex por nombre -> ids)
    if (nombreUsuario) {
      const usuarios = await Usuario.find({
        nombre: { $regex: new RegExp(String(nombreUsuario), 'i') },
      }).select('_id');

      const ids = usuarios.map(u => u._id);
      if (!ids.length) {
        return res.status(200).json({
          paginacion: { page: 0, limit: 0, total: 0, pages: 0, hasPrev: false, hasNext: false },
          cortes: [],
          totales: totalesVacios(),
        });
      }
      filtro.usuario = { $in: ids };
    }

    // filtro por farmacia (id)
    if (farmacia && Types.ObjectId.isValid(farmacia)) {
      filtro.farmacia = new Types.ObjectId(farmacia);
    }

    // ---------- sort ----------
    const sortMap = {
      fechaInicio: 'fechaInicio',
      ingresoTotal: 'ingresoTotal',             // calculado
      ingresoEfectivo: 'ingresoEfectivo',       // calculado
      efectivoInicial: 'efectivoInicial',
      totalEfectivoEnCaja: 'totalEfectivoEnCaja',
      totalTarjeta: 'totalTarjeta',
      totalTransferencia: 'totalTransferencia',
      totalVale: 'totalVale',
      abonosMonederos: 'abonosMonederos',       // <-- NUEVO
      farmacia: 'farmaciaInfo.nombre',          // por nombre
      usuario: 'usuarioInfo.nombre',            // por nombre
    };
    const dir = String(sortDir).toLowerCase() === 'asc' ? 1 : -1;
    const sortField = sortMap[sortBy] || 'fechaInicio';

    // ---------- pipeline ----------
    const pipeline = [
      { $match: filtro },

      // join usuario
      {
        $lookup: {
          from: 'usuarios',
          localField: 'usuario',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'usuarioInfo',
        },
      },
      { $addFields: { usuarioInfo: { $arrayElemAt: ['$usuarioInfo', 0] } } },

      // join farmacia
      {
        $lookup: {
          from: 'farmacias',
          localField: 'farmacia',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'farmaciaInfo',
        },
      },
      { $addFields: { farmaciaInfo: { $arrayElemAt: ['$farmaciaInfo', 0] } } },

      {
        $addFields: {
          totalEfectivoEnCaja: {
            $cond: [
              { $eq: [{ $ifNull: ['$totalEfectivoEnCaja', 0] }, 0] },
              { $ifNull: ['$efectivoInicial', 0] },
              { $ifNull: ['$totalEfectivoEnCaja', 0] }
            ]
          },
          _efectivoInicial: { $toDouble: { $ifNull: ['$efectivoInicial', 0] } },
          _efectivoCaja: { $toDouble: { $ifNull: ['$totalEfectivoEnCaja', 0] } },
          _totalTarjeta: { $toDouble: { $ifNull: ['$totalTarjeta', 0] } },
          _totalTransferencia: { $toDouble: { $ifNull: ['$totalTransferencia', 0] } },
        }
      },

      {
        $addFields: {
          ingresoEfectivo: {
            $let: {
              vars: { diff: { $subtract: ['$_efectivoCaja', '$_efectivoInicial'] } },
              in: { $cond: [{ $lt: ['$$diff', 0] }, 0, '$$diff'] } // nunca negativo
            }
          },
          ingresoTotal: {
            $add: [
              { $ifNull: ['$ingresoEfectivo', 0] }, // 👈 evita null
              '$_totalTarjeta',
              '$_totalTransferencia'
            ]
          }
        }
      },

      // orden
      { $sort: { [sortField]: dir, _id: 1 } },

      // facet: filas + conteo + totales globales
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                _id: 1,
                fechaInicio: 1,
                fechaFin: 1,
                efectivoInicial: 1,
                totalEfectivoEnCaja: 1,
                totalTarjeta: 1,
                totalTransferencia: 1,
                totalVale: 1,
                abonosMonederos: 1,
                ingresoEfectivo: 1,
                ingresoTotal: 1,
                usuario: {
                  $cond: [
                    { $ifNull: ['$usuario', false] },
                    { _id: '$usuario', nombre: '$usuarioInfo.nombre' },
                    null,
                  ],
                },
                farmacia: {
                  $cond: [
                    { $ifNull: ['$farmacia', false] },
                    { _id: '$farmacia', nombre: '$farmaciaInfo.nombre' },
                    null,
                  ],
                },
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
          totales: [
            {
              $group: {
                _id: null,
                conteo: { $sum: 1 },
                efectivoInicial: { $sum: { $ifNull: ['$efectivoInicial', 0] } },
                totalEfectivoEnCaja: { $sum: { $ifNull: ['$totalEfectivoEnCaja', 0] } },
                totalTarjeta: { $sum: { $ifNull: ['$totalTarjeta', 0] } },
                totalTransferencia: { $sum: { $ifNull: ['$totalTransferencia', 0] } },
                totalVale: { $sum: { $ifNull: ['$totalVale', 0] } },
                abonosMonederos: { $sum: { $ifNull: ['$abonosMonederos', 0] } },
                ingresoEfectivo: { $sum: '$ingresoEfectivo' },
                ingresoTotal: { $sum: '$ingresoTotal' },
              },
            },
            { $project: { _id: 0 } },
          ],
        },
      },
    ];

    // collation para ordenar por texto en español (insensible a mayúsculas/acentos)
    const agg = await CorteCaja.aggregate(pipeline).collation({ locale: 'es', strength: 1 });
    const facet = agg?.[0] || { rows: [], totalCount: [], totales: [] };

    const total = facet.totalCount?.[0]?.count || 0;
    const pages = total ? Math.ceil(total / limitNum) : 0;

    return res.status(200).json({
      paginacion: {
        page: pages ? pageNum : 0,
        limit: pages ? limitNum : 0,
        total,
        pages,
        hasPrev: pageNum > 1 && pageNum <= pages,
        hasNext: pageNum < pages,
      },
      cortes: facet.rows || [],
      totales: facet.totales?.[0] || totalesVacios(),
    });
  } catch (err) {
    console.error('Error al filtrar cortes:', err);
    res.status(500).json({ mensaje: 'Error al filtrar cortes de caja' });
  }
};

function totalesVacios() {
  return {
    conteo: 0,
    efectivoInicial: 0,
    totalEfectivoEnCaja: 0,
    totalTarjeta: 0,
    totalTransferencia: 0,
    totalVale: 0,
    abonosMonederos: 0,   // <-- NUEVO
    ingresoEfectivo: 0,
    ingresoTotal: 0,
  };
}



const eliminarCorte = async (req, res) => {
  const { corteId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(corteId)) {
      return res.status(400).json({ mensaje: 'corteId inválido' });
    }

    // 🧰 Borrado atómico: solo elimina si el corte NO está activo (tiene fechaFin)
    const eliminado = await CorteCaja.findOneAndDelete({
      _id: corteId,
      fechaFin: { $ne: null } // si no tiene fechaFin => está activo => NO elimina
    });

    if (!eliminado) {
      // Ver si no existe o si está activo
      const existe = await CorteCaja.exists({ _id: corteId });
      if (!existe) {
        return res.status(404).json({ mensaje: 'Corte de caja no encontrado' });
      }
      return res.status(409).json({ mensaje: 'No se puede eliminar un corte activo (sin fecha de cierre).' });
    }

    return res.json({
      mensaje: 'Corte de caja eliminado correctamente',
      corteEliminadoId: corteId
    });
  } catch (error) {
    console.error('Error al eliminar corte:', error);
    return res.status(500).json({ mensaje: 'Error al eliminar corte' });
  }
};
module.exports = {
  crearCorte,
  finalizarCorte,
  obtenerCorteActivo,
  obtenerCortesFiltrados,
  eliminarCorte,
};

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
      saldoInicialRecargas: saldoRecargas,

      recargas: {
        saldoInicial: saldoRecargas,
        vendidas: 0,
        saldoTeoricoFinal: saldoRecargas
      }
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

  try {
    const corte = await CorteCaja.findById(corteId);
    if (!corte) return res.status(404).json({ mensaje: 'Corte no encontrado' });

    const usuarioId = String(corte.usuario);

    // ===== RANGOS CONSISTENTES =====
    const inicio = new Date(corte.fechaInicio);
    const finLocal = DateTime.now().setZone(ZONE);
    const fin = finLocal.toUTC().toJSDate();
    const RANGO = { $gte: inicio, $lt: fin };

    const N = v => (typeof v === 'number' ? v : Number(v)) || 0;

    // Limpieza defensiva (por si se reintenta finalizar)
    corte.tarjetas = [];
    corte.transferencias = [];
    corte.efectivoMovimientos = []; // ✅ para auditoría

    /* =========================
       VENTAS
    ========================== */
    const ventas = await Venta.find({
      farmacia: corte.farmacia,
      usuario: usuarioId,
      fecha: RANGO,
    }).populate('productos.producto', 'categoria');

    let ventasEfectivo = 0;
    let ventasTarjeta = 0;
    let ventasTransferencia = 0;
    let ventasVale = 0;
    let abonosMonedero = 0;
    let recargasVendidas = 0;

    ventas.forEach(v => {
      const efectivo = N(v.formaPago?.efectivo);
      const tarjeta = N(v.formaPago?.tarjeta);
      const transferencia = N(v.formaPago?.transferencia);
      const vale = N(v.formaPago?.vale);

      ventasEfectivo += efectivo;
      ventasTarjeta += tarjeta;
      ventasTransferencia += transferencia;
      ventasVale += vale;
      abonosMonedero += N(v.totalMonederoCliente);

      // 🔹 DESGLOSE TARJETA (VENTA)
      if (tarjeta > 0) {
        const comision = +(tarjeta * 0.04).toFixed(2);
        corte.tarjetas.push({
          origen: 'venta',
          referencia: v.folio,
          monto: tarjeta,
          comision,
          neto: +(tarjeta - comision).toFixed(2),
          fecha: v.fecha
        });
      }

      // 🔹 DESGLOSE TRANSFERENCIA (VENTA)
      if (transferencia > 0) {
        corte.transferencias.push({
          origen: 'venta',
          referencia: v.folio,
          monto: transferencia,
          fecha: v.fecha
        });
      }

      // 🔹 RECARGAS (INFORMATIVO, SIN IMPORTAR FORMA DE PAGO)
      (v.productos || []).forEach(d => {
        if (d.producto?.categoria === 'Recargas') {
          recargasVendidas += N(d.totalRen);
        }
      });
    });

    /* =========================
       DEVOLUCIONES
    ========================== */
    const devoluciones = await Devolucion.find({
      farmacia: corte.farmacia,
      usuario: usuarioId,
      fecha: RANGO,
    });

    const devolucionesVale = devoluciones.reduce((a, d) => a + N(d.valeDevuelto), 0);
    const devolucionesEfectivo = devoluciones.reduce((a, d) => a + N(d.dineroDevuelto), 0);

    /* =========================
       PEDIDOS - ANTICIPOS
       Regla: si el pedido se canceló dentro del mismo corte, se ignora aquí (no ingreso)
    ========================== */
    const anticipos = await Pedido.find({
      farmacia: corte.farmacia,
      usuarioPidio: usuarioId,
      fechaPedido: RANGO,

      // ✅ EXCLUIR: pedidos cancelados cuyo cancelación ocurrió también dentro del corte
      $nor: [{
        estado: 'cancelado',
        fechaCancelacion: RANGO
      }]
    });

    let anticiposEfectivo = 0;
    let anticiposTarjeta = 0;
    let anticiposTransferencia = 0;
    let anticiposVale = 0;

    anticipos.forEach(p => {
      const ef = N(p.pagoACuenta?.efectivo);
      const tj = N(p.pagoACuenta?.tarjeta);
      const tr = N(p.pagoACuenta?.transferencia);
      const vl = N(p.pagoACuenta?.vale);

      anticiposEfectivo += ef;
      anticiposTarjeta += tj;
      anticiposTransferencia += tr;
      anticiposVale += vl;

      if (tj > 0) {
        const comision = +(tj * 0.04).toFixed(2);
        corte.tarjetas.push({
          origen: 'pedido',
          referencia: p.folio,
          monto: tj,
          comision,
          neto: +(tj - comision).toFixed(2),
          fecha: p.fechaPedido
        });
      }

      if (tr > 0) {
        corte.transferencias.push({
          origen: 'pedido',
          referencia: p.folio,
          monto: tr,
          fecha: p.fechaPedido
        });
      }
    });

    /* =========================
       PEDIDOS - RESTO (ENTREGA)
    ========================== */
    const entregas = await Pedido.find({
      farmacia: corte.farmacia,
      usuarioSurtio: usuarioId,
      fechaEntrega: RANGO,
      estado: 'entregado',
    });

    let restoEfectivo = 0;
    let restoTarjeta = 0;
    let restoTransferencia = 0;
    let restoVale = 0;

    entregas.forEach(p => {
      const ef = N(p.pagoResta?.efectivo);
      const tj = N(p.pagoResta?.tarjeta);
      const tr = N(p.pagoResta?.transferencia);
      const vl = N(p.pagoResta?.vale);

      restoEfectivo += ef;
      restoTarjeta += tj;
      restoTransferencia += tr;
      restoVale += vl;

      if (tj > 0) {
        const comision = +(tj * 0.04).toFixed(2);
        corte.tarjetas.push({
          origen: 'pedido',
          referencia: p.folio,
          monto: tj,
          comision,
          neto: +(tj - comision).toFixed(2),
          fecha: p.fechaEntrega
        });
      }

      if (tr > 0) {
        corte.transferencias.push({
          origen: 'pedido',
          referencia: p.folio,
          monto: tr,
          fecha: p.fechaEntrega
        });
      }
    });

    /* =========================
       CANCELACIONES (REGLA CORTE) - SOLO EFECTIVO
       Restar SOLO si:
       - fechaCancelacion dentro del corte
       - y pedido.fechaPedido ANTES del inicio del corte
       Ignorar vales.
       Nota: usamos Cancelacion porque ahí está el "dineroDevuelto real".
    ========================== */
    const cancelaciones = await Cancelacion.aggregate([
      {
        $match: {
          farmacia: new mongoose.Types.ObjectId(corte.farmacia),
          usuario: new mongoose.Types.ObjectId(usuarioId),
          fechaCancelacion: RANGO,
        }
      },
      {
        $lookup: {
          from: 'pedidos',
          localField: 'pedido',
          foreignField: '_id',
          as: 'pedidoDoc'
        }
      },
      { $unwind: '$pedidoDoc' },

      // ✅ condición clave: el pedido se levantó antes del corte
      { $match: { 'pedidoDoc.fechaPedido': { $lt: inicio } } },

      {
        $project: {
          dineroDevuelto: 1,
          fechaCancelacion: 1,
          folioPedido: '$pedidoDoc.folio'
        }
      }
    ]);

    const cancelacionesEfectivo = cancelaciones.reduce((a, c) => a + N(c.dineroDevuelto), 0);

    // Auditoría de movimientos en efectivo (negativos)
    cancelaciones.forEach(c => {
      const monto = -N(c.dineroDevuelto);
      if (monto !== 0) {
        corte.efectivoMovimientos.push({
          origen: 'cancelacion',
          referencia: c.folioPedido || 'Pedido cancelado',
          monto,
          fecha: c.fechaCancelacion
        });
      }
    });

    /* =========================
       TOTALES
    ========================== */
    const pedidosEfectivo = anticiposEfectivo + restoEfectivo;
    const pedidosTarjeta = anticiposTarjeta + restoTarjeta;
    const pedidosTransferencia = anticiposTransferencia + restoTransferencia;
    const pedidosVale = anticiposVale + restoVale;

    corte.fechaFin = fin;

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

    // ✅ solo efectivo (vales ignorados en cancelación)
    corte.pedidosCanceladosEfectivo = cancelacionesEfectivo;
    corte.pedidosCanceladosVale = 0;

    const efectivoInicial = N(corte.efectivoInicial);
    corte.totalEfectivoEnCaja =
      efectivoInicial +
      ventasEfectivo -
      devolucionesEfectivo +
      pedidosEfectivo -
      cancelacionesEfectivo;

    corte.totalTarjeta = ventasTarjeta + pedidosTarjeta;
    corte.totalTransferencia = ventasTransferencia + pedidosTransferencia;

    // ✅ no restamos cancelacionesVale
    corte.totalVale = ventasVale - devolucionesVale + pedidosVale;

    // 🔹 RECARGAS (OBJETO NUEVO)
    if (!corte.recargas) {
      corte.recargas = {
        saldoInicial: N(corte.saldoInicialRecargas),
        vendidas: recargasVendidas,
        saldoTeoricoFinal: N(corte.saldoInicialRecargas) - recargasVendidas
      };
    } else {
      corte.recargas.vendidas = recargasVendidas;
      corte.recargas.saldoTeoricoFinal =
        N(corte.recargas.saldoInicial) - recargasVendidas;
    }

    corte.abonosMonederos = abonosMonedero;
    corte.ventasRealizadas = ventas.length;
    corte.devolucionesRealizadas = devoluciones.length;
    corte.pedidosLevantados = anticipos.length;
    corte.pedidosEntregados = entregas.length;

    // ✅ cuenta solo cancelaciones que impactan el corte (por regla)
    corte.pedidosCancelados = cancelaciones.length;

    if (grabar) await corte.save();

    return res.status(200).json({ mensaje: 'Corte finalizado', corte });
  } catch (error) {
    console.error('Error al finalizar corte:', error);
    return res.status(500).json({ mensaje: 'Error al finalizar corte' });
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
      fechaInicioDesde,
      fechaInicioHasta,
      nombreUsuario,
      farmacia,

      page = 1,
      limit = 20,
      sortBy = 'fechaInicio',
      sortDir = 'desc',
    } = req.query;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const filtro = {};

    /* ================= RANGO DE FECHAS ================= */
    if (fechaInicioDesde || fechaInicioHasta) {
      const desde = new Date(fechaInicioDesde + 'T00:00:00.000Z');
      const hasta = new Date(fechaInicioHasta + 'T23:59:59.999Z');
      filtro.fechaInicio = { $gte: desde, $lte: hasta };
    }

    /* ================= USUARIO ================= */
    if (nombreUsuario) {
      const usuarios = await Usuario.find({
        nombre: { $regex: new RegExp(nombreUsuario, 'i') }
      }).select('_id');

      if (!usuarios.length) {
        return res.json({
          paginacion: { page: 0, limit: 0, total: 0, pages: 0 },
          cortes: [],
          totales: totalesVacios()
        });
      }

      filtro.usuario = { $in: usuarios.map(u => u._id) };
    }

    /* ================= FARMACIA ================= */
    if (farmacia && mongoose.Types.ObjectId.isValid(farmacia)) {
      filtro.farmacia = new mongoose.Types.ObjectId(farmacia);
    }

    /* ================= SORT ================= */
    const sortMap = {
      fechaInicio: 'fechaInicio',
      totalEfectivoEnCaja: 'totalEfectivoEnCaja',
      totalTarjeta: 'totalTarjeta',
      totalTransferencia: 'totalTransferencia',
      totalVale: 'totalVale',
      totalRecargas: 'totalRecargas',
      abonosMonederos: 'abonosMonederos',
      farmacia: 'farmaciaInfo.nombre',
      usuario: 'usuarioInfo.nombre',
    };

    const dir = sortDir === 'asc' ? 1 : -1;
    const sortField = sortMap[sortBy] || 'fechaInicio';

    /* ================= PIPELINE ================= */
    const pipeline = [
      { $match: filtro },

      // usuario
      {
        $lookup: {
          from: 'usuarios',
          localField: 'usuario',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'usuarioInfo'
        }
      },
      { $set: { usuarioInfo: { $arrayElemAt: ['$usuarioInfo', 0] } } },

      // farmacia
      {
        $lookup: {
          from: 'farmacias',
          localField: 'farmacia',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'farmaciaInfo'
        }
      },
      { $set: { farmaciaInfo: { $arrayElemAt: ['$farmaciaInfo', 0] } } },

      /* ======= INGRESOS CALCULADOS ======= */
      {
        $addFields: {
          ingresoEfectivo: {
            $subtract: [
              { $add: ['$ventasEfectivo', '$pedidosEfectivo'] },
              { $add: ['$devolucionesEfectivo', '$pedidosCanceladosEfectivo'] }
            ]
          },
          ingresoTotal: {
            $add: [
              {
                $subtract: [
                  { $add: ['$ventasEfectivo', '$pedidosEfectivo'] },
                  { $add: ['$devolucionesEfectivo', '$pedidosCanceladosEfectivo'] }
                ]
              },
              '$totalTarjeta',
              '$totalTransferencia'
            ]
          }
        }
      },

      { $sort: { [sortField]: dir, _id: 1 } },

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

                // === EFECTIVO ===
                efectivoInicial: 1,
                totalEfectivoEnCaja: 1,

                // === VENTAS ===
                ventasEfectivo: 1,
                ventasTarjeta: 1,
                ventasTransferencia: 1,
                ventasVale: 1,
                ventasRealizadas: 1,

                // === DEVOLUCIONES ===
                devolucionesEfectivo: 1,
                devolucionesVale: 1,
                devolucionesRealizadas: 1,

                // === PEDIDOS ===
                pedidosEfectivo: 1,
                pedidosTarjeta: 1,
                pedidosTransferencia: 1,
                pedidosVale: 1,
                pedidosCanceladosEfectivo: 1,
                pedidosCanceladosVale: 1,
                pedidosLevantados: 1,
                pedidosEntregados: 1,
                pedidosCancelados: 1,

                // === RECARGAS ===
                recargas: 1,
                totalRecargas: 1,

                // === TOTALES ===
                totalTarjeta: 1,
                totalTransferencia: 1,
                totalVale: 1,
                abonosMonederos: 1,
                ingresoEfectivo: 1,
                ingresoTotal: 1,

                // === RELACIONES ===
                usuario: {
                  _id: '$usuario',
                  nombre: '$usuarioInfo.nombre',
                },
                farmacia: {
                  _id: '$farmacia',
                  nombre: '$farmaciaInfo.nombre',
                },

                createdAt: 1,
              }
            }

          ],
          totalCount: [{ $count: 'count' }],
          totales: [
            {
              $group: {
                _id: null,
                conteo: { $sum: 1 },
                efectivoInicial: { $sum: '$efectivoInicial' },
                totalEfectivoEnCaja: { $sum: '$totalEfectivoEnCaja' },
                totalTarjeta: { $sum: '$totalTarjeta' },
                totalTransferencia: { $sum: '$totalTransferencia' },
                totalVale: { $sum: '$totalVale' },
                totalRecargas: { $sum: '$totalRecargas' },
                abonosMonederos: { $sum: '$abonosMonederos' },
                ingresoEfectivo: { $sum: '$ingresoEfectivo' },
                ingresoTotal: { $sum: '$ingresoTotal' }
              }
            },
            { $project: { _id: 0 } }
          ]
        }
      }
    ];

    const agg = await CorteCaja.aggregate(pipeline)
      .collation({ locale: 'es', strength: 1 });

    const facet = agg[0] || {};
    const total = facet.totalCount?.[0]?.count || 0;
    const pages = total ? Math.ceil(total / limitNum) : 0;

    res.json({
      paginacion: {
        page: pages ? pageNum : 0,
        limit: pages ? limitNum : 0,
        total,
        pages,
        hasPrev: pageNum > 1,
        hasNext: pageNum < pages
      },
      cortes: facet.rows || [],
      totales: facet.totales?.[0] || totalesVacios()
    });

  } catch (err) {
    console.error('❌ Error al filtrar cortes:', err);
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
    totalRecargas: 0,
    abonosMonederos: 0,
    ingresoEfectivo: 0,
    ingresoTotal: 0
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

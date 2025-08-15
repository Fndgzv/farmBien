// corteController.js

const CorteCaja = require('../models/CorteCaja');
const Venta = require('../models/Venta');
const Pedido = require('../models/Pedido');
const Devolucion = require('../models/Devolucion');
const Cancelacion = require('../models/Cancelacion');
const Usuario = require('../models/Usuario');
const mongoose = require('mongoose');


const TZ = 'America/Mexico_City';
function esHoy(fecha) {
  if (!fecha) return false;              // null/undefined => no es hoy
  const hoyMX = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const fechaMX = new Date(new Date(fecha).toLocaleString('en-US', { timeZone: TZ }));
  return fechaMX.getFullYear() === hoyMX.getFullYear() &&
    fechaMX.getMonth() === hoyMX.getMonth() &&
    fechaMX.getDate() === hoyMX.getDate();
}


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

/* const autorizarTurnoExtra = async (req, res) => {
  const { corteId, usuarioId } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(corteId)) {
      return res.status(400).json({ mensaje: 'corteId inválido' });
    }
    if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
      return res.status(400).json({ mensaje: 'usuarioId inválido' });
    }

    const corte = await CorteCaja.findById(corteId);
    if (!corte) {
      return res.status(404).json({ mensaje: 'Corte de caja no encontrado' });
    }

    if (!corte.fechaFin || !esHoy(corte.fechaFin)) {
      return res.status(409).json({ mensaje: 'Solo se autoriza el día de cierre' });
    }
    corte.turnoExtraAutorizado = true;
    await corte.save();

    return res.json({ mensaje: 'Turno extra autorizado correctamente', corte });
  } catch (error) {
    console.error('Error al autorizar turno extra:', error);
    // Manejo explícito de CastError por si algo se cuela
    if (error.name === 'CastError') {
      return res.status(400).json({ mensaje: 'ID inválido' });
    }
    return res.status(500).json({ mensaje: 'Error al autorizar turno extra' });
  }
};
 */

/* const verificarSiPuedeAbrirTurno = async (req, res) => {
  const usuario = req.usuario;
  const { farmaciaId } = req.params;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const mañana = new Date(hoy);
  mañana.setDate(mañana.getDate() + 1);

  try {
    const corteCerradoHoy = await CorteCaja.findOne({
      usuario: usuario._id,
      farmacia: farmaciaId,
      fechaInicio: { $gte: hoy, $lt: mañana },
      fechaFin: { $ne: null }, // ya se cerró
      turnoExtraAutorizado: { $ne: true }
    });

    if (corteCerradoHoy) {
      return res.status(200).json({ puedeAbrirTurno: false });
    } else {
      return res.status(200).json({ puedeAbrirTurno: true });
    }

  } catch (err) {
    console.error('Error al verificar turno:', err);
    res.status(500).json({ mensaje: 'Error al verificar si puede abrir turno' });
  }
};
 */

const obtenerCortesFiltrados = async (req, res) => {
  const { fechaInicioDesde, fechaInicioHasta, nombreUsuario } = req.query;
  const filtro = {};

  // 🔹 Rango de fechas
  if (fechaInicioDesde) {
    const desde = new Date(fechaInicioDesde);
    const hasta = fechaInicioHasta
      ? new Date(fechaInicioHasta)
      : new Date(fechaInicioDesde); // usar la misma si no se manda fechaHasta

    desde.setHours(0, 0, 0, 0);
    hasta.setHours(23, 59, 59, 999);

    filtro.fechaInicio = { $gte: desde, $lte: hasta };
  }

  try {
    // 🔹 Filtro por nombre de usuario
    if (nombreUsuario) {
      const usuarios = await Usuario.find({
        nombre: { $regex: new RegExp(nombreUsuario, 'i') },
      }).select('_id');

      const ids = usuarios.map(u => u._id);
      filtro.usuario = { $in: ids };
    }

    const cortes = await CorteCaja.find(filtro)
      .populate('usuario', 'nombre')
      .populate('farmacia', 'nombre')
      .sort({ fechaInicio: -1 });

    res.json({ cortes });
  } catch (err) {
    console.error('Error al filtrar cortes:', err);
    res.status(500).json({ mensaje: 'Error al filtrar cortes de caja' });
  }
};

const eliminarCorte = async (req, res) => {
  const { corteId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(corteId)) {
      return res.status(400).json({ mensaje: 'corteId inválido' });
    }

    const corte = await CorteCaja.findById(corteId);
    if (!corte) {
      return res.status(404).json({ mensaje: 'Corte de caja no encontrado' });
    }

    // (Opcional) Evitar borrar cortes activos (sin fechaFin):
    // if (!corte.fechaFin) {
    //   return res.status(409).json({ mensaje: 'No se puede eliminar un corte activo' });
    // }

    await corte.deleteOne(); // o: await CorteCaja.findByIdAndDelete(corteId);

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

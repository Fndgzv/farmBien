const mongoose = require("mongoose");

const CorteCajaSchema = new mongoose.Schema({
  fechaInicio: { type: Date, required: true },
  fechaFin: { type: Date, default: null },

  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  farmacia: { type: mongoose.Schema.Types.ObjectId, ref: "Farmacia", required: true },

  turnoExtraAutorizado: { type: Boolean, default: false },

  efectivoInicial: { type: Number, required: true },
  saldoInicialRecargas: { type: Number, required: true },

  // ventas
  ventasEfectivo: { type: Number, default: 0 },
  ventasTarjeta: { type: Number, default: 0 },
  ventasTransferencia: { type: Number, default: 0 },
  ventasVale: { type: Number, default: 0 },
  devolucionesVale: { type: Number, default: 0 },
  devolucionesEfectivo: { type: Number, default: 0 },
  ventasRealizadas: { type: Number, default: 0 },
  devolucionesRealizadas: { type: Number, default: 0 },

  // pedidos
  pedidosEfectivo: { type: Number, default: 0 },
  pedidosTarjeta: { type: Number, default: 0 },
  pedidosTransferencia: { type: Number, default: 0 },
  pedidosVale: { type: Number, default: 0 },
  pedidosCanceladosEfectivo: { type: Number, default: 0 },
  pedidosCanceladosVale: { type: Number, default: 0 },
  pedidosLevantados: { type: Number, default: 0 },
  pedidosEntregados: { type: Number, default: 0 },
  pedidosCancelados: { type: Number, default: 0 },

  // totales
  totalEfectivoEnCaja: { type: Number, default: 0 },
  totalTarjeta: { type: Number, default: 0 },
  totalTransferencia: { type: Number, default: 0 },
  totalVale: { type: Number, default: 0 },
  totalRecargas: { type: Number, default: 0 },

  // total de abonos al monedero los clientes 
  abonosMonederos: { type: Number, default: 0 },

}, {
  timestamps: true,
  collection: 'cortesDeCaja'
});

CorteCajaSchema.index({ fechaInicio: -1 });
CorteCajaSchema.index({ usuario: 1, fechaInicio: -1 });
CorteCajaSchema.index({ farmacia: 1, fechaInicio: -1 });

module.exports = mongoose.model("CorteCaja", CorteCajaSchema);

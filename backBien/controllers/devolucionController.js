// controllers/devolucionController.js
const Devolucion = require('../models/Devolucion');
const Venta = require('../models/Venta');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');
const Farmacia = require('../models/Farmacia');
const Cliente = require('../models/Cliente');

const toNum = v => (Number.isFinite(+v) ? +v : 0);
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

const registrarDevolucion = async (req, res) => {
  const ahora = new Date();
  try {
    const { folioVenta, farmaciaQueDevuelve, idCliente } = req.body;
    const usuario = req.usuario;
    let productosDevueltos = req.body.productosDevueltos || [];

    if (!['admin', 'empleado'].includes(usuario.rol)) {
      return res.status(403).json({ mensaje: '** No autorizado para realizar devoluciones **' });
    }

    // Buscar venta
    const venta = await Venta.findOne({ folio: folioVenta })
      .populate('cliente')
      .populate('productos.producto', 'nombre');
    if (!venta) {
      return res.status(404).json({ mensaje: '** Venta no encontrada con ese folio **' });
    }
    
    // === ENLAZAR VENTA AL NUEVO CLIENTE (si la venta no tenía cliente) ===
    if (idCliente && (!venta.cliente || !venta.cliente._id)) {
      await Venta.updateOne({ _id: venta._id }, { $set: { cliente: idCliente } });
      venta.cliente = idCliente;
    }

    // Validación de farmacia (misma farmacia de la venta)
    const farmaciaDev = await Farmacia.findById(farmaciaQueDevuelve);
    const nombreFarmaciaDev = farmaciaDev ? farmaciaDev.nombre : '—';
    const farmaciaOrigen = await Farmacia.findById(venta.farmacia);
    const nombreFarmacia = farmaciaOrigen ? farmaciaOrigen.nombre : '—';

    if (String(venta.farmacia) !== String(farmaciaQueDevuelve)) {
      return res.status(404).json({
        mensaje: `La venta no fue realizada en esta farmacia, acude a ${nombreFarmacia}`
      });
    }

    // Máx 7 días
    const diasPasados = (ahora - new Date(venta.fecha)) / (1000 * 60 * 60 * 24);
    if (diasPasados > 7) {
      return res.status(400).json({
        mensaje: `No se permiten devoluciones después de 7 días de la venta en ${nombreFarmaciaDev}`
      });
    }

    // Cantidades ya devueltas
    const devolucionesPrevias = await Devolucion.find({ venta: venta._id });
    const retornosPrevios = new Map();
    devolucionesPrevias.forEach(d => {
      (d.productosDevueltos || []).forEach(p => {
        const pid = String(p.producto);
        retornosPrevios.set(pid, (retornosPrevios.get(pid) || 0) + toNum(p.cantidad));
      });
    });

    // === Acumuladores ===
    let totalRefund = 0;
    let valeDevuelto = 0;
    let efectivoDevuelto = 0;
    let monederoARetirar = 0;

    // === Recorrer los renglones devueltos ===
    for (const dev of productosDevueltos) {
      const prodIdStr = String(dev.producto);

      // Info de producto y renglón en la venta
      const prodInfo = await Producto.findById(dev.producto).select('nombre categoria');
      const nombreReq = prodInfo ? prodInfo.nombre : dev.producto;

      const prodVenta = venta.productos.find(p => String(p.producto._id) === prodIdStr);
      if (!prodVenta) {
        return res.status(400).json({
          mensaje: `El producto ${nombreReq} no existe en la venta ${folioVenta} en ${nombreFarmacia}.`
        });
      }

      // Restricciones
      if (['2x1', '3x2', '4x3'].includes(prodVenta.tipoDescuento)) {
        return res.status(400).json({
          mensaje: `No se permiten devoluciones en productos con promo ${prodVenta.tipoDescuento}.`
        });
      }

      if (prodInfo?.categoria === 'Servicio Médico' || prodInfo?.categoria === 'Recargas') {
        return res.status(400).json({
          mensaje: "No se permiten devoluciones en Recargas ó Servicio Médico."
        });
      }

      // No exceder cantidad vendida menos lo ya devuelto
      const prev = toNum(retornosPrevios.get(prodIdStr));
      if (prev + toNum(dev.cantidad) > toNum(prodVenta.cantidad)) {
        return res.status(400).json({
          mensaje: `Antes devolviste ${prev} unidades de ${prodVenta.producto.nombre}, solo puedes devolver ${toNum(prodVenta.cantidad) - prev}`
        });
      }

      // Importe a reembolsar por este renglón (precio ya incluía descuentos)
      const importe = toNum(dev.cantidad) * toNum(prodVenta.precio);
      totalRefund += importe;

      // Reverso proporcional del monedero otorgado en la compra (si lo hubo)
      const monederoLinea = toNum(prodVenta.monederoCliente);
      const cantComprada = toNum(prodVenta.cantidad);
      if (monederoLinea > 0 && cantComprada > 0) {
        monederoARetirar += (monederoLinea * toNum(dev.cantidad) / cantComprada);
      }

      const inv = await InventarioFarmacia.findOne({ producto: prodVenta.producto, farmacia: venta.farmacia });
      if (inv) {
        inv.existencia += toNum(dev.cantidad);
        await inv.save();
      }
    }

    totalRefund = round2(totalRefund);
    monederoARetirar = round2(monederoARetirar);

    const pagoEfectivo = toNum(venta.formaPago.efectivo ?? 0);
    const pagoTarjeta = toNum(venta.formaPago.tarjeta ?? 0);
    const pagoTransf = toNum(venta.formaPago.transferencia ?? 0);
    const pagoMonedero = toNum(venta.formaPago.vale ?? 0);

    const totalPagado = round2(pagoMonedero + pagoEfectivo + pagoTarjeta + pagoTransf);

    // Si no hay totalPagado por algún motivo raro, devolvemos todo en efectivo
    let proporcionVale = 0;
    if (totalPagado > 0 && pagoMonedero > 0) {
      // Proporción del pago original que fue con monedero
      proporcionVale = Math.max(0, Math.min(1, pagoMonedero / totalPagado));
    }

    // División proporcional del reembolso
    valeDevuelto = round2(totalRefund * proporcionVale);
    efectivoDevuelto = round2(totalRefund - valeDevuelto);

    // === Limpiar motivos del payload de productos devueltos (ya no se usan) ===
    productosDevueltos = productosDevueltos.map(({ motivoIndex, ...rest }) => rest);

    // === Registrar Devolución ===
    const devolucion = await Devolucion.create({
      venta: venta._id,
      cliente: idCliente || (venta.cliente?._id ?? null),
      farmacia: venta.farmacia,
      productosDevueltos,
      dineroDevuelto: efectivoDevuelto, // efectivo
      valeDevuelto: valeDevuelto,       // monedero
      totalDevuelto: totalRefund,
      usuario: usuario.id
    });
    
    // === Si hay cliente, reflejar movimientos en monedero ===
    const clienteIdFinal = idCliente || (venta.cliente?._id ?? null);
    if (clienteIdFinal) {
      const cliente = await Cliente.findById(clienteIdFinal);
      if (cliente) {
        const saldoActual = toNum(cliente.totalMonedero);
        const movs = [];

        // Ingreso por vale (parte proporcional del reembolso que va al monedero)
        if (valeDevuelto > 0) {
          movs.push({
            fechaUso: ahora,
            montoIngreso: valeDevuelto,
            montoEgreso: 0,
            motivo: `Devolución venta`,
            farmaciaUso: farmaciaQueDevuelve
          });
        }

        // Egreso por reverso del monedero otorgado en la compra (proporcional a lo devuelto)
        let egresoReal = 0;
        if (monederoARetirar > 0) {
          // No permitir saldo negativo: egresamos hasta el saldo disponible tras el ingreso del vale
          egresoReal = Math.min(monederoARetirar, saldoActual + valeDevuelto);
          egresoReal = round2(egresoReal);
          if (egresoReal > 0) {
            movs.push({
              fechaUso: ahora,
              montoIngreso: 0,
              montoEgreso: egresoReal,
              motivo: `Reverso monedero por devolución`,
              farmaciaUso: farmaciaQueDevuelve
            });
          }
        }

        if (movs.length) {
          cliente.monedero.push(...movs);
          cliente.totalMonedero = round2(saldoActual + valeDevuelto - egresoReal);
          await cliente.save();
        }
      }
    }

    return res.status(201).json({
      mensaje: 'Devolución registrada correctamente',
      devolucion
    });

  } catch (error) {
    console.error('Error al registrar devolución:', error);
    return res.status(500).json({
      mensaje: 'Error interno al registrar la devolución',
      error: error.message
    });
  }
};;

const buscarVentaPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;

    const venta = await Venta.findOne({ folio: codigo }).populate('productos.producto');

    if (!venta) {
      return res.status(404).json({ mensaje: 'Venta no encontrada' });
    }

    res.json(venta);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al buscar la venta' });
  }
};


const obtenerVentasRecientes = async (req, res) => {

  const { farmaciaId } = req.params;
  const { folio } = req.query;
  const hace7Dias = new Date();
  hace7Dias.setDate(hace7Dias.getDate() - 7);

  try {
    // Si recibo un folio válido de 6 caracteres...
    if (folio && /^[A-Za-z0-9]{6}$/.test(folio)) {
      const regex = new RegExp(`${folio}$`);

      const venta = await Venta.findOne({
        farmacia: farmaciaId,
        fecha: { $gte: hace7Dias },
        folio: { $regex: regex }
      })
        .populate('cliente')
        .populate('farmacia')
        .populate('productos.producto');

      return res.json(venta ? [venta] : []);
    }

    // Si no hay folio, devuelvo todas las ventas de los últimos 7 días
    const ventas = await Venta.find({
      farmacia: farmaciaId,
      fecha: { $gte: hace7Dias }
    })
      .populate('cliente')
      .populate('farmacia')
      .populate('productos.producto');

    res.json(ventas);
  } catch (error) {
    console.error('Error al obtener ventas recientes:', error);
    res.status(500).json({ mensaje: 'Error al obtener ventas recientes' });
  }
};



module.exports = {
  registrarDevolucion, buscarVentaPorCodigo, obtenerVentasRecientes
};

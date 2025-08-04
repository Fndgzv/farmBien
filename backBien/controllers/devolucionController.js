// controllers/devolucionController.js
const Devolucion = require('../models/Devolucion');
const Venta = require('../models/Venta');
const InventarioFarmacia = require('../models/InventarioFarmacia');
const Producto = require('../models/Producto');
const Farmacia = require('../models/Farmacia');
const Cliente = require('../models/Cliente');

const registrarDevolucion = async (req, res) => {
  const ahora = new Date();
  try {
    const { folioVenta, farmaciaQueDevuelve, idCliente } = req.body;
    const usuario = req.usuario;
    let productosDevueltos = req.body.productosDevueltos;

    const culpaCliente = productosDevueltos.filter(p => p.motivoIndex < 6).length;

    if (idCliente === undefined && culpaCliente > 0 ) 
      return res.status(407).json({ mensaje: '** Para devolver y poder abonar a tu monedero, registrate como cliente **' });

    if (!idCliente && culpaCliente > 0 )
      return res.status(407).json({ mensaje: '** Para devolver y poder abonar a tu monedero, registrate como cliente **' });

    if (!['admin', 'empleado'].includes(usuario.rol)) {
      return res.status(403).json({ mensaje: '** No autorizado para realizar devoluciones **' });
    }

    // Obtener la venta
    const venta = await Venta.findOne({ folio: folioVenta })
      .populate('cliente').populate('productos.producto', 'nombre');
    if (!venta) {
      return res.status(404).json({ mensaje: '** Venta no encontrada con ese folio **' });
    }


    // obtener nombre de la farmacia donde se esta haciendo la devolución
    const farmaciaDev = await Farmacia.findById(farmaciaQueDevuelve);
    const nombreFarmaciaDev = farmaciaDev ? farmaciaDev.nombre : '—';

    const farmaciaOrigen = await Farmacia.findById(venta.farmacia);  // buscamos la farmacia donde compro el cliente
    const nombreFarmacia = farmaciaOrigen ? farmaciaOrigen.nombre : '—';  // obtener nombre de la farmacia donde se hizo la compra


    // Comprobar que la venta se haya realizado en la farmacia donde se quiere hacer la devolución
    if (venta.farmacia === farmaciaQueDevuelve) {
      return res.status(404).json({
        mensaje: `La venta no fue realizada en esta farmacia, acude a ${nombreFarmacia}`
      })
    }

    
    //validar fecha (máx. 7 días)
    const fechaVenta = new Date(venta.fecha);
    const diasPasados = (ahora - fechaVenta) / (1000 * 60 * 60 * 24);
    if (diasPasados > 7) {
      return res.status(400).json({
        mensaje: `No se permiten devoluciones después de 7 días de la venta en ${nombreFarmaciaDev}`
      });
    }

    // Construir map de cantidades ya devueltas por producto
    const devolucionesPrevias = await Devolucion.find({ venta: venta._id });
    const retornosPrevios = new Map(); // prodId -> cantidad ya devuelta
    devolucionesPrevias.forEach(d => {
      d.productosDevueltos.forEach(p => {
        const pid = p.producto.toString();
        retornosPrevios.set(pid, (retornosPrevios.get(pid) || 0) + p.cantidad);
      });
    });


    // Validaciones de cada devolución solicitada
    let totalRefund = 0;  // total a devolver
    let valeDevuelto = 0; // total de devolver en vales
    let seDevuelveEnEfectivo = 0; // total a devolver en efectivo, solo cuando el motivo es responsabilidad de la farmacia


    for (const dev of productosDevueltos) {

      // Nombre del producto solicitado
      const prodInfo = await Producto.findById(dev.producto).select('nombre');
      const nombreReq = prodInfo ? prodInfo.nombre : dev.producto;

      const prodVenta = venta.productos.find(p => p.producto._id.toString() === dev.producto);
      if (!prodVenta) {
        return res.status(400).json({
          mensaje: `El producto ${nombreReq} no existe en la venta ${folioVenta} en ${nombreFarmacia}.`
        });
      }
      // no devoluciones en promociones 2x1, etc.
      if (['2x1', '3x2', '4x3'].includes(prodVenta.tipoDescuento)) {
        return res.status(400).json({
          mensaje: `No se permiten devoluciones en productos con promo ${prodVenta.tipoDescuento}.`
        });
      }

      // no devoluciones en categoria = Recargas ó Servicio Médico
      if (prodInfo.categoria === 'Servicio Médico' || prodInfo.categoria === 'Recargas') {
        return res.status(400).json({
          mensaje: "No se permiten devoluciones en Recargas ó Servicio Médico."
        });
      }

      // cantidad total devuelta no exceda lo comprado
      const prev = retornosPrevios.get(dev.producto) || 0;

      if (prev + dev.cantidad > prodVenta.cantidad) {
        return res.status(400).json({
          mensaje: `Antes devolviste ${prev} unidades de ${prodVenta.producto.nombre}, solo puedes devolver ${prodVenta.cantidad - prev}`
        });
      }
      // acumular importe total a devolver (cantidad * precio unitario)
      totalRefund += dev.cantidad * prodVenta.precio;

      // determinar devolución en efectivo
      if (dev.motivoIndex >= 6) seDevuelveEnEfectivo += dev.cantidad * prodVenta.precio;

      // determinar devolución en monedero (colección vales)
      if (dev.motivoIndex < 6 && dev.motivoIndex >= 0) valeDevuelto += dev.cantidad * prodVenta.precio;

      // Devolver existencia al inventario
      const inv = await InventarioFarmacia.findOne({ producto: prodVenta.producto, farmacia: venta.farmacia });
      if (inv) {
        inv.existencia += dev.cantidad;
        await inv.save();
      }

    }

    // Antes de crear la devolución, reescribimos productosDevueltos:
    productosDevueltos = productosDevueltos.map(p => {
      const { motivoIndex, ...rest } = p;  // Separamos motivoIndex y el resto de propiedades
      // Devolvemos un nuevo objeto sin motivoIndex
      return {
        ...rest,
      };
    });

    // Ahora creamos el documento:
    const devolucion = new Devolucion({
      venta: venta._id,
      cliente: idCliente || null,
      farmacia: venta.farmacia,
      productosDevueltos,
      dineroDevuelto: seDevuelveEnEfectivo,
      valeDevuelto: valeDevuelto,
      totalDevuelto: totalRefund,
      usuario: usuario.id
    });
    await devolucion.save();

    /* Aqui acumulamos el monedero del cliente */
    if (valeDevuelto > 0) {
      const clienteEncontrado = await Cliente.findById(idCliente);
      if (clienteEncontrado) {
        // Saneamos totalMonedero a 0 si es falsy
        const actual = Number.isFinite(clienteEncontrado.totalMonedero)
          ? clienteEncontrado.totalMonedero : 0;
        clienteEncontrado.monedero.push({
          fechaUso: new Date(),
          montoIngreso: valeDevuelto,
          montoEgreso: 0,
          motivo: 'Devolución venta',
          farmaciaUso: farmaciaQueDevuelve
        });
        clienteEncontrado.totalMonedero = actual + valeDevuelto;
        await clienteEncontrado.save();
      }
    }

    return res.status(201).json({
      mensaje: 'Devolución registrada correctamente',
      devolucion,
    });


  } catch (error) {
    console.error('Error al registrar devolución:', error);
    return res.status(500).json({
      mensaje: 'Error interno al registrar la devolución',
      error: error.message
    });
  }
};


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

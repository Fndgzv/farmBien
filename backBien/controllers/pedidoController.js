const { DateTime } = require('luxon');
const Cliente = require("../models/Cliente");
const Pedido = require("../models/Pedido");
const Cancelacion = require("../models/Cancelacion");
const generarFolioUnico = require('../utils/generarFolioUnico');

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

// Convierte 'YYYY-MM-DD' (local MX) a rango UTC half-open [gte, lt)
function dayRangeUtc(fechaInicio, fechaFin) {
    if (!fechaInicio && !fechaFin) return null;

    const iniStr = (fechaInicio || fechaFin).slice(0, 10);
    const finStr = (fechaFin || fechaInicio).slice(0, 10);

    let startLocal = DateTime.fromISO(iniStr, { zone: ZONE }).startOf('day');
    let endExLocal = DateTime.fromISO(finStr, { zone: ZONE }).plus({ days: 1 }).startOf('day');

    if (endExLocal < startLocal) {
        const tmp = startLocal;
        startLocal = endExLocal.minus({ days: 1 });
        endExLocal = tmp.plus({ days: 1 });
    }

    return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

const crearPedido = async (req, res) => {

    const usuarioAuth = req.usuario;

    const usuario = usuarioAuth.id;
    if (!['admin', 'empleado'].includes(usuarioAuth.rol)) {
        return res.status(403).json({ mensaje: 'Solo administradores o empleados pueden registrar pedidos' });
    }

    try {
        const {
            folio,
            farmacia,
            clienteId = null,
            descripcion,
            total,
            aCuenta,
            pagoACuenta,
        } = req.body;

        if (!farmacia || !usuario || !descripcion || !total || !aCuenta || !pagoACuenta) {
            return res.status(400).json({ mensaje: 'Faltan datos obligatorios para registrar el pedido' });
        }

        // comprobar el vale
        if (pagoACuenta.vale > 0 && !clienteId) {
            return res.status(401).json({ mensaje: 'Falta proporcionar el id del cliente' });
        }

        if (clienteId && pagoACuenta.vale > 0) {
            const datosCliente = await Cliente.findById(clienteId);
            if (datosCliente) {
                if (datosCliente.totalMonedero < pagoACuenta.vale)
                    return res.status(402).json({ mensaje: 'Fondos insuficientes en el monedero del cliente' });
                const ahorita = new Date();
                datosCliente.monedero.push({
                    fechaUso: ahorita,
                    montoIngreso: 0,
                    montoEgreso: pagoACuenta.vale,
                    motivo: "Pago pedido",
                    farmaciaUso: farmacia
                });
                datosCliente.totalMonedero = parseFloat((datosCliente.totalMonedero - pagoACuenta.vale).toFixed(2));
                await datosCliente.save();
            }
        }

        // Crear nuevo pedido, generando folio si no lo trae
        let folioFinal = folio;

        if (!folioFinal || await Pedido.exists({ folio: folioFinal })) {
            folioFinal = await generarFolioUnico(Pedido, {
                prefijo: 'FBPed',
                incluirDia: false
            });
        }

        const pedido = new Pedido({
            folio: folioFinal,
            farmacia,
            cliente: clienteId || null,
            usuarioPidio: usuario,
            descripcion,
            total,
            aCuenta,
            pagoACuenta,
            estado: 'inicial'
            // resta se calculará por defecto desde el esquema
            // fechaEntrega aún no se establece
        });

        await pedido.save();

        // Si hay cliente, registrar en historial de compras
        if (clienteId) {
            await Cliente.findByIdAndUpdate(
                clienteId,
                {
                    $push: {
                        historialCompras: {
                            pedido: pedido._id,
                            fecha: new Date()
                        }
                    }
                },
                { new: true }
            );

        }

        res.status(201).json({ mensaje: 'Pedido registrado con éxito', pedido });
    } catch (error) {
        console.error('Error al crear pedido:', error);
        res.status(500).json({ mensaje: 'Error interno al registrar el pedido' });
    }
};

const surtirPedido = async (req, res) => {
    const usuarioAuth = req.usuario;
    if (!['admin', 'empleado'].includes(usuarioAuth.rol)) {
        return res.status(403).json({ mensaje: 'Solo administradores o empleados pueden surtir pedidos' });
    }

    try {
        const { folio, pagoResta } = req.body;
        const usuario = usuarioAuth.id;

        if (!folio || !pagoResta) {
            return res.status(400).json({ mensaje: 'Faltan datos para localizar el pedido o procesar el pago restante' });
        }

        const pedido = await Pedido.findOne({ folio });

        if (!pedido) {
            return res.status(404).json({ mensaje: 'Pedido no encontrado con ese folio' });
        }

        if (pedido.estado === 'entregado') {
            return res.status(400).json({ mensaje: 'Este pedido ya fue surtido previamente.' });
        }

        if (pedido.estado === 'cancelado') {
            return res.status(400).json({ mensaje: 'Este pedido se canceló previamente.' });
        }

        // comprobar el vale
        if (pagoResta.vale > 0 && !pedido.cliente) {
            return res.status(401).json({ mensaje: 'Falta proporcionar el id del cliente' });
        }

        const { efectivo = 0, tarjeta = 0, transferencia = 0, vale = 0 } = pagoResta;
        const sumaResta = parseFloat(efectivo) + parseFloat(tarjeta) + parseFloat(transferencia) + parseFloat(vale);
        const totalPagado = pedido.aCuenta + sumaResta;

        if (Math.abs(totalPagado - pedido.total) > 0.019) {
            return res.status(400).json({ mensaje: 'El total pagado no coincide con el total del pedido' });
        }

        pedido.usuarioSurtio = usuario;
        pedido.pagoResta = { efectivo, tarjeta, transferencia, vale };
        pedido.estado = 'entregado';
        pedido.fechaEntrega = new Date();
        await pedido.save();

        if (pagoResta.vale > 0) {
            const datosCliente = await Cliente.findById(pedido.cliente);
            if (datosCliente) {
                const ahorita = new Date();
                datosCliente.monedero.push({
                    fechaUso: ahorita,
                    montoIngreso: 0,
                    montoEgreso: pagoResta.vale,
                    motivo: "Pago pedido",
                    farmaciaUso: pedido.farmacia
                });
                datosCliente.totalMonedero = parseFloat((datosCliente.totalMonedero - pagoResta.vale).toFixed(2));
                await datosCliente.save();
            }
        }

        res.status(200).json({ mensaje: 'Pedido surtido correctamente', pedido });
    } catch (error) {
        console.error('Error al surtir pedido:', error);
        res.status(500).json({ mensaje: 'Error interno al surtir el pedido' });
    }
};

const cancelarPedido = async (req, res) => {
    const usuarioAuth = req.usuario;

    if (!['admin', 'empleado'].includes(usuarioAuth.rol)) {
        return res.status(403).json({ mensaje: 'Solo administradores o empleados pueden cancelar pedidos' });
    }
    try {
        const { folio } = req.body;
        const usuario = usuarioAuth.id;

        if (!folio) {
            return res.status(400).json({ mensaje: 'El folio es obligatorio' });
        }

        const pedido = await Pedido.findOne({ folio });

        if (!pedido) {
            return res.status(404).json({ mensaje: 'Pedido no encontrado con ese folio' });
        }

        if (pedido.estado === 'entregado') {
            return res.status(400).json({ mensaje: 'Este pedido ya fue surtido previamente, Ya NO se puede cancelar' });
        }

        if (pedido.estado === 'cancelado') {
            return res.status(400).json({ mensaje: 'Este pedido se canceló previamente.' });
        }

        if (pedido.pagoACuenta.vale > 0) {
            // actualizar monedero cliente
            const datosCliente = await Cliente.findById(pedido.cliente);
            if (datosCliente) {
                const ahorita = new Date();
                datosCliente.monedero.push({
                    fechaUso: ahorita,
                    montoIngreso: pedido.pagoACuenta.vale,
                    montoEgreso: 0,
                    motivo: "Cancelación pedido",
                    farmaciaUso: pedido.farmacia
                });
                datosCliente.totalMonedero = parseFloat((datosCliente.totalMonedero + pedido.pagoACuenta.vale).toFixed(2));
                await datosCliente.save();
            }
        }

        // Actualizar pedido
        pedido.estado = 'cancelado';
        pedido.fechaCancelacion = new Date();
        pedido.usuarioCancelo = usuario;
        await pedido.save();

        // Crear cancelación
        const cancelacion = new Cancelacion({
            pedido: pedido.id,
            usuario: pedido.usuarioCancelo,
            farmacia: pedido.farmacia,
            dineroDevuelto: pedido.pagoACuenta.efectivo + pedido.pagoACuenta.tarjeta + pedido.pagoACuenta.transferencia,
            valeDevuelto: pedido.pagoACuenta.vale,
            totalDevuelto: pedido.aCuenta,
            fechaCancelacion: new Date()
        });
        await cancelacion.save();


        res.status(200).json({ mensaje: 'El pedido fue CANCELADO', pedido });

    } catch (error) {
        console.error('Error al cancelar pedido:', error);
        res.status(500).json({ mensaje: 'Error interno al cancelar el pedido' });
    }

}

const obtenerPedidos = async (req, res) => {
  try {
    const {
      farmacia: farmaciaId,
      fechaInicio,
      fechaFin,
      folio,
      estado,
      descripcion,
      descripcionMinima
    } = req.query;

    // 1) Búsqueda por folio exacto (6 chars al final), ignora fechas
    if (folio && /^[A-Za-z0-9]{6}$/.test(folio)) {
      const regex = new RegExp(`${folio}$`);
      const filtroFolio = {
        ...(farmaciaId ? { farmacia: farmaciaId } : {}),
        ...(estado ? { estado } : {}),
        folio: { $regex: regex }
      };

      const pedido = await Pedido.findOne(filtroFolio)
        .populate('cliente', 'nombre totalMonedero telefono')
        .populate('usuarioPidio', 'nombre')
        .populate('usuarioSurtio', 'nombre')
        .populate('usuarioCancelo', 'nombre');

      return res.json({ pedidos: pedido ? [pedido] : [] });
    }

    // 2) Validación de descripción mínima si así lo exiges
    if (descripcion && descripcionMinima === 'true' && String(descripcion).length < 5) {
      return res.status(407).json({ mensaje: 'La descripción al menos debe tener 5 caracteres' });
    }

    // 3) Filtro general
    const filtro = {};
    if (estado) filtro.estado = estado;
    if (farmaciaId) filtro.farmacia = farmaciaId;

    // Rango de fechas robusto sobre fechaPedido
    const r = dayRangeUtc(fechaInicio, fechaFin);
    if (r) {
      filtro.fechaPedido = { $gte: r.gte, $lt: r.lt };
    }

    if (descripcion) {
      filtro.descripcion = { $regex: new RegExp(String(descripcion), 'i') };
    }

    const pedidos = await Pedido.find(filtro)
      .populate('cliente', 'nombre')
      .populate('usuarioPidio', 'nombre')
      .populate('usuarioSurtio', 'nombre')
      .populate('usuarioCancelo', 'nombre')
      .sort({ fechaPedido: -1, createdAt: -1 });

    return res.status(200).json({ pedidos });
  } catch (error) {
    console.error('Error al obtener pedidos', error);
    return res.status(500).json({ mensaje: 'Error al consultar pedidos' });
  }
};

const actualizarCostoPedido = async (req, res) => {
    try {
        const pedidoId = req.params.id;
        const { costo } = req.body;

        if (!pedidoId || typeof costo !== 'number') {
            return res.status(400).json({ mensaje: 'Datos inválidos.' });
        }

        const pedidoActualizado = await Pedido.findByIdAndUpdate(
            pedidoId,
            { costo },
            { new: true }
        );

        if (!pedidoActualizado) {
            return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
        }

        res.status(200).json({ mensaje: 'Costo actualizado correctamente.', pedido: pedidoActualizado });
    } catch (error) {
        console.error('Error al actualizar costo del pedido:', error);
        res.status(500).json({ mensaje: 'Error al actualizar costo.' });
    }
};



module.exports = {
    crearPedido,
    surtirPedido,
    cancelarPedido,
    obtenerPedidos,
    actualizarCostoPedido
};

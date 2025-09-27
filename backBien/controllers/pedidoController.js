const { DateTime } = require('luxon');
const Cliente = require("../models/Cliente");
const Pedido = require("../models/Pedido");
const Cancelacion = require("../models/Cancelacion");
const { Types } = require('mongoose');

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

    /* if (!folioFinal || await Pedido.exists({ folio: folioFinal })) {
        folioFinal = await generarFolioUnico(Pedido, {
            prefijo: 'FBPed',
            incluirDia: false
        });
    } */

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

    // === NUEVO: grabar referencia de la cancelación en el historial del cliente ===
    if (pedido.cliente) {
      await Cliente.findByIdAndUpdate(
        pedido.cliente,
        { $push: { historialCompras: { cancelacion: cancelacion._id, pedido: pedido._id } } }
      );

    }

    res.status(200).json({ mensaje: 'El pedido fue CANCELADO', pedido });

  } catch (error) {
    console.error('Error al cancelar pedido:', error);
    res.status(500).json({ mensaje: 'Error interno al cancelar el pedido' });
  }
};

const obtenerPedidos = async (req, res) => {
  try {
    const {
      farmacia: farmaciaId,
      fechaInicio,
      fechaFin,
      folio,
      estado,
      descripcion,
      descripcionMinima,
      page = 1,
      limit = 20,
      sortBy,
      sortDir,
      clienteNombre,
      clienteNull, // 'true' para solo nulos, ó combinado con clienteNombre (OR)
    } = req.query;

    // --- Normaliza paginación ---
    const pageNum  = Math.max(parseInt(page, 10) || 1, 1);
    const limitCap = 100;
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), limitCap);
    const skip     = (pageNum - 1) * limitNum;

    // --- Búsqueda por folio (6 chars al final), ignora fechas ---
    if (folio && /^[A-Za-z0-9]{6}$/.test(folio)) {
      const regex = new RegExp(`${folio}$`);
      const filtroFolio = {
        ...(farmaciaId ? { farmacia: farmaciaId } : {}),
        ...(estado ? { estado } : {}),
        folio: { $regex: regex },
      };

      const pedido = await Pedido.findOne(filtroFolio)
        .populate('cliente', 'nombre totalMonedero telefono')
        .populate('usuarioPidio', 'nombre')
        .populate('usuarioSurtio', 'nombre')
        .populate('usuarioCancelo', 'nombre')
        .lean();

      const total = pedido ? 1 : 0;
      const pages = total ? 1 : 0;

      // Resumen local (1 registro)
      const resumen = calcularResumenLocal(pedido ? [pedido] : []);
      return res.status(200).json({
        paginacion: {
          page: total ? 1 : 0,
          limit: total ? 1 : 0,
          total,
          pages,
          hasPrev: false,
          hasNext: false,
        },
        pedidos: pedido ? [pedido] : [],
        resumen,
      });
    }

    // --- Validación de descripción mínima (si aplica) ---
    if (descripcion && descripcionMinima === 'true' && String(descripcion).length < 5) {
      return res.status(407).json({ mensaje: 'La descripción al menos debe tener 5 caracteres' });
    }

    // --- Filtro base (campos directos del pedido) ---
    const baseMatch = {};
    if (estado) baseMatch.estado = estado;
    if (farmaciaId && Types.ObjectId.isValid(farmaciaId)) baseMatch.farmacia = new Types.ObjectId(farmaciaId);

    const r = dayRangeUtc(fechaInicio, fechaFin);
    if (r) baseMatch.fechaPedido = { $gte: r.gte, $lt: r.lt };

    if (descripcion) {
      baseMatch.descripcion = { $regex: new RegExp(String(descripcion), 'i') };
    }
    // Si SOLO pide cliente null (sin nombre), lo podemos aplicar aquí
    if (clienteNull === 'true' && !clienteNombre) {
      baseMatch.cliente = null;
    }

    // --- Mapeo de sort ---
    const sortMap = {
      'cliente.nombre': 'clienteInfo.nombre',
      'clienteNombre':  'clienteInfo.nombre', // alias
      'descripcion':    'descripcion',
      'estado':         'estado',
      'fechaPedido':    'fechaPedido',
      'costo':          'costo',
      'total':          'total',
      'aCuenta':        'aCuenta',
      'resta':          'resta',
    };
    const dir = (String(sortDir).toLowerCase() === 'asc') ? 1 : -1;
    const sortField = sortMap[sortBy] || null;

    // --- Pipeline con $lookup para cliente y usuarios (soporta filtro por nombre y sort) ---
    const pipeline = [
      { $match: baseMatch },

      // Cliente (para filtrar por nombre y proyectar datos)
      {
        $lookup: {
          from: 'clientes',
          let: { cliId: '$cliente' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$cliId'] } } },
            { $project: { nombre: 1, totalMonedero: 1, telefono: 1 } },
          ],
          as: 'clienteInfo',
        },
      },
      { $addFields: { clienteInfo: { $arrayElemAt: ['$clienteInfo', 0] } } },

      // Si combina clienteNombre + clienteNull=true => OR entre nombre y null
      ...(clienteNombre || clienteNull === 'true'
        ? [{
            $match: (clienteNombre && clienteNull === 'true')
              ? {
                  $or: [
                    { cliente: null },
                    { 'clienteInfo.nombre': { $regex: new RegExp(String(clienteNombre), 'i') } },
                  ],
                }
              : (clienteNombre
                  ? { 'clienteInfo.nombre': { $regex: new RegExp(String(clienteNombre), 'i') } }
                  : { cliente: null } // (ya se aplicó arriba si no hay nombre; repetir aquí es inocuo)
                ),
          }]
        : []),

      // Usuarios (mantener misma forma que populate para .nombre)
      {
        $lookup: {
          from: 'usuarios',
          localField: 'usuarioPidio',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'usuarioPidioInfo',
        },
      },
      { $addFields: { usuarioPidioInfo: { $arrayElemAt: ['$usuarioPidioInfo', 0] } } },

      {
        $lookup: {
          from: 'usuarios',
          localField: 'usuarioSurtio',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'usuarioSurtioInfo',
        },
      },
      { $addFields: { usuarioSurtioInfo: { $arrayElemAt: ['$usuarioSurtioInfo', 0] } } },

      {
        $lookup: {
          from: 'usuarios',
          localField: 'usuarioCancelo',
          foreignField: '_id',
          pipeline: [{ $project: { nombre: 1 } }],
          as: 'usuarioCanceloInfo',
        },
      },
      { $addFields: { usuarioCanceloInfo: { $arrayElemAt: ['$usuarioCanceloInfo', 0] } } },

      // Campos calculados para sort y resumen
      {
        $addFields: {
          resta: { $ifNull: ['$resta', 0] },
          efectivo: { $ifNull: ['$pagoACuenta.efectivo', 0] },
          tarjeta: { $ifNull: ['$pagoACuenta.tarjeta', 0] },
          transferencia: { $ifNull: ['$pagoACuenta.transferencia', 0] },
          vale:          { $ifNull: ['$pagoACuenta.vale', 0] },

          efectivoResta:      { $ifNull: ['$pagoResta.efectivo', 0] },
          tarjetaResta:       { $ifNull: ['$pagoResta.tarjeta', 0] },
          transferenciaResta: { $ifNull: ['$pagoResta.transferencia', 0] },
          valeResta:          { $ifNull: ['$pagoResta.vale', 0] },
        },
      },

      // Ordenamiento
      ...(sortField
        ? [{ $sort: { [sortField]: dir, _id: 1 } }] // _id como tie-breaker estable
        : [{ $sort: { fechaPedido: -1, createdAt: -1 } }]),
      
      // Facetas: rows paginadas, conteo y resumen
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                folio: 1,
                estado: 1,
                descripcion: 1,
                fechaPedido: 1,
                costo: 1,
                total: 1,
                aCuenta: 1,
                resta: 1,
                pagoACuenta: 1,
                pagoResta: 1,
                farmacia: 1,
                // cliente (forma similar a populate)
                cliente: {
                  $cond: [
                    { $ifNull: ['$cliente', false] },
                    {
                      _id: '$cliente',
                      nombre: '$clienteInfo.nombre',
                      totalMonedero: '$clienteInfo.totalMonedero',
                      telefono: '$clienteInfo.telefono',
                    },
                    null,
                  ],
                },
                usuarioPidio: {
                  $cond: [
                    { $ifNull: ['$usuarioPidio', false] },
                    { _id: '$usuarioPidio', nombre: '$usuarioPidioInfo.nombre' },
                    null,
                  ],
                },
                usuarioSurtio: {
                  $cond: [
                    { $ifNull: ['$usuarioSurtio', false] },
                    { _id: '$usuarioSurtio', nombre: '$usuarioSurtioInfo.nombre' },
                    null,
                  ],
                },
                usuarioCancelo: {
                  $cond: [
                    { $ifNull: ['$usuarioCancelo', false] },
                    { _id: '$usuarioCancelo', nombre: '$usuarioCanceloInfo.nombre' },
                    null,
                  ],
                },
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
          porEstado: [
            {
              $group: {
                _id: '$estado',
                conteo: { $sum: 1 },
                total: { $sum: { $ifNull: ['$total', 0] } },
                aCuenta: { $sum: { $ifNull: ['$aCuenta', 0] } },
                saldo: { $sum: '$resta' },
              },
            },
            { $project: { _id: 0, estado: '$_id', conteo: 1, total: 1, aCuenta: 1, saldo: 1 } },
            { $sort: { total: -1 } },
          ],
          generales: [
            {
              $group: {
                _id: null,
                conteo: { $sum: 1 },
                total: { $sum: { $ifNull: ['$total', 0] } },
                aCuenta: { $sum: { $ifNull: ['$aCuenta', 0] } },
                resta:         { $sum: '$resta' },
                saldo: { $sum: '$resta' },
                efectivo: { $sum: '$efectivo' },
                tarjeta: { $sum: '$tarjeta' },
                transferencia: { $sum: '$transferencia' },
                vale:          { $sum: '$vale' },

                efectivoResta:      { $sum: '$efectivoResta' },
                tarjetaResta:       { $sum: '$tarjetaResta' },
                transferenciaResta: { $sum: '$transferenciaResta' },
                valeResta:          { $sum: '$valeResta' },

                costo:         { $sum: { $ifNull: ['$costo', 0] } },
              },
            },
            { $project: { _id: 0 } },
          ],
        },
      },
    ];

    // Collation para sort de strings (español, case/accents-insensitive)
    const agg = await Pedido.aggregate(pipeline).collation({ locale: 'es', strength: 1 });
    const facet = agg?.[0] || { rows: [], totalCount: [], porEstado: [], generales: [] };

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
      pedidos: facet.rows || [],
      resumen: {
        generales: facet.generales?.[0] || resumenVacio().generales,  // 👈 usa tu helper
        porEstado: facet.porEstado || [],
      },
    });
  } catch (error) {
    console.error('Error al obtener pedidos', error);
    return res.status(500).json({ mensaje: 'Error al consultar pedidos' });
  }
};

function resumenVacio() {
  return {
    generales: {
      conteo: 0,
      total: 0,
      aCuenta: 0,
      resta: 0,
      saldo: 0,
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
      vale: 0,
      efectivoResta: 0, tarjetaResta: 0, transferenciaResta: 0, valeResta: 0,
      costo: 0,
    },
    porEstado: [],
  };
}

function calcularResumenLocal(pedidos = []) {
  if (!pedidos.length) return resumenVacio();

  let g = {
    conteo: 0, total: 0, aCuenta: 0, resta: 0, saldo: 0,
    efectivo: 0, tarjeta: 0, transferencia: 0, vale: 0,
    efectivoResta: 0, tarjetaResta: 0, transferenciaResta: 0, valeResta: 0,
    costo: 0,
  };

    const porEstadoMap = new Map();

  for (const p of pedidos) {
    const total = +(p.total ?? 0);
    const aCuenta = +(p.aCuenta ?? 0);
    const saldo = total - aCuenta;
    const resta = +(p.resta ?? (total - aCuenta));
    const ac = p.pagoACuenta || {};
    const re = p.pagoResta || {};

    g.conteo++;
    g.total += total;
    g.aCuenta += aCuenta;
    g.resta += resta;  // alias
    g.saldo += resta;  // compat
    // anticipo
    g.efectivo      += +(ac.efectivo ?? 0);
    g.tarjeta       += +(ac.tarjeta ?? 0);
    g.transferencia += +(ac.transferencia ?? 0);
    g.vale          += +(ac.vale ?? 0);
    // resta
    g.efectivoResta      += +(re.efectivo ?? 0);
    g.tarjetaResta       += +(re.tarjeta ?? 0);
    g.transferenciaResta += +(re.transferencia ?? 0);
    g.valeResta          += +(re.vale ?? 0);
    // otros
    g.costo += +(p.costo ?? 0);

    const est = p.estado || 'SIN_ESTADO';
    const cur = porEstadoMap.get(est) || { estado: est, conteo: 0, total: 0, aCuenta: 0, saldo: 0 };
    cur.conteo++; cur.total += total; cur.aCuenta += aCuenta; cur.saldo += saldo;
    porEstadoMap.set(est, cur);
  }

  return {
    generales: g,
    porEstado: Array.from(porEstadoMap.values()).sort((a, b) => b.total - a.total),
  };
}

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

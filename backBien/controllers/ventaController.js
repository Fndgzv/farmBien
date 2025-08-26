// backBien/controllers/ventaController.js
const { DateTime } = require('luxon');
const { Types } = require('mongoose');
const Venta = require("../models/Venta");
const Producto = require("../models/Producto");
const Cliente = require("../models/Cliente");
const InventarioFarmacia = require("../models/InventarioFarmacia");
const generarFolioUnico = require('../utils/generarFolioUnico').default;

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

// Dinero seguro en centavos
const toNumber = (v) => Number.isFinite(+v) ? +v : 0;
const toCents  = (n) => Math.round(toNumber(n) * 100);
const fromCents = (c) => c / 100;

// ¿El descuento efectivo es < 25%? (sin flotantes)
const descuentoMenorQue25 = (precioBase, precioFinal) => {
  const baseC  = toCents(precioBase);
  const finalC = toCents(precioFinal);
  const descC  = baseC - finalC;              // descuento en centavos
  const umbral = Math.round(baseC * 25 / 100); // 25% del precio base (en centavos)
  return descC < umbral; // estrictamente menor que 25%
};

const crearVenta = async (req, res) => {
    try {
        const {
            folio,
            clienteId,
            productos,
            aplicaInapam,
            efectivo = 0,
            tarjeta = 0,
            transferencia = 0,
            importeVale = 0,
            farmacia,
        } = req.body;

        let folioFinal = folio;

        if (!folioFinal || await Venta.exists({ folio: folioFinal })) {
            folioFinal = await generarFolioUnico(Venta, {
                prefijo: 'FB',
                incluirDia: true
            });
        }

        const usuario = req.usuario;

        if (!['admin', 'empleado'].includes(usuario.rol)) {
            return res.status(403).json({ mensaje: 'Solo administradores o empleados pueden realizar ventas' });
        }

        // comprobar que el importeVale pueda pagarse con el monedero del cliente
        const cliente = clienteId ? await Cliente.findById(clienteId) : null;

        if (cliente && importeVale > cliente.totalMonedero) {
            return res.status(405).json({ mensaje: `** Fondos insuficientes en el monedero, solo cuentas con: ${cliente.totalMonedero} **` });
        }

        if (!cliente && importeVale > 0) {
            return res.status(406).json({ mensaje: `** Usted aún no cuenta con monedero electrónico **` });
        }

        const esCliente = cliente ? true : false;   // determninar si es un cliente

        let totalVenta = 0;
        let totalDescuento = 0;
        let cantidadDeProductos = 0;

        let totalPalmonedero = 0;
        const productosProcesados = [];

        const farmaciaId = farmacia;
        let i = 0;

        const ahora = soloFecha(new Date());  // fecha de hoy
        const diaSemana = ahora.getDay(); // Número del día de la semana      

        for (const item of productos) {

            const productoDB = await Producto.findById(item.producto);
            if (!productoDB) continue;

            const inventario = await InventarioFarmacia.findOne({
                producto: productoDB._id,
                farmacia: farmaciaId
            });

            if (!inventario || inventario.existencia < item.cantidad) {
                return res.status(400).json({ mensaje: `** No hay suficiente stock en la farmacia para ${productoDB.nombre} **` });
            }

            const precioBase = inventario.precioVenta;  // Tomo el precio de la farmacia ---
            const costoUnitario = Number(productoDB.costo ?? 0);
            if (!Number.isFinite(costoUnitario)) {
                console.warn(`[VENTA] Producto ${productoDB._id} (${productoDB.nombre}) sin costo válido. Se usará 0.`);
            }
            let palmonedero = 0;
            let descuentoRenglon = 0;
            let precioFinal = precioBase;
            let promoAplicada = "";
            let cadDesc = "";
            const clienteInapam = aplicaInapam === true;

            let fechaIni = soloFecha(new Date(ahora));
            let fechaFin = soloFecha(new Date(ahora));

            // determinar cantidad requerida
            if (
                productoDB.promoCantidadRequerida &&
                soloFecha(productoDB.inicioPromoCantidad) <= soloFecha(ahora) &&
                soloFecha(productoDB.finPromoCantidad) >= soloFecha(ahora)
            ) {

                descuentoRenglon = 0;
                precioFinal = precioBase;
                palmonedero = 0;
                promoAplicada = '';
                cadDesc = '';

                if (item.cantidad >= productoDB.promoCantidadRequerida - 1) {
                    promoAplicada = `${getEtiquetaPromo(productoDB.promoCantidadRequerida)}`;
                }

                if (item.precio === 0) {
                    descuentoRenglon = precioBase;
                    precioFinal = 0;
                    cadDesc = '100%';
                    promoAplicada = `${getEtiquetaPromo(productoDB.promoCantidadRequerida)}-Gratis`;
                }

                if (clienteInapam && productoDB.descuentoINAPAM && item.precio > 0) {
                    descuentoRenglon = (precioFinal * 5) / 100;
                    precioFinal = precioFinal - descuentoRenglon;
                    promoAplicada = `${promoAplicada}-INAPAM`;
                    cadDesc = '5%'
                }
            } else {
                //determinar los campos de descuento x dia y el porcentaje de descuento
                let descuentoXDia = 0;
                let aplica2xCiento = false;
                let descuento = 0;

                switch (diaSemana) {
                    case 0:
                        fechaIni = productoDB?.promoDomingo?.inicio ?? null;
                        fechaFin = productoDB?.promoDomingo?.fin ?? null;
                        descuentoXDia = productoDB?.promoDomingo?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoDomingo?.monedero ?? null;

                        break;
                    case 1:
                        fechaIni = productoDB?.promoLunes?.inicio ?? null;
                        fechaFin = productoDB?.promoLunes?.fin ?? null;
                        descuentoXDia = productoDB?.promoLunes?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoLunes?.monedero ?? null;
                        break;
                    case 2:
                        fechaIni = productoDB?.promoMartes?.inicio ?? null;
                        fechaFin = productoDB?.promoMartes?.fin ?? null;
                        descuentoXDia = productoDB?.promoMartes?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoMartes?.monedero ?? null;
                        break;
                    case 3:
                        fechaIni = productoDB?.promoMiercoles?.inicio ?? null;
                        fechaFin = productoDB?.promoMiercoles?.fin ?? null;
                        descuentoXDia = productoDB?.promoMiercoles?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoMiercoles?.monedero ?? null;
                        break;
                    case 4:
                        fechaIni = productoDB?.promoJueves?.inicio ?? null;
                        fechaFin = productoDB?.promoJueves?.fin ?? null;
                        descuentoXDia = productoDB?.promoJueves?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoJueves?.monedero ?? null;
                        break;
                    case 5:
                        fechaIni = productoDB?.promoViernes?.inicio ?? null;
                        fechaFin = productoDB?.promoViernes?.fin ?? null;
                        descuentoXDia = productoDB?.promoViernes?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoViernes?.monedero ?? null;
                        break;
                    case 6:
                        fechaIni = productoDB?.promoSabado?.inicio ?? null;
                        fechaFin = productoDB?.promoSabado?.fin ?? null;
                        descuentoXDia = productoDB?.promoSabado?.porcentaje ?? null;
                        aplica2xCiento = productoDB?.promoSabado?.monedero ?? null;
                        break;
                    default:
                        descuentoXDia = 0;
                }

                if (!descuentoXDia) {
                    fechaIni = soloFecha(new Date(ahora));
                    // sumamos 5 dias a la fecha inicial de la promo para que no aplique
                    fechaIni.setDate(fechaIni.getDate() + 5);
                }

                if (soloFecha(fechaIni) <= soloFecha(ahora) && soloFecha(fechaFin) >= soloFecha(ahora)) {
                    precioFinal = precioBase * (1 - descuentoXDia / 100);
                    descuentoRenglon = precioBase - precioFinal;
                    cadDesc = `${descuentoXDia}%`;
                    promoAplicada = getNombreDia(diaSemana);
                    palmonedero = 0;
                    if (esCliente && aplica2xCiento &&
                        !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
                    ) {
                        palmonedero = precioFinal * 0.02;
                    }
                }

                if (productoDB.promoDeTemporada && productoDB.promoDeTemporada.inicio && productoDB.promoDeTemporada.fin) {
                    if (soloFecha(productoDB.promoDeTemporada.inicio) <= soloFecha(ahora) &&
                        soloFecha(productoDB.promoDeTemporada.fin) >= soloFecha(ahora)) {
                        let precioFinalB = precioBase * (1 - productoDB.promoDeTemporada.porcentaje / 100);
                        if (precioFinalB < precioFinal) {
                            precioFinal = precioFinalB;
                            descuentoRenglon = precioBase - precioFinal;
                            cadDesc = `${productoDB.promoDeTemporada.porcentaje}%`;
                            promoAplicada = 'Temporada';
                            palmonedero = 0;
                            if (esCliente && productoDB.promoDeTemporada.monedero === true &&
                                !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
                            ) {
                                palmonedero = precioFinal * 0.02;
                            }
                        }
                    }
                }

                descuento = (precioBase - precioFinal) / precioBase * 100;    // calcular el % de descuento aplicado

                /*                 if (descuentoRenglon >= 0) {
                                    if (clienteInapam && productoDB.descuentoINAPAM && descuento < 25) {
                                        precioFinal = precioFinal * 0.95;
                                        descuentoRenglon = precioBase - precioFinal;
                                        promoAplicada += `-INAPAM`;
                                        cadDesc += ` + 5%`;
                                    }
                                } else if (clienteInapam && productoDB.descuentoINAPAM && descuento < 25) {
                                    precioFinal = precioBase * 0.95;
                                    descuentoRenglon = precioBase - precioFinal;
                                    promoAplicada = `INAPAM`;
                                    cadDesc = `5%`;
                                } */

                const puedeSumarInapam = clienteInapam && productoDB.descuentoINAPAM && descuentoMenorQue25(precioBase, precioFinal);

                if (descuentoRenglon >= 0) {
                    if (puedeSumarInapam) {
                        precioFinal = precioFinal * 0.95;
                        descuentoRenglon = precioBase - precioFinal;
                        promoAplicada = `${promoAplicada ? promoAplicada + '-' : ''}INAPAM`;
                        cadDesc = cadDesc ? (cadDesc + ' + 5%') : '5%';
                    }
                } else if (puedeSumarInapam) {
                    precioFinal = precioBase * 0.95;
                    descuentoRenglon = precioBase - precioFinal;
                    promoAplicada = `INAPAM`;
                    cadDesc = `5%`;
                }
            }

            promoAplicada = limpiarPromocion(promoAplicada); // quitar guión inicial si existe.         

            if (promoAplicada === '' && esCliente &&
                !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')) {
                promoAplicada = 'Cliente';
                palmonedero = precioFinal * 0.02;
            }

            if (promoAplicada === 'INAPAM' && esCliente &&
                !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')) {
                promoAplicada = 'INAPAM-Cliente';
                palmonedero = precioFinal * 0.02;
            }

            if (promoAplicada === '') promoAplicada = 'Ninguno';

            const descuentoTotalRenglon = descuentoRenglon * item.cantidad;
            const total = precioFinal * item.cantidad;
            totalVenta += total;
            totalDescuento += descuentoTotalRenglon;
            cantidadDeProductos += item.cantidad;
            palmonedero = palmonedero * item.cantidad;
            totalPalmonedero += palmonedero;

            inventario.existencia -= item.cantidad;
            await inventario.save();    // actualizamos inventario

            productosProcesados.push({
                producto: productoDB._id,
                categoria: productoDB.categoria,
                cantidad: item.cantidad,
                precio: precioFinal,
                totalRen: total,
                descuento: descuentoTotalRenglon,
                monederoCliente: palmonedero,
                precioOriginal: precioBase,
                costo: costoUnitario,
                iva: item.iva || 0,
                tipoDescuento: promoAplicada,
                cadenaDescuento: cadDesc,
                lotes: []
            });
            i++;
        }  /* fin ciclo de recorrido producto por producto */


        const sumaPagos = parseFloat(efectivo) + parseFloat(tarjeta) + parseFloat(transferencia) + parseFloat(importeVale);


        // Fuerza números (si te llegó null desde el front, no heredas null)
        const efectivoN = toNumber(efectivo);
        const tarjetaN = toNumber(tarjeta);
        const transferenciaN = toNumber(transferencia);
        const valeN = toNumber(importeVale);

        // Compara en centavos (exactitud de 1 centavo)
        const sumaPagosCents = toCents(efectivoN) + toCents(tarjetaN) + toCents(transferenciaN) + toCents(valeN);
        const totalVentaCents = toCents(totalVenta);

        // Permite diferencia de ±1 centavo por seguridad (si quieres exacto, usa ===)
        const iguales = Math.abs(sumaPagosCents - totalVentaCents) <= 1;

        if (!iguales) {
            return res.status(400).json({
                mensaje: `La suma de pagos (${fromCents(sumaPagosCents).toFixed(2)}) no coincide con el total (${fromCents(totalVentaCents).toFixed(2)}).`
            });
        }


        /* if (Math.abs(sumaPagos - totalVenta) > 0.019) {
            return res.status(400).json({ mensaje: 'La suma de efectivo y otras formas de pago no coincide con el total de la venta.' });
        } */

        const venta = new Venta({
            farmacia: farmaciaId,
            cliente: clienteId || null,
            usuario: usuario.id,
            productos: productosProcesados,
            cantidadProductos: cantidadDeProductos,
            total: totalVenta,
            totalDescuento,
            totalMonederoCliente: totalPalmonedero,
            formaPago: {
                efectivoN,
                tarjetaN,
                transferenciaN,
                vale: valeN
            },
            fecha: new Date(),
            folio: folioFinal
        });

        await venta.save();

        if (cliente) {
            let motivo = null;
            if (totalPalmonedero > 0) motivo = 'Premio';
            if (totalPalmonedero > 0 && importeVale > 0) motivo = 'Premio-Pago venta';
            if (totalPalmonedero <= 0 && importeVale > 0) motivo = 'Pago venta';
            cliente.historialCompras.push({ venta: venta._id });
            const actual = Number.isFinite(cliente.totalMonedero)
                ? cliente.totalMonedero : 0;
            cliente.monedero.push({
                fechaUso: new Date(),
                montoIngreso: totalPalmonedero,
                montoEgreso: importeVale,
                motivo,
                farmaciaUso: farmaciaId
            });
            cliente.totalMonedero = actual + totalPalmonedero - importeVale;

            await cliente.save();
        }

        res.status(201).json({ mensaje: 'Venta realizada con éxito', venta });
    } catch (error) {
        console.error('Error al crear venta:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor', error });
    }
};

function soloFecha(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getEtiquetaPromo(valor) {
    if (valor === 2) return '2x1';
    if (valor === 3) return '3x2';
    if (valor === 4) return '4x3';
    return 'Promo';
}

function getNombreDia(num) {
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][num];
}

function limpiarPromocion(promo) {
    const str = (promo || '').toString();
    return str.startsWith('-') ? str.slice(1) : str;
}

// Convierte 'YYYY-MM-DD' a UTC [gte, lt). Si faltan ambas fechas => hoy local.
function dayRangeUtcFromQuery(fechaInicial, fechaFinal) {
    if (!fechaInicial && !fechaFinal) {
        const startLocal = DateTime.now().setZone(ZONE).startOf('day');
        const endExLocal = startLocal.plus({ days: 1 });
        return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
    }

    const iniStr = (fechaInicial || fechaFinal).slice(0, 10);
    const finStr = (fechaFinal || fechaInicial).slice(0, 10);

    let startLocal = DateTime.fromISO(iniStr, { zone: ZONE }).startOf('day');
    let endExLocal = DateTime.fromISO(finStr, { zone: ZONE }).plus({ days: 1 }).startOf('day');

    // corrige si el usuario invierte el rango
    if (endExLocal < startLocal) {
        const tmp = startLocal;
        startLocal = endExLocal.minus({ days: 1 });
        endExLocal = tmp.plus({ days: 1 });
    }
    return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

const consultarVentas = async (req, res) => {
    try {
        const {
            farmaciaId,
            fechaInicial,
            fechaFinal,
            clienteId,
            usuarioId,
            totalDesde,
            totalHasta,
            page = 1,
            limit = 50,
        } = req.query;

        // 1) Rango de fechas robusto (local MX → UTC half-open)
        const { gte, lt } = dayRangeUtcFromQuery(fechaInicial, fechaFinal);

        // 2) Filtro base (find: Mongoose sí castea)
        const filtro = { fecha: { $gte: gte, $lt: lt } };
        if (farmaciaId) filtro.farmacia = farmaciaId;
        if (clienteId) filtro.cliente = clienteId;
        if (usuarioId) filtro.usuario = usuarioId;

        // 3) Filtro por total
        const tDesde = totalDesde !== undefined && totalDesde !== '' ? Number(totalDesde) : null;
        const tHasta = totalHasta !== undefined && totalHasta !== '' ? Number(totalHasta) : null;
        if (!Number.isNaN(tDesde) || !Number.isNaN(tHasta)) {
            filtro.total = {};
            if (tDesde !== null && !Number.isNaN(tDesde)) filtro.total.$gte = tDesde;
            if (tHasta !== null && !Number.isNaN(tHasta)) filtro.total.$lte = tHasta;
            if (Object.keys(filtro.total).length === 0) delete filtro.total;
        }

        // 4) Validación de ObjectId
        const invalidId =
            (farmaciaId && !Types.ObjectId.isValid(farmaciaId)) ||
            (clienteId && !Types.ObjectId.isValid(clienteId)) ||
            (usuarioId && !Types.ObjectId.isValid(usuarioId));
        if (invalidId) {
            return res.status(400).json({ ok: false, mensaje: 'Algún ID es inválido' });
        }

        // 5) Paginación
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        // 6) $match para aggregate (aquí sí casteamos ids manualmente)
        const matchAgg = { fecha: { $gte: gte, $lt: lt } };
        if (farmaciaId) matchAgg.farmacia = new Types.ObjectId(farmaciaId);
        if (clienteId) matchAgg.cliente = new Types.ObjectId(clienteId);
        if (usuarioId) matchAgg.usuario = new Types.ObjectId(usuarioId);
        if (filtro.total) matchAgg.total = filtro.total;

        // 7) Consultas en paralelo
        const [ventasDocs, totalRegistros, sumaTotales] = await Promise.all([
            Venta.find(filtro)
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate('farmacia', 'nombre')
                .populate('cliente', 'nombre telefono')
                .populate('usuario', 'nombre')
                // para mostrar el detalle expandible con nombre/cb:
                .populate('productos.producto', 'nombre codigoBarras'),

            Venta.countDocuments(filtro),

            Venta.aggregate([
                { $match: matchAgg },
                { $group: { _id: null, suma: { $sum: '$total' } } },
            ]),
        ]);

        // 8) Calcula costo/utilidad por venta
        const ventas = ventasDocs.map(doc => {
            const o = doc.toObject ? doc.toObject() : doc;
            const prods = Array.isArray(o.productos) ? o.productos : [];
            const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

            const costo = prods.reduce(
                (acc, p) => acc + toNum(p?.costo) * toNum(p?.cantidad),
                0
            );
            const utilidad = toNum(o.total) - costo;

            // agrega ambos nombres de campo para no tocar el front
            return {
                ...o,
                _costo: Number(costo.toFixed(2)),
                _utilidad: Number(utilidad.toFixed(2)),
                costoCalculado: Number(costo.toFixed(2)),
                utilidadCalculada: Number(utilidad.toFixed(2)),
            };
        });

        const sumaTotal = sumaTotales?.[0]?.suma || 0;

        res.json({
            ok: true,
            filtrosAplicados: {
                farmaciaId: farmaciaId || null,
                clienteId: clienteId || null,
                usuarioId: usuarioId || null,
                fechaInicial: gte, // UTC
                fechaFinal: lt,  // UTC (límite exclusivo)
                totalDesde: tDesde,
                totalHasta: tHasta,
            },
            paginacion: {
                page: pageNum,
                limit: limitNum,
                totalRegistros,
                totalPaginas: Math.ceil(totalRegistros / limitNum),
            },
            resumen: {
                sumaTotalFiltro: sumaTotal,
            },
            ventas,
        });
    } catch (error) {
        console.error('Error en consultarVentas:', error);
        res.status(500).json({ ok: false, mensaje: 'Error al consultar ventas.' });
    }
};

module.exports = { consultarVentas };



module.exports = {
    crearVenta,
    consultarVentas
};

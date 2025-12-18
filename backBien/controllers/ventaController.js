// backBien/controllers/ventaController.js
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const Venta = require("../models/Venta");
const Producto = require("../models/Producto");
const Cliente = require("../models/Cliente");
const InventarioFarmacia = require("../models/InventarioFarmacia");

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

// Centavos
const toNumber = (v) => Number.isFinite(+v) ? +v : 0;
const toCents = (n) => Math.round(toNumber(n) * 100);
const fromCents = (c) => c / 100;

const descuentoMenorQue25 = (precioBase, precioFinal) => {
  const baseC = toCents(precioBase);
  const finalC = toCents(precioFinal);
  if (baseC <= 0) return false;                 // evita divisiones/umbral inválidos
  const descC = Math.max(0, baseC - finalC);    // no permitir negativos
  const umbral = Math.round(baseC * 25 / 100);
  return descC < umbral;
};

// ====== FECHAS EN CDMX ======
const hoyMxDT = () => DateTime.now().setZone(ZONE).startOf('day'); // Luxon DateTime

// Convierte Date o string a DateTime (CDMX, a las 00:00)
function toMxStart(val) {
  if (!val) return null;
  // Si ya es Date JS que viene de Mongo
  if (val instanceof Date) {
    return DateTime.fromJSDate(val, { zone: 'utc' }).setZone(ZONE).startOf('day');
  }
  // Si es string ISO/aaaa-mm-dd/dd-mm-aaaa
  const s = String(val);
  // ISO (aaaa-mm-dd o similar)
  let dt = DateTime.fromISO(s, { zone: ZONE, setZone: true });
  if (dt.isValid) return dt.startOf('day');
  // dd/mm/aaaa
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    dt = DateTime.fromObject({ day: +m[1], month: +m[2], year: +m[3] }, { zone: ZONE });
    if (dt.isValid) return dt.startOf('day');
  }
  // fallback
  const js = new Date(s);
  return isNaN(js.getTime())
    ? null
    : DateTime.fromJSDate(js, { zone: 'utc' }).setZone(ZONE).startOf('day');
}

// ¿hoy está dentro del rango [ini..fin] en CDMX?
function enRangoHoyMx(iniDT, finDT, hoyDT) {
  const h = hoyDT.toMillis();
  if (iniDT && finDT) return iniDT.toMillis() <= h && h <= finDT.toMillis();
  if (iniDT) return iniDT.toMillis() <= h;
  if (finDT) return h <= finDT.toMillis();
  return true; // sin fechas => válido
}

function enRangoHoy(ini, fin, hoy) {
  if (ini && fin) return ini <= hoy && hoy <= fin;
  if (ini && !fin) return ini <= hoy;
  if (!ini && fin) return hoy <= fin;
  return true; // sin fechas => válido
}


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

/*     if (!folioFinal || await Venta.exists({ folio: folioFinal })) {
      folioFinal = await generarFolioUnico(Venta, {
        prefijo: 'FB',
        incluirDia: true
      });
    } */

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

    const hoyDT = hoyMxDT();                     // Luxon DateTime a 00:00 CDMX
    const ahora = hoyDT.toJSDate();             // por si algo tuyo aún usa Date
    const diaSemana = (hoyDT.weekday === 7) ? 0 : hoyDT.weekday;
    // weekday: 1=Lun..7=Dom → convertimos a 0=Dom..6=Sáb


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

      const iniCant = toMxStart(productoDB.inicioPromoCantidad);
      const finCant = toMxStart(productoDB.finPromoCantidad);
      const activaCant = enRangoHoyMx(iniCant, finCant, hoyDT);
      if (productoDB.promoCantidadRequerida && activaCant) {

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
        // === Descuento por DÍA ===
        //const hoy = soloFecha(new Date());
        let porcentajeDia = 0;
        let monederoDia = false;
        let iniDia = null;
        let finDia = null;

        switch (diaSemana) {
          case 1: // Lunes
            porcentajeDia = Number(productoDB?.promoLunes?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoLunes?.monedero);
            iniDia = toMxStart(productoDB?.promoLunes?.inicio);
            finDia = toMxStart(productoDB?.promoLunes?.fin);
            break;
          case 2: // Martes
            porcentajeDia = Number(productoDB?.promoMartes?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoMartes?.monedero);
            iniDia = toMxStart(productoDB?.promoMartes?.inicio);
            finDia = toMxStart(productoDB?.promoMartes?.fin);
            break;
          case 3: // Miércoles
            porcentajeDia = Number(productoDB?.promoMiercoles?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoMiercoles?.monedero);
            iniDia = toMxStart(productoDB?.promoMiercoles?.inicio);
            finDia = toMxStart(productoDB?.promoMiercoles?.fin);
            break;
          case 4: // Jueves
            porcentajeDia = Number(productoDB?.promoJueves?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoJueves?.monedero);
            iniDia = toMxStart(productoDB?.promoJueves?.inicio);
            finDia = toMxStart(productoDB?.promoJueves?.fin);
            break;
          case 5: // Viernes
            porcentajeDia = Number(productoDB?.promoViernes?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoViernes?.monedero);
            iniDia = toMxStart(productoDB?.promoViernes?.inicio);
            finDia = toMxStart(productoDB?.promoViernes?.fin);
            break;
          case 6: // Sábado
            porcentajeDia = Number(productoDB?.promoSabado?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoSabado?.monedero);
            iniDia = toMxStart(productoDB?.promoSabado?.inicio);
            finDia = toMxStart(productoDB?.promoSabado?.fin);
            break;
          case 0: // Domingo
            porcentajeDia = Number(productoDB?.promoDomingo?.porcentaje || 0);
            monederoDia = !!(productoDB?.promoDomingo?.monedero);
            iniDia = toMxStart(productoDB?.promoDomingo?.inicio);
            finDia = toMxStart(productoDB?.promoDomingo?.fin);
            break;
        }

        const activoHoy = porcentajeDia > 0 && enRangoHoy(iniDia, finDia, hoyDT);

        if (activoHoy) {
          const precioFinalDia = precioBase * (1 - porcentajeDia / 100);
          const descRenglonDia = precioBase - precioFinalDia;

          precioFinal = precioFinalDia;
          descuentoRenglon = descRenglonDia;
          cadDesc = `${porcentajeDia}%`;
          promoAplicada = getNombreDia(diaSemana);
          palmonedero = 0;

          if (
            esCliente && monederoDia &&
            !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
          ) {
            palmonedero = precioFinal * 0.02;
          }
        }
        if (productoDB.promoDeTemporada && productoDB.promoDeTemporada.inicio && productoDB.promoDeTemporada.fin) {
          const iniTemp = toMxStart(productoDB.promoDeTemporada.inicio);
          const finTemp = toMxStart(productoDB.promoDeTemporada.fin);
          if (iniTemp && finTemp && enRangoHoyMx(iniTemp, finTemp, hoyDT)) {
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
        efectivo: efectivoN,
        tarjeta: tarjetaN,
        transferencia: transferenciaN,
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

// Convierte 'YYYY-MM-DD' (o ausencia) a rango UTC [gte, lt) según CDMX.
function dayRangeUtcFromQuery(fechaInicial, fechaFinal) {
  // Si no mandan nada → HOY (CDMX)
  if (!fechaInicial && !fechaFinal) {
    const startLocal = DateTime.now().setZone(ZONE).startOf('day');
    const endExLocal = startLocal.plus({ days: 1 });
    return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
  }

  // Normaliza entradas a 'YYYY-MM-DD' y crea DateTime en CDMX
  const norm = (s) => String(s).slice(0, 10);
  const startLocal = DateTime.fromISO(norm(fechaInicial || fechaFinal), { zone: ZONE }).startOf('day');
  const endExLocal = DateTime.fromISO(norm(fechaFinal || fechaInicial), { zone: ZONE }).startOf('day').plus({ days: 1 });

  if (!startLocal.isValid || !endExLocal.isValid) {
    throw new Error('Fecha inválida (usa YYYY-MM-DD)');
  }

  // Corrige si vienen invertidas
  const s = startLocal <= endExLocal.minus({ days: 1 }) ? startLocal : endExLocal.minus({ days: 1 });
  const e = startLocal <= endExLocal.minus({ days: 1 }) ? endExLocal : startLocal.plus({ days: 1 });

  return { gte: s.toUTC().toJSDate(), lt: e.toUTC().toJSDate() };
}

// helper seguro para castear ids
function castId(id) {
  return (id && mongoose.isValidObjectId(id)) ? mongoose.Types.ObjectId(id) : undefined;
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
      limit = 20,
    } = req.query;

    // 1) Rango de fechas robusto
    const { gte, lt } = dayRangeUtcFromQuery(fechaInicial, fechaFinal);

    // 2) Filtro base (find)
    const filtro = { fecha: { $gte: gte, $lt: lt } };
    if (farmaciaId) filtro.farmacia = farmaciaId;
    if (clienteId)  filtro.cliente  = clienteId;
    if (usuarioId)  filtro.usuario  = usuarioId;

    // 3) Filtro por total
    const tDesde = totalDesde !== undefined && totalDesde !== '' ? Number(totalDesde) : null;
    const tHasta = totalHasta !== undefined && totalHasta !== '' ? Number(totalHasta) : null;
    if (!Number.isNaN(tDesde) || !Number.isNaN(tHasta)) {
      filtro.total = {};
      if (tDesde !== null && !Number.isNaN(tDesde)) filtro.total.$gte = tDesde;
      if (tHasta !== null && !Number.isNaN(tHasta)) filtro.total.$lte = tHasta;
      if (Object.keys(filtro.total).length === 0) delete filtro.total;
    }

    // 4) Validación de ObjectId (si vienen definidos)
    const invalidId =
      (farmaciaId && !mongoose.isValidObjectId(farmaciaId)) ||
      (clienteId  && !mongoose.isValidObjectId(clienteId))  ||
      (usuarioId  && !mongoose.isValidObjectId(usuarioId));
    if (invalidId) {
      return res.status(400).json({ ok: false, mensaje: 'Algún ID es inválido' });
    }

    // 5) Paginación
    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // 6) $match para aggregate (ids casteados con helper)
    const matchAgg = { fecha: { $gte: gte, $lt: lt } };
    const farmaciaOid = castId(farmaciaId);
    const clienteOid  = castId(clienteId);
    const usuarioOid  = castId(usuarioId);
    if (farmaciaOid) matchAgg.farmacia = farmaciaOid;
    if (clienteOid)  matchAgg.cliente  = clienteOid;
    if (usuarioOid)  matchAgg.usuario  = usuarioOid;
    if (filtro.total) matchAgg.total   = filtro.total;

    // 7) Consultas en paralelo
    const [ventasDocs, totalRegistros, sumasAgg] = await Promise.all([
      Venta.find(filtro)
        .sort({ fecha: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('farmacia', 'nombre')
        .populate('cliente', 'nombre telefono')
        .populate('usuario', 'nombre')
        .populate('productos.producto', 'nombre codigoBarras'),

      Venta.countDocuments(filtro),

      Venta.aggregate([
        { $match: matchAgg },
        {
          $addFields: {
            costoVenta: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$productos', []] },
                  as: 'p',
                  in: {
                    $multiply: [
                      { $ifNull: ['$$p.costo', 0] },
                      { $ifNull: ['$$p.cantidad', 0] }
                    ]
                  }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            sumaCantidadProductos: { $sum: { $ifNull: ['$cantidadProductos', 0] } },
            sumaTotalDescuento: { $sum: { $ifNull: ['$totalDescuento', 0] } },
            sumaTotalMonederoCliente: { $sum: { $ifNull: ['$totalMonederoCliente', 0] } },
            sumaCosto: { $sum: { $ifNull: ['$costoVenta', 0] } },
            sumaTotal: { $sum: { $ifNull: ['$total', 0] } },
          }
        },
        {
          $project: {
            _id: 0,
            sumaCantidadProductos: 1,
            sumaTotalDescuento: 1,
            sumaTotalMonederoCliente: 1,
            sumaCosto: 1,
            sumaTotal: 1,
            sumaUtilidad: { $subtract: ['$sumaTotal', '$sumaCosto'] }
          }
        }
      ]),
    ]);

    // 8) Cálculos por venta…
    const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const ventas = ventasDocs.map(doc => {
      const o = doc.toObject ? doc.toObject() : doc;
      const prods = Array.isArray(o.productos) ? o.productos : [];
      const costo = prods.reduce((acc, p) => acc + toNum(p?.costo) * toNum(p?.cantidad), 0);
      const utilidad = toNum(o.total) - costo;
      return {
        ...o,
        _costo: Number(costo.toFixed(2)),
        _utilidad: Number(utilidad.toFixed(2)),
        costoCalculado: Number(costo.toFixed(2)),
        utilidadCalculada: Number(utilidad.toFixed(2)),
      };
    });

    const sums = sumasAgg?.[0] || {
      sumaCantidadProductos: 0,
      sumaTotalDescuento: 0,
      sumaTotalMonederoCliente: 0,
      sumaCosto: 0,
      sumaTotal: 0,
      sumaUtilidad: 0,
    };

    return res.json({
      ok: true,
      filtrosAplicados: {
        farmaciaId: farmaciaId || null,
        clienteId:  clienteId  || null,
        usuarioId:  usuarioId  || null,
        fechaInicial: gte,
        fechaFinal:   lt,
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
        sumaTotalFiltro: sums.sumaTotal,
        sumaCantidadProductos: sums.sumaCantidadProductos,
        sumaTotalDescuento: sums.sumaTotalDescuento,
        sumaTotalMonederoCliente: sums.sumaTotalMonederoCliente,
        sumaCosto: Number((sums.sumaCosto ?? 0).toFixed(2)),
        sumaUtilidad: Number((sums.sumaUtilidad ?? 0).toFixed(2)),
      },
      ventas,
    });
  } catch (error) {
    console.error('[consultarVentas][ERROR]:', error);
    return res.status(500).json({
      ok: false,
      mensaje: error?.message || 'Error al consultar ventas.',
    });
  }
};

module.exports = {
  crearVenta,
  consultarVentas
};

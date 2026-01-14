// backBien/controllers/ventaController.js
const { DateTime } = require('luxon');
const mongoose = require('mongoose');

const Venta = require("../models/Venta");
const Cliente = require("../models/Cliente");
const InventarioFarmacia = require("../models/InventarioFarmacia");
const FichaConsultorio = require("../models/FichaConsultorio");

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

// ===================== Helpers centavos =====================
const toNumber = (v) => Number.isFinite(+v) ? +v : 0;
const toCents = (n) => Math.round(toNumber(n) * 100);
const fromCents = (c) => c / 100;

const descuentoMenorQue25 = (precioBase, precioFinal) => {
  const baseC = toCents(precioBase);
  const finalC = toCents(precioFinal);
  if (baseC <= 0) return false;
  const descC = Math.max(0, baseC - finalC);
  const umbral = Math.round(baseC * 25 / 100);
  return descC < umbral;
};

// ===================== Fechas CDMX =====================
const hoyMxDT = () => DateTime.now().setZone(ZONE).startOf('day');

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

function toMxStart(val) {
  if (!val) return null;

  // ✅ Trata como "fecha" (YYYY-MM-DD), no como instante (UTC)
  const isoDate = (val instanceof Date)
    ? DateTime.fromJSDate(val, { zone: 'utc' }).toISODate()
    : String(val).slice(0, 10);

  const dt = DateTime.fromISO(isoDate, { zone: ZONE });
  return dt.isValid ? dt.startOf('day') : null;
}

function toMxEnd(val) {
  const dt = toMxStart(val);
  return dt ? dt.endOf('day') : null; // ✅ incluye todo el día
}

function enRangoHoyMx(iniDT, finDT, hoyDT) {
  const h = hoyDT.toMillis();
  if (iniDT && finDT) return iniDT.toMillis() <= h && h <= finDT.toMillis();
  if (iniDT) return iniDT.toMillis() <= h;
  if (finDT) return h <= finDT.toMillis();
  return true;
}

// ===================== Promos helpers =====================
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

// ===================== calcular precio/promos (NO cantidad) =====================
function calcUnitNoCantidad({
  precioBase,
  productoDB,
  promoSrc,
  hoyDT,
  diaSemana,
  esCliente,
  clienteInapam
}) {
  // defaults
  let precioFinal = Number(precioBase || 0);
  let descuentoUnit = 0;
  let palmonederoUnit = 0;
  let promoAplicada = '';
  let cadDesc = '';

  // ===== Descuento por día =====
  let porcentajeDia = 0;
  let monederoDia = false;
  let iniDia = null;
  let finDia = null;

  switch (diaSemana) {
    case 1:
      porcentajeDia = Number(promoSrc?.promoLunes?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoLunes?.monedero;
      iniDia = toMxStart(promoSrc?.promoLunes?.inicio);
      finDia = toMxStart(promoSrc?.promoLunes?.fin);
      break;
    case 2:
      porcentajeDia = Number(promoSrc?.promoMartes?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoMartes?.monedero;
      iniDia = toMxStart(promoSrc?.promoMartes?.inicio);
      finDia = toMxStart(promoSrc?.promoMartes?.fin);
      break;
    case 3:
      porcentajeDia = Number(promoSrc?.promoMiercoles?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoMiercoles?.monedero;
      iniDia = toMxStart(promoSrc?.promoMiercoles?.inicio);
      finDia = toMxStart(promoSrc?.promoMiercoles?.fin);
      break;
    case 4:
      porcentajeDia = Number(promoSrc?.promoJueves?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoJueves?.monedero;
      iniDia = toMxStart(promoSrc?.promoJueves?.inicio);
      finDia = toMxStart(promoSrc?.promoJueves?.fin);
      break;
    case 5:
      porcentajeDia = Number(promoSrc?.promoViernes?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoViernes?.monedero;
      iniDia = toMxStart(promoSrc?.promoViernes?.inicio);
      finDia = toMxStart(promoSrc?.promoViernes?.fin);
      break;
    case 6:
      porcentajeDia = Number(promoSrc?.promoSabado?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoSabado?.monedero;
      iniDia = toMxStart(promoSrc?.promoSabado?.inicio);
      finDia = toMxStart(promoSrc?.promoSabado?.fin);
      break;
    case 0:
      porcentajeDia = Number(promoSrc?.promoDomingo?.porcentaje || 0);
      monederoDia = !!promoSrc?.promoDomingo?.monedero;
      iniDia = toMxStart(promoSrc?.promoDomingo?.inicio);
      finDia = toMxStart(promoSrc?.promoDomingo?.fin);
      break;
  }

  const activoHoy = porcentajeDia > 0 && enRangoHoyMx(iniDia, finDia, hoyDT);

  if (activoHoy) {
    const precioFinalDia = precioBase * (1 - porcentajeDia / 100);
    const descUnitDia = precioBase - precioFinalDia;

    precioFinal = precioFinalDia;
    descuentoUnit = descUnitDia;
    cadDesc = `${porcentajeDia}%`;
    promoAplicada = getNombreDia(diaSemana);
    palmonederoUnit = 0;

    if (
      esCliente && monederoDia &&
      !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
    ) {
      palmonederoUnit = precioFinal * 0.02;
    }
  }

  // ===== Temporada =====
  if (promoSrc?.promoDeTemporada?.inicio && promoSrc?.promoDeTemporada?.fin) {
    const iniTemp = toMxStart(promoSrc.promoDeTemporada.inicio);
    const finTemp = toMxStart(promoSrc.promoDeTemporada.fin);

    if (iniTemp && finTemp && enRangoHoyMx(iniTemp, finTemp, hoyDT)) {
      const pTemp = Number(promoSrc?.promoDeTemporada?.porcentaje || 0);
      const precioFinalTemp = precioBase * (1 - pTemp / 100);

      if (precioFinalTemp < precioFinal) {
        precioFinal = precioFinalTemp;
        descuentoUnit = precioBase - precioFinal;
        cadDesc = `${pTemp}%`;
        promoAplicada = 'Temporada';
        palmonederoUnit = 0;

        if (
          esCliente && promoSrc.promoDeTemporada.monedero === true &&
          !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
        ) {
          palmonederoUnit = precioFinal * 0.02;
        }
      }
    }
  }

  // ===== INAPAM (regla 25%) =====
  const puedeSumarInapam =
    clienteInapam &&
    promoSrc.descuentoINAPAM &&
    descuentoMenorQue25(precioBase, precioFinal);

  // Nota: aquí descuentoUnit siempre es >= 0 (porque lo calculamos como base - final cuando aplica)
  if (puedeSumarInapam) {
    precioFinal = precioFinal * 0.95;
    descuentoUnit = precioBase - precioFinal;
    promoAplicada = `${promoAplicada ? promoAplicada + '-' : ''}INAPAM`;
    cadDesc = cadDesc ? (cadDesc + ' + 5%') : '5%';
  }

  promoAplicada = limpiarPromocion(promoAplicada);

  // ===== Cliente (2% monedero) si no hubo promo =====
  if (
    promoAplicada === '' && esCliente &&
    !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
  ) {
    promoAplicada = 'Cliente';
    palmonederoUnit = precioFinal * 0.02;
  }

  if (
    promoAplicada === 'INAPAM' && esCliente &&
    !(productoDB.categoria === 'Recargas' || productoDB.categoria === 'Servicio Médico')
  ) {
    promoAplicada = 'INAPAM-Cliente';
    palmonederoUnit = precioFinal * 0.02;
  }

  if (promoAplicada === '') promoAplicada = 'Ninguno';

  return { precioFinal, descuentoUnit, palmonederoUnit, promoAplicada, cadDesc };
}

// --- IDs (opcional) ---
const ID_CONSULTA = '68a5385d788fb0150b6a7097';           // Consulta Médica
const ID_CONSULTA_FS = '68d16e447da87183e5778112';         // Consulta Médica Fin de Semana

// --- Códigos de barras (por si prefieres esta vía) ---
const CB_CONSULTA = '5656565656561';
const CB_CONSULTA_FS = '151562325423';

// Normalizador ya lo tienes como `norm`
const esConsultaMedica = (prod) => {
  const id = String(prod?._id || '');
  const cb = String(prod?.codigoBarras || '');
  const nombre = norm(prod?.nombre);

  return id === ID_CONSULTA
    || cb === CB_CONSULTA
    || nombre === 'consulta medica';
};

const esConsultaMedicaFinSemana = (prod) => {
  const id = String(prod?._id || '');
  const cb = String(prod?.codigoBarras || '');
  const nombre = norm(prod?.nombre);

  return id === ID_CONSULTA_FS
    || cb === CB_CONSULTA_FS
    || nombre === 'consulta medica fin de semana';
};

// ===================== crearVenta =====================
const crearVenta = async (req, res) => {
  try {
    const {
      folio,
      clienteId,
      fichaId,
      productos,
      aplicaInapam,
      efectivo = 0,
      tarjeta = 0,
      transferencia = 0,
      importeVale = 0,
      farmacia
    } = req.body;

    if (!farmacia || !mongoose.isValidObjectId(farmacia)) {
      return res.status(400).json({ mensaje: 'Falta farmacia válida' });
    }
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ mensaje: 'No hay productos para vender' });
    }

    if (fichaId && !mongoose.isValidObjectId(fichaId)) {
      return res.status(400).json({ mensaje: 'fichaId inválido' });
    }

    const usuario = req.usuario;
    if (!['admin', 'empleado'].includes(usuario?.rol)) {
      return res.status(403).json({ mensaje: 'Solo administradores o empleados pueden realizar ventas' });
    }

    // Cliente y monedero
    const cliente = clienteId ? await Cliente.findById(clienteId) : null;

    const valeReq = toNumber(importeVale);
    const monederoActual = cliente ? toNumber(cliente.totalMonedero) : 0;

    if (cliente && valeReq > monederoActual) {
      return res.status(405).json({
        mensaje: `** Fondos insuficientes en el monedero, solo cuentas con: ${monederoActual} **`
      });
    }
    if (!cliente && valeReq > 0) {
      return res.status(406).json({ mensaje: `** Usted aún no cuenta con monedero electrónico **` });
    }

    const esCliente = !!cliente;
    const farmaciaId = farmacia;
    const folioFinal = folio;

    let totalVenta = 0;
    let totalDescuento = 0;
    let cantidadDeProductos = 0;
    let totalPalmonedero = 0;

    const productosProcesados = [];

    // ===================== PREFETCH inventario (1 query) =====================
    const productoIds = productos.map(p => String(p.producto)).filter(Boolean);
    const uniqueIds = [...new Set(productoIds)];

    if (uniqueIds.some(id => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ mensaje: 'Hay productos con ID inválido' });
    }

    // qtyByProd incluye cobrados + gratis (para stock)
    const qtyByProd = new Map();
    // qtyFreePayload por producto (solo para validar que coincida)
    const qtyFreePayload = new Map();

    for (const it of productos) {
      const pid = String(it.producto || '');
      const q = Math.max(0, toNumber(it.cantidad));
      if (!pid || q <= 0) continue;

      qtyByProd.set(pid, (qtyByProd.get(pid) || 0) + q);

      const precioPayload = toNumber(it.precio);
      if (precioPayload === 0) {
        qtyFreePayload.set(pid, (qtyFreePayload.get(pid) || 0) + q);
      }
    }

    const inventariosDocs = await InventarioFarmacia.find({
      farmacia: farmaciaId,
      producto: { $in: uniqueIds }
    })
      .populate("producto", "nombre costo categoria iva")
      .exec();

    const invByProd = new Map();
    for (const inv of inventariosDocs) {
      invByProd.set(String(inv.producto?._id || inv.producto), inv);
    }


    // Valida faltantes y stock total por producto
    for (const pid of uniqueIds) {
      const inv = invByProd.get(pid);
      if (!inv || !inv.producto) {
        return res.status(400).json({ mensaje: `** El producto ${pid} no existe en inventario de la farmacia **` });
      }
      const reqQty = qtyByProd.get(pid) || 0;
      if (toNumber(inv.existencia) < reqQty) {
        return res.status(400).json({
          mensaje: `** No hay suficiente stock en la farmacia para ${inv.producto.nombre} (req: ${reqQty}, disp: ${inv.existencia}) **`
        });
      }
    }

    const hoyDT = hoyMxDT();
    const diaSemana = (hoyDT.weekday === 7) ? 0 : hoyDT.weekday; // 0=Dom..6=Sáb
    const clienteInapam = aplicaInapam === true;

    // --- Determinar si es fin de semana ---
    const esFinDeSemana = (diaSemana === 6 || diaSemana === 0); // 6 = Sábado, 0 = Domingo

    // --- Validación dura: prohíbe capturar la consulta incorrecta según el día ---
    for (const pid of uniqueIds) {
      const inv = invByProd.get(pid);
      if (!inv || !inv.producto) continue;

      const p = inv.producto;

      // Si es fin de semana: NO permitir "Consulta Médica" (normal)
      if (esFinDeSemana && esConsultaMedica(p) && !esConsultaMedicaFinSemana(p)) {
        return res.status(400).json({
          mensaje: 'Hoy es fin de semana. Debe usarse "Consulta Médica Fin de Semana".'
        });
      }

      // Si es entre semana: NO permitir "Consulta Médica Fin de Semana"
      if (!esFinDeSemana && esConsultaMedicaFinSemana(p)) {
        return res.status(400).json({
          mensaje: 'Hoy es entre semana. Debe usarse "Consulta Médica".'
        });
      }
    }

    // === bandera calculada: ¿hay al menos un producto de categoría "Servicio Médico"?
    let esVentaDeServicio = false;
    if (fichaId) esVentaDeServicio = true;

    // ===================== Procesar por PRODUCTO =====================
    for (const pid of uniqueIds) {
      const inventario = invByProd.get(pid);
      if (!inventario || !inventario.producto) continue;

      const productoDB = inventario.producto; // nombre/costo/categoria/iva
      const promoSrc = inventario;            // promos en InventarioFarmacia
      const precioBase = toNumber(inventario.precioVenta);
      const costoUnitario = toNumber(productoDB.costo);

      // 👉 marca la bandera aquí (ya existe productoDB)
      if (norm(productoDB.categoria) === 'servicio medico') {
        esVentaDeServicio = true;
      }

      const totalQty = qtyByProd.get(pid) || 0;
      if (totalQty <= 0) continue;

      // ---- promo por cantidad (2x1/3x2/4x3) ----
      const req = Math.max(0, Math.trunc(toNumber(promoSrc.promoCantidadRequerida)));
      const iniCant = toMxStart(promoSrc.inicioPromoCantidad);
      const finCant = toMxEnd(promoSrc.finPromoCantidad);
      const activaCant = req >= 2 && enRangoHoyMx(iniCant, finCant, hoyDT);

      let freeAllowed = 0;
      if (activaCant) {
        freeAllowed = Math.floor(totalQty / req);
      }

      const freePayload = qtyFreePayload.get(pid) || 0;

      if (freePayload > 0 || freeAllowed > 0) {
        if (!activaCant) {
          return res.status(400).json({
            mensaje: `** El producto ${productoDB.nombre} trae renglón gratis pero la promo por cantidad no está activa **`
          });
        }
        if (freePayload !== freeAllowed) {
          return res.status(400).json({
            mensaje: `** Promo cantidad inválida en ${productoDB.nombre}: gratis enviados=${freePayload}, gratis esperados=${freeAllowed} **`
          });
        }
      }

      const paidQty = Math.max(0, totalQty - freeAllowed);

      // --------- Renglón COBRADO ----------
      if (paidQty > 0) {
        let precioFinalUnit = precioBase;
        let descuentoUnit = 0;
        let palmonederoUnit = 0;
        let promoAplicada = '';
        let cadDesc = '';

        if (activaCant && freeAllowed > 0) {
          promoAplicada = getEtiquetaPromo(req);
          cadDesc = '';
          palmonederoUnit = 0;

          if (clienteInapam && promoSrc.descuentoINAPAM) {
            const descInapam = precioFinalUnit * 0.05;
            precioFinalUnit = precioFinalUnit - descInapam;
            descuentoUnit = precioBase - precioFinalUnit;
            promoAplicada = `${promoAplicada}-INAPAM`;
            cadDesc = '5%';
          }
        } else {
          const calc = calcUnitNoCantidad({
            precioBase,
            productoDB,
            promoSrc,
            hoyDT,
            diaSemana,
            esCliente,
            clienteInapam
          });
          precioFinalUnit = calc.precioFinal;
          descuentoUnit = calc.descuentoUnit;
          palmonederoUnit = calc.palmonederoUnit;
          promoAplicada = calc.promoAplicada;
          cadDesc = calc.cadDesc;
        }

        promoAplicada = limpiarPromocion(promoAplicada) || 'Ninguno';

        const totalRen = precioFinalUnit * paidQty;
        const descuentoRen = descuentoUnit * paidQty;
        const monederoRen = palmonederoUnit * paidQty;

        totalVenta += totalRen;
        totalDescuento += descuentoRen;
        totalPalmonedero += monederoRen;
        cantidadDeProductos += paidQty;

        productosProcesados.push({
          producto: productoDB._id,
          categoria: productoDB.categoria,
          cantidad: paidQty,
          precio: Number(precioFinalUnit.toFixed(2)),
          totalRen: Number(totalRen.toFixed(2)),
          descuento: Number(descuentoRen.toFixed(2)),
          monederoCliente: Number(monederoRen.toFixed(2)),
          precioOriginal: Number(precioBase.toFixed(2)),
          costo: Number(costoUnitario.toFixed(2)),
          iva: toNumber(productoDB.iva),
          tipoDescuento: promoAplicada,
          cadenaDescuento: cadDesc || '',
          lotes: []
        });
      }

      // --------- Renglón GRATIS ----------
      if (freeAllowed > 0) {
        const descuentoRen = precioBase * freeAllowed;

        totalDescuento += descuentoRen;
        cantidadDeProductos += freeAllowed;

        productosProcesados.push({
          producto: productoDB._id,
          categoria: productoDB.categoria,
          cantidad: freeAllowed,
          precio: 0,
          totalRen: 0,
          descuento: Number(descuentoRen.toFixed(2)),
          monederoCliente: 0,
          precioOriginal: Number(precioBase.toFixed(2)),
          costo: Number(costoUnitario.toFixed(2)),
          iva: toNumber(productoDB.iva),
          tipoDescuento: `${getEtiquetaPromo(req)}-Gratis`,
          cadenaDescuento: '100%',
          lotes: []
        });
      }
    }

    // ===================== Validación pagos =====================
    const efectivoN = toNumber(efectivo);
    const tarjetaN = toNumber(tarjeta);
    const transferenciaN = toNumber(transferencia);
    const valeN = toNumber(importeVale);

    const sumaPagosCents = toCents(efectivoN) + toCents(tarjetaN) + toCents(transferenciaN) + toCents(valeN);
    const totalVentaCents = toCents(totalVenta);

    const iguales = Math.abs(sumaPagosCents - totalVentaCents) <= 1;
    if (!iguales) {
      return res.status(400).json({
        mensaje: `La suma de pagos (${fromCents(sumaPagosCents).toFixed(2)}) no coincide con el total (${fromCents(totalVentaCents).toFixed(2)}).`
      });
    }

    // ===================== Transacción =====================
    const session = await mongoose.startSession();
    let ventaCreada = null;

    try {
      await session.withTransaction(async () => {
        // ✅ 0) Validar ficha dentro de la transacción (si aplica)
        let fichaDoc = null;

        if (fichaId) {
          fichaDoc = await FichaConsultorio.findOne(
            { _id: fichaId, farmaciaId: farmaciaId },
            null,
            { session }
          );

          if (!fichaDoc) throw new Error("FICHA_NO_ENCONTRADA");

          if (fichaDoc.estado !== "EN_COBRO") {
            throw new Error(`FICHA_NO_EN_COBRO:${fichaDoc.estado}`);
          }

          if (fichaDoc.ventaId) throw new Error("FICHA_YA_COBRADA");

          // ✅ opcional (muy recomendable): que la misma caja que la tomó sea quien cobre
          if (fichaDoc.cobroPor && String(fichaDoc.cobroPor) !== String(usuario._id)) {
            throw new Error("FICHA_EN_COBRO_POR_OTRO_USUARIO");
          }
        }

        // 1) Descontar inventario
        const bulkOps = [];
        for (const [pid, qty] of qtyByProd.entries()) {
          if (!qty || qty <= 0) continue;

          const inv = invByProd.get(pid);
          if (!inv) throw new Error(`Inventario no encontrado para producto ${pid}`);

          bulkOps.push({
            updateOne: {
              filter: { _id: inv._id, existencia: { $gte: qty } },
              update: { $inc: { existencia: -qty } },
            }
          });
        }
        if (bulkOps.length) {
          const bulkRes = await InventarioFarmacia.bulkWrite(bulkOps, { ordered: true, session });
          const expected = bulkOps.length;
          const modified = bulkRes.modifiedCount || 0;
          if (modified !== expected) throw new Error("STOCK_INSUFICIENTE_CONCURRENCIA");
        }

        // 2) Guardar venta
        const ventaPayload = {
          farmacia: farmaciaId,
          cliente: clienteId || null,
          usuario: usuario.id,
          productos: productosProcesados,
          cantidadProductos: cantidadDeProductos,
          total: Number(totalVenta.toFixed(2)),
          totalDescuento: Number(totalDescuento.toFixed(2)),
          totalMonederoCliente: Number(totalPalmonedero.toFixed(2)),
          formaPago: { efectivo: efectivoN, tarjeta: tarjetaN, transferencia: transferenciaN, vale: valeN },
          fecha: new Date(),
          folio: folioFinal,
          // 👇 calculado automáticamente
          porServicioMedico: esVentaDeServicio
        };

        const arr = await Venta.create([ventaPayload], { session });
        ventaCreada = arr[0];

        // ✅ 2.1) Cerrar ficha en la misma transacción
        if (fichaId) {
          const upd = await FichaConsultorio.updateOne(
            {
              _id: fichaId,
              farmaciaId: farmaciaId,
              estado: "EN_COBRO",
              ventaId: { $exists: false },
            },
            {
              $set: {
                estado: "ATENDIDA",
                ventaId: ventaCreada._id,
                cobradaAt: new Date(),
                actualizadaPor: usuario._id,
              },
            },
            { session }
          );

          if ((upd.modifiedCount || 0) !== 1) {
            throw new Error("NO_SE_PUDO_CERRAR_FICHA");
          }
        }

        // 3) Monedero
        if (cliente) {
          let motivo = null;
          if (totalPalmonedero > 0) motivo = 'Premio';
          if (totalPalmonedero > 0 && valeN > 0) motivo = 'Premio-Pago venta';
          if (totalPalmonedero <= 0 && valeN > 0) motivo = 'Pago venta';

          cliente.historialCompras.push({ venta: ventaCreada._id });

          const actual = Number.isFinite(cliente.totalMonedero) ? cliente.totalMonedero : 0;
          cliente.monedero.push({
            fechaUso: new Date(),
            montoIngreso: Number(totalPalmonedero.toFixed(2)),
            montoEgreso: Number(valeN.toFixed(2)),
            motivo,
            farmaciaUso: farmaciaId
          });
          cliente.totalMonedero = Number((actual + totalPalmonedero - valeN).toFixed(2));

          await cliente.save({ session });
        }
      });

      return res.status(201).json({ mensaje: 'Venta realizada con éxito', venta: ventaCreada });

    } catch (err) {
      if (String(err.message) === "STOCK_INSUFICIENTE_CONCURRENCIA") {
        return res.status(400).json({ mensaje: "** Ya no hay suficiente stock (venta concurrente). **" });
      }
      if (String(err.message) === "FICHA_NO_ENCONTRADA") {
        return res.status(404).json({ mensaje: "Ficha no encontrada" });
      }
      if (String(err.message).startsWith("FICHA_NO_EN_COBRO:")) {
        const estado = String(err.message).split(":")[1];
        return res.status(400).json({ mensaje: `La ficha no está en cobro (estado: ${estado}).` });
      }
      if (String(err.message) === "FICHA_YA_COBRADA") {
        return res.status(400).json({ mensaje: "La ficha ya fue cobrada anteriormente." });
      }
      if (String(err.message) === "FICHA_EN_COBRO_POR_OTRO_USUARIO") {
        return res.status(409).json({ mensaje: "Esta ficha está en cobro por otro usuario." });
      }
      if (String(err.message) === "NO_SE_PUDO_CERRAR_FICHA") {
        return res.status(409).json({ mensaje: "No se pudo cerrar la ficha (posible concurrencia). Intenta de nuevo." });
      }

      console.error("Error transacción venta:", err);
      return res.status(500).json({ mensaje: "Error interno del servidor", error: err.message });
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error('Error al crear venta:', error);
    return res.status(500).json({ mensaje: 'Error interno del servidor', error });
  }
};

function dayRangeUtcFromQuery(fechaInicial, fechaFinal) {
  if (!fechaInicial && !fechaFinal) {
    const startLocal = DateTime.now().setZone(ZONE).startOf('day');
    const endExLocal = startLocal.plus({ days: 1 });
    return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
  }

  const norm = (s) => String(s).slice(0, 10);
  const startLocal = DateTime.fromISO(norm(fechaInicial || fechaFinal), { zone: ZONE }).startOf('day');
  const endExLocal = DateTime.fromISO(norm(fechaFinal || fechaInicial), { zone: ZONE }).startOf('day').plus({ days: 1 });

  if (!startLocal.isValid || !endExLocal.isValid) throw new Error('Fecha inválida (usa YYYY-MM-DD)');

  const s = startLocal <= endExLocal.minus({ days: 1 }) ? startLocal : endExLocal.minus({ days: 1 });
  const e = startLocal <= endExLocal.minus({ days: 1 }) ? endExLocal : startLocal.plus({ days: 1 });

  return { gte: s.toUTC().toJSDate(), lt: e.toUTC().toJSDate() };
}

function castId(id) {
  return (id && mongoose.isValidObjectId(id)) ? new mongoose.Types.ObjectId(id) : undefined;
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
      porServicioMedico,
    } = req.query;

    const { gte, lt } = dayRangeUtcFromQuery(fechaInicial, fechaFinal);

    const filtro = { fecha: { $gte: gte, $lt: lt } };
    if (farmaciaId) filtro.farmacia = farmaciaId;
    if (clienteId) filtro.cliente = clienteId;
    if (usuarioId) filtro.usuario = usuarioId;

    const tDesde = totalDesde !== undefined && totalDesde !== '' ? Number(totalDesde) : null;
    const tHasta = totalHasta !== undefined && totalHasta !== '' ? Number(totalHasta) : null;
    if (!Number.isNaN(tDesde) || !Number.isNaN(tHasta)) {
      filtro.total = {};
      if (tDesde !== null && !Number.isNaN(tDesde)) filtro.total.$gte = tDesde;
      if (tHasta !== null && !Number.isNaN(tHasta)) filtro.total.$lte = tHasta;
      if (Object.keys(filtro.total).length === 0) delete filtro.total;
    }

    const orNoServicio = [
      { porServicioMedico: { $exists: false } },
      { porServicioMedico: { $eq: false } },
      { porServicioMedico: { $eq: null } },
      { porServicioMedico: { $eq: '' } },
      { porServicioMedico: { $eq: 0 } },
    ];

    if (String(porServicioMedico).toLowerCase() === 'true') {
      filtro.porServicioMedico = true;
    } else if (String(porServicioMedico).toLowerCase() === 'false') {
      // todo lo que NO sea true (incluye false, null y campo ausente)
      filtro.porServicioMedico = { $ne: true };
    }


    const invalidId =
      (farmaciaId && !mongoose.isValidObjectId(farmaciaId)) ||
      (clienteId && !mongoose.isValidObjectId(clienteId)) ||
      (usuarioId && !mongoose.isValidObjectId(usuarioId));
    if (invalidId) {
      return res.status(400).json({ ok: false, mensaje: 'Algún ID es inválido' });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const matchAgg = { fecha: { $gte: gte, $lt: lt } };
    const farmaciaOid = castId(farmaciaId);
    const clienteOid = castId(clienteId);
    const usuarioOid = castId(usuarioId);
    if (farmaciaOid) matchAgg.farmacia = farmaciaOid;
    if (clienteOid) matchAgg.cliente = clienteOid;
    if (usuarioOid) matchAgg.usuario = usuarioOid;
    if (filtro.total) matchAgg.total = filtro.total;

    if (String(porServicioMedico).toLowerCase() === 'true') {
      matchAgg.porServicioMedico = true;
    } else if (String(porServicioMedico).toLowerCase() === 'false') {
      matchAgg.porServicioMedico = { $ne: true };
    }

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

    const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const ventas = ventasDocs.map(doc => {
      const o = doc.toObject ? doc.toObject() : doc;
      const prods = Array.isArray(o.productos) ? o.productos : [];
      const costo = prods.reduce((acc, p) => acc + toNum(p?.costo) * toNum(p?.cantidad), 0);
      const utilidad = toNum(o.total) - costo;
      return {
        ...o,
        porServicioMedico: !!o.porServicioMedico,
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
        clienteId: clienteId || null,
        usuarioId: usuarioId || null,
        fechaInicial: gte,
        fechaFinal: lt,
        totalDesde: tDesde,
        totalHasta: tHasta,
        porServicioMedico:
          (porServicioMedico === undefined ? null : String(porServicioMedico).toLowerCase() === 'true')

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

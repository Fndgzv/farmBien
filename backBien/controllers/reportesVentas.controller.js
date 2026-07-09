const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Venta = require('../models/Venta');
const { dayRangeUtc, ZONE } = require('../utils/fechas');

/* ================== CONSTANTES DE NEGOCIO ================== */
const TZ = ZONE || 'America/Mexico_City';
const CARD_FEE = 0.04;
const CARD_NET = 1 - CARD_FEE;
const ESCALAS_VALIDAS = new Set(['hora', 'dia', 'semana', 'mes', 'anio']);

const DIAS_COMPARACION = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  domingo: 7
};

const MESES_COMPARACION = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
};

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizarTexto = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizarEscala = (escala) => {
  const value = normalizarTexto(escala || 'dia');
  const aliases = {
    ano: 'anio',
    anio: 'anio'
  };
  const normalizada = aliases[value] || value;
  return ESCALAS_VALIDAS.has(normalizada) ? normalizada : 'dia';
};

const parseFechaLocal = (value) =>
  DateTime.fromISO(String(value || '').slice(0, 10), { zone: TZ }).startOf('day');

const ordenarRangoLocal = (desde, hasta) => {
  let inicio = parseFechaLocal(desde);
  let fin = parseFechaLocal(hasta);

  if (!inicio.isValid || !fin.isValid) return { inicio, fin };
  if (fin < inicio) [inicio, fin] = [fin, inicio];
  return { inicio, fin };
};

const fechaKey = (dateTime) => dateTime.toFormat('yyyy-LL-dd');
const mesKey = (dateTime) => dateTime.toFormat('yyyy-LL');

const normalizarComparacion = (escala, rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;

  const raw = String(rawValue).trim();

  if (escala === 'hora') {
    const match = raw.match(/^(\d{1,2})(?::00)?$/);
    const hora = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(hora) || hora < 6 || hora > 22) return null;
    return { tipo: 'hora', valor: hora, escalaGrupo: 'dia' };
  }

  if (escala === 'dia') {
    const numeric = Number(raw);
    const dia = Number.isInteger(numeric)
      ? numeric
      : DIAS_COMPARACION[normalizarTexto(raw)];

    if (!Number.isInteger(dia) || dia < 1 || dia > 7) return null;
    return { tipo: 'dia', valor: dia, escalaGrupo: 'dia' };
  }

  if (escala === 'mes') {
    const numeric = Number(raw);
    const mes = Number.isInteger(numeric)
      ? numeric
      : MESES_COMPARACION[normalizarTexto(raw)];

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
    return { tipo: 'mes', valor: mes, escalaGrupo: 'mes' };
  }

  return null;
};

const buildComparacionMatch = (comparacion) => {
  if (!comparacion) return null;

  if (comparacion.tipo === 'hora') {
    return {
      $match: {
        $expr: {
          $eq: [
            { $hour: { date: '$fecha', timezone: TZ } },
            comparacion.valor
          ]
        }
      }
    };
  }

  if (comparacion.tipo === 'dia') {
    return {
      $match: {
        $expr: {
          $eq: [
            { $isoDayOfWeek: { date: '$fecha', timezone: TZ } },
            comparacion.valor
          ]
        }
      }
    };
  }

  if (comparacion.tipo === 'mes') {
    return {
      $match: {
        $expr: {
          $eq: [
            { $month: { date: '$fecha', timezone: TZ } },
            comparacion.valor
          ]
        }
      }
    };
  }

  return null;
};

const buildPeriodoExpression = (escala) => {
  if (escala === 'semana') {
    return {
      $dateToString: {
        date: {
          $dateFromParts: {
            isoWeekYear: '$_id.isoWeekYear',
            isoWeek: '$_id.isoWeek',
            isoDayOfWeek: 1,
            timezone: TZ
          }
        },
        timezone: TZ,
        format: '%Y-%m-%d'
      }
    };
  }

  return {
    $dateToString: {
      date: '$fecha',
      timezone: TZ,
      format: escala === 'hora'
        ? '%Y-%m-%d %H:00'
        : escala === 'dia'
          ? '%Y-%m-%d'
          : escala === 'mes'
            ? '%Y-%m'
            : '%Y'
    }
  };
};

const normalizarRow = (row) => ({
  ...row,
  ingresos: round2(row?.ingresos),
  egresos: round2(row?.egresos),
  utilidad: round2(row?.utilidad),
  ventas: Number(row?.ventas || 0),
  pedidosMovs: Number(row?.pedidosMovs || 0),
  pedidosUnicos: Number(row?.pedidosUnicos || 0)
});

const generarDias = (desde, hasta, predicate = () => true) => {
  const { inicio, fin } = ordenarRangoLocal(desde, hasta);
  if (!inicio.isValid || !fin.isValid) return [];

  const periodos = [];
  for (let cursor = inicio; cursor <= fin; cursor = cursor.plus({ days: 1 })) {
    if (predicate(cursor)) periodos.push({ periodo: fechaKey(cursor) });
  }
  return periodos;
};

const generarSemanas = (desde, hasta) => {
  const { inicio, fin } = ordenarRangoLocal(desde, hasta);
  if (!inicio.isValid || !fin.isValid) return [];

  const start = inicio.minus({ days: inicio.weekday - 1 }).startOf('day');
  const end = fin.minus({ days: fin.weekday - 1 }).startOf('day');
  const periodos = [];

  for (let cursor = start; cursor <= end; cursor = cursor.plus({ weeks: 1 })) {
    periodos.push({
      periodo: fechaKey(cursor),
      periodoInicio: fechaKey(cursor),
      periodoFin: fechaKey(cursor.plus({ days: 6 }))
    });
  }

  return periodos;
};

const generarMeses = (desde, hasta, mesSeleccionado) => {
  const { inicio, fin } = ordenarRangoLocal(desde, hasta);
  if (!inicio.isValid || !fin.isValid) return [];

  const periodos = [];
  for (
    let cursor = inicio.startOf('month');
    cursor <= fin.startOf('month');
    cursor = cursor.plus({ months: 1 })
  ) {
    if (cursor.month === mesSeleccionado) {
      periodos.push({ periodo: mesKey(cursor) });
    }
  }
  return periodos;
};

const completarPeriodos = (data, escala, comparacion, desde, hasta) => {
  let periodos = null;

  if (escala === 'semana') {
    periodos = generarSemanas(desde, hasta);
  } else if (comparacion?.tipo === 'hora') {
    periodos = generarDias(desde, hasta);
  } else if (comparacion?.tipo === 'dia') {
    periodos = generarDias(desde, hasta, (dateTime) => dateTime.weekday === comparacion.valor);
  } else if (comparacion?.tipo === 'mes') {
    periodos = generarMeses(desde, hasta, comparacion.valor);
  }

  const rows = data.map(normalizarRow);
  if (!periodos) return rows;

  const porPeriodo = new Map(rows.map((row) => [row.periodo, row]));
  return periodos.map((periodo) => normalizarRow({
    ...periodo,
    ...(porPeriodo.get(periodo.periodo) || {})
  }));
};

const calcularPromedios = (data) => {
  const periodos = data.length;
  const total = data.reduce((acc, row) => {
    acc.ventas += Number(row.ventas || 0);
    acc.ingresos += Number(row.ingresos || 0);
    acc.utilidad += Number(row.utilidad || 0);
    return acc;
  }, { ventas: 0, ingresos: 0, utilidad: 0 });

  return {
    periodos,
    ventas: periodos ? round2(total.ventas / periodos) : 0,
    ingresos: periodos ? round2(total.ingresos / periodos) : 0,
    utilidad: periodos ? round2(total.utilidad / periodos) : 0
  };
};

const quiereRespuestaExtendida = (query) => {
  const value = normalizarTexto(query.incluirPromedios || query.extendido || query.formato);
  return value === 'true' || value === '1' || value === 'si' || value === 'extendido';
};

/* ================== GROUP ID DINÁMICO ================== */
const buildGroupId = (escala) => {
  if (escala === 'hora') {
    return {
      year: { $year: { date: '$fecha', timezone: TZ } },
      month: { $month: { date: '$fecha', timezone: TZ } },
      day: { $dayOfMonth: { date: '$fecha', timezone: TZ } },
      hour: { $hour: { date: '$fecha', timezone: TZ } }
    };
  }

  if (escala === 'dia') {
    return {
      year: { $year: { date: '$fecha', timezone: TZ } },
      month: { $month: { date: '$fecha', timezone: TZ } },
      day: { $dayOfMonth: { date: '$fecha', timezone: TZ } }
    };
  }

  if (escala === 'semana') {
    return {
      isoWeekYear: { $isoWeekYear: { date: '$fecha', timezone: TZ } },
      isoWeek: { $isoWeek: { date: '$fecha', timezone: TZ } }
    };
  }

  if (escala === 'mes') {
    return {
      year: { $year: { date: '$fecha', timezone: TZ } },
      month: { $month: { date: '$fecha', timezone: TZ } }
    };
  }

  // año
  return {
    year: { $year: { date: '$fecha', timezone: TZ } }
  };
};

/* ================== CONTROLADOR ================== */
const ingresosPorTiempo = async (req, res) => {
  try {
    const { desde, hasta, farmacia = 'ALL' } = req.query;
    const escala = normalizarEscala(req.query.escala);
    const comparacion = normalizarComparacion(
      escala,
      req.query.comparar ?? req.query.comparativo ?? req.query.compararValor ?? req.query.valorComparacion
    );
    const escalaGrupo = comparacion?.escalaGrupo || escala;

    if (!desde || !hasta) {
      return res.status(400).json({ msg: 'Debe enviar desde y hasta' });
    }

    const { gte, lt } = dayRangeUtc(desde, hasta);

    const matchFarmacia =
      farmacia !== 'ALL'
        ? new mongoose.Types.ObjectId(farmacia)
        : null;

    const groupId = buildGroupId(escalaGrupo);
    const comparacionMatch = buildComparacionMatch(comparacion);

    const pipeline = [

      /* ====================== VENTAS ====================== */
      {
        $match: {
          fecha: { $gte: gte, $lt: lt },
          ...(matchFarmacia && { farmacia: matchFarmacia })
        }
      },
      { $unwind: '$productos' },

      {
        $group: {
          _id: '$_id',
          fecha: { $first: '$fecha' },
          totalVenta: { $first: '$total' },
          vale: { $first: { $ifNull: ['$formaPago.vale', 0] } },
          tarjeta: { $first: { $ifNull: ['$formaPago.tarjeta', 0] } },
          costoVenta: {
            $sum: {
              $multiply: ['$productos.costo', '$productos.cantidad']
            }
          }
        }
      },

      {
        $project: {
          fecha: 1,
          ingreso: {
            $subtract: [
              { $subtract: ['$totalVenta', '$vale'] },
              { $multiply: ['$tarjeta', CARD_FEE] }
            ]
          },
          egreso: '$costoVenta',
          ventas: { $literal: 1 },
          pedidosMovs: { $literal: 0 },
          pedidoId: null
        }
      },

      /* ====================== PEDIDOS ====================== */
      {
        $unionWith: {
          coll: 'pedidos',
          pipeline: [
            {
              $match: {
                // ✅ ignoramos cancelado (neto = 0 y no entra aquí)
                estado: { $in: ['inicial', 'entregado'] },
                ...(matchFarmacia && { farmacia: matchFarmacia })
              }
            },
            // ✅ crear movimientos (1 o 2 por pedido)
            {
              $project: {
                pedidoId: '$_id',
                movimientos: {
                  $concatArrays: [
                    // Movimiento 1: A CUENTA (siempre existe para inicial y entregado)
                    [
                      {
                        fecha: '$fechaPedido',
                        ingreso: {
                          $subtract: [
                            {
                              $add: [
                                { $ifNull: ['$pagoACuenta.efectivo', 0] },
                                { $ifNull: ['$pagoACuenta.transferencia', 0] },
                                { $multiply: [{ $ifNull: ['$pagoACuenta.tarjeta', 0] }, CARD_NET] }
                              ]
                            },
                            { $ifNull: ['$pagoACuenta.vale', 0] } // ✅ vale NO es ingreso real
                          ]
                        },
                        egreso: 0
                      }
                    ],
                    // Movimiento 2: RESTA (solo si entregado)
                    {
                      $cond: [
                        { $eq: ['$estado', 'entregado'] },
                        [
                          {
                            fecha: { $ifNull: ['$fechaEntrega', '$fechaPedido'] },
                            ingreso: {
                              $subtract: [
                                {
                                  $add: [
                                    { $ifNull: ['$pagoResta.efectivo', 0] },
                                    { $ifNull: ['$pagoResta.transferencia', 0] },
                                    { $multiply: [{ $ifNull: ['$pagoResta.tarjeta', 0] }, CARD_NET] }
                                  ]
                                },
                                { $ifNull: ['$pagoResta.vale', 0] } // ✅ vale NO es ingreso real
                              ]
                            },
                            egreso: { $ifNull: ['$costo', 0] } // ✅ costo cuando se entrega
                          }
                        ],
                        []
                      ]
                    }
                  ]
                }
              }
            },
            { $unwind: '$movimientos' },
            {
              $project: {
                fecha: '$movimientos.fecha',
                ingreso: '$movimientos.ingreso',
                egreso: '$movimientos.egreso',
                ventas: { $literal: 0 },
                pedidosMovs: { $literal: 1 },  // ✅ 1 por movimiento
                pedidoId: '$pedidoId'
              }
            },
            // ✅ filtra por rango ya con fecha correcta
            {
              $match: {
                fecha: { $gte: gte, $lt: lt }
              }
            }
          ]
        }
      },

      /* ====================== DEVOLUCIONES ====================== */
      {
        $unionWith: {
          coll: 'devoluciones',
          pipeline: [
            {
              $match: {
                fecha: { $gte: gte, $lt: lt },
                ...(matchFarmacia && { farmacia: matchFarmacia })
              }
            },
            {
              $project: {
                fecha: '$fecha',
                ingreso: { $literal: 0 },
                egreso: '$totalDevuelto',
                ventas: { $literal: 0 },
                pedidosMovs: { $literal: 0 },
                pedidoId: null
              }
            }
          ]
        }
      },

      ...(comparacionMatch ? [comparacionMatch] : []),

      /* ====================== AGRUPACIÓN FINAL ====================== */
      {
        $group: {
          _id: groupId,
          ingresos: { $sum: '$ingreso' },
          egresos: { $sum: '$egreso' },
          ventas: { $sum: '$ventas' },
          pedidosMovs: { $sum: '$pedidosMovs' },
          pedidoIds: { $addToSet: '$pedidoId' },
          fecha: { $min: '$fecha' }
        }
      },

      {
        $project: {
          _id: 0,
          periodo: buildPeriodoExpression(escalaGrupo),
          ingresos: { $round: ['$ingresos', 2] },
          egresos: { $round: ['$egresos', 2] },
          utilidad: { $round: [{ $subtract: ['$ingresos', '$egresos'] }, 2] },
          ventas: 1,
          pedidosMovs: 1,
          pedidosUnicos: {
            $size: { $setDifference: ['$pedidoIds', [null]] }
          }
        }
      },

      { $sort: { periodo: 1 } }
    ];

    const agregada = await Venta.aggregate(pipeline).allowDiskUse(true);
    const data = completarPeriodos(agregada, escala, comparacion, desde, hasta);

    if (!quiereRespuestaExtendida(req.query)) {
      return res.json(data);
    }

    return res.json({
      data,
      promedios: calcularPromedios(data),
      meta: {
        escala,
        escalaGrupo,
        comparacion
      }
    });

  } catch (err) {
    console.error('Error ingresosPorTiempo:', err);
    res.status(500).json({ msg: 'Error al generar reporte financiero' });
  }
};

module.exports = {
  ingresosPorTiempo
};

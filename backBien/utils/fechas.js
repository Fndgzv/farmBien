// backBien/utils/fechas.js
const { DateTime } = require('luxon');

const ZONE = process.env.APP_TZ || 'America/Mexico_City';

// [DEFAULT] últimos 15 días en zona local, convertido a UTC [gte, lt)
function defaultRangeLast15DaysUtc() {
  const endExLocal = DateTime.now().setZone(ZONE).plus({ days: 1 }).startOf('day'); // mañana 00:00 local
  const startLocal = endExLocal.minus({ days: 15 }).startOf('day');
  return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

// Convierte 'YYYY-MM-DD' a rango UTC [gte, lt). Si falta una fecha, usa la otra.
// Si faltan ambas, usa defaultRangeLast15DaysUtc().
function dayRangeUtc(fechaIni, fechaFin) {
  if (!fechaIni && !fechaFin) return defaultRangeLast15DaysUtc();

  const iniStr = (fechaIni || fechaFin).slice(0, 10);
  const finStr = (fechaFin || fechaIni).slice(0, 10);

  let startLocal = DateTime.fromISO(iniStr, { zone: ZONE }).startOf('day');
  let endExLocal = DateTime.fromISO(finStr, { zone: ZONE }).plus({ days: 1 }).startOf('day');

  if (endExLocal < startLocal) {
    const tmp = startLocal;
    startLocal = endExLocal.minus({ days: 1 });
    endExLocal = tmp.plus({ days: 1 });
  }

  return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

// Rango por defecto MTD (1° del mes → hoy) si no mandan fechas
function defaultRangeMonthToTodayUtc() {
  const now = DateTime.now().setZone(ZONE);
  const startLocal = now.startOf('month');
  const endExLocal = now.plus({ days: 1 }).startOf('day'); // mañana 00:00 local (exclusivo)
  return { gte: startLocal.toUTC().toJSDate(), lt: endExLocal.toUTC().toJSDate() };
}

function dayRangeUtcOrMTD(fechaIni, fechaFin) {
  if (!fechaIni && !fechaFin) return defaultRangeMonthToTodayUtc();
  return dayRangeUtc(fechaIni, fechaFin);
}

// Conveniencia: desde req.query (acepta {fechaIni, fechaFin})
function dayRangeUtcFromQuery(fechaIni, fechaFin) {
  const a = fechaIni && String(fechaIni).slice(0, 10);
  const b = fechaFin && String(fechaFin).slice(0, 10);
  return (a || b) ? dayRangeUtc(a, b) : defaultRangeMonthToTodayUtc();
}

module.exports = {
  ZONE,
  dayRangeUtc,
  dayRangeUtcOrMTD,
  dayRangeUtcFromQuery,
  defaultRangeLast15DaysUtc,
  defaultRangeMonthToTodayUtc,
};

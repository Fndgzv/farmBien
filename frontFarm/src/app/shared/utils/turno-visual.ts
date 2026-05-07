const WEEKDAY_CODE_BY_SHORT_EN: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

function parseDateOnly(input: string): { year: number; month: number; day: number } | null {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  return { year, month, day };
}

function getWeekdayCodeFromDateOnly(input: string): number | null {
  const parts = parseDateOnly(input);
  if (!parts) return null;

  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(utcDate.getTime())) return null;

  const jsDay = utcDate.getUTCDay(); // 0=domingo ... 6=sabado
  return jsDay === 0 ? 7 : jsDay; // 1=lunes ... 7=domingo
}

function getWeekdayCodeFromDateTime(input: string, timeZone: string): number | null {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const shortWeekday = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short'
    }).format(date).toUpperCase();

    return WEEKDAY_CODE_BY_SHORT_EN[shortWeekday] ?? null;
  } catch {
    const jsDay = date.getDay(); // 0=domingo ... 6=sabado
    return jsDay === 0 ? 7 : jsDay;
  }
}

function toPositiveConsecutivo(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;

  const intValue = Math.trunc(num);
  if (intValue <= 0) return null;

  return intValue;
}

export function formatearTurnoConsultorioVisual(
  turnoFecha: unknown,
  turnoConsecutivo: unknown,
  options: { prefijo?: string; timeZone?: string } = {}
): string | null {
  const consecutivo = toPositiveConsecutivo(turnoConsecutivo);
  if (!consecutivo) return null;

  const prefijo = String(options.prefijo || 'TC').trim() || 'TC';
  const timeZone = options.timeZone || 'America/Mexico_City';
  const fechaRaw = String(turnoFecha || '').trim();
  if (!fechaRaw) return null;

  const weekdayCode =
    getWeekdayCodeFromDateOnly(fechaRaw) ??
    getWeekdayCodeFromDateTime(fechaRaw, timeZone);

  if (!weekdayCode) return null;

  return `${prefijo}-${weekdayCode}${String(consecutivo).padStart(2, '0')}`;
}


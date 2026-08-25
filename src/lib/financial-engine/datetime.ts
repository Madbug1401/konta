// ============================================================================
// Datas e fusos horários.
//
// [DECISÃO 2 / regra 8 do briefing] Corrige diretamente o bug da auditoria em
// que `new Date().toISOString().slice(0, 10)` calculava "hoje" em UTC, o que
// perto da meia-noite em Cabo Verde (UTC-1) fazia a aplicação "mudar de dia"
// horas antes ou depois da meia-noite real do utilizador.
//
// Regra: toda a função que precisa de "hoje" ou de limites de período
// (início/fim de semana, mês, ano) recebe explicitamente o timezone IANA do
// utilizador (ex: "Atlantic/Cape_Verde") e usa Luxon para o calcular
// corretamente. Nunca usar `new Date()` "nu" para representar um dia local.
// ============================================================================

import { DateTime } from "luxon";

export type ISODate = string; // "YYYY-MM-DD"

/** Timestamp UTC injetável (para testes determinísticos) + timezone do utilizador. */
export function getTodayInTimezone(timezone: string, nowUtc: Date = new Date()): ISODate {
  return DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezone).toISODate() as ISODate;
}

export function daysFromToday(timezone: string, days: number, nowUtc: Date = new Date()): ISODate {
  return (
    DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezone).plus({ days }).toISODate() as ISODate
  );
}

export interface PeriodBounds {
  start: ISODate;
  end: ISODate;
}

export function getMonthBounds(timezone: string, nowUtc: Date = new Date()): PeriodBounds {
  const local = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezone);
  return {
    start: local.startOf("month").toISODate() as ISODate,
    end: local.endOf("month").toISODate() as ISODate,
  };
}

export function getQuarterBounds(timezone: string, nowUtc: Date = new Date()): PeriodBounds {
  const local = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezone);
  return {
    start: local.startOf("quarter").toISODate() as ISODate,
    end: local.endOf("quarter").toISODate() as ISODate,
  };
}

export function getYearBounds(timezone: string, nowUtc: Date = new Date()): PeriodBounds {
  const local = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezone);
  return {
    start: local.startOf("year").toISODate() as ISODate,
    end: local.endOf("year").toISODate() as ISODate,
  };
}

export function getWeekBounds(timezone: string, nowUtc: Date = new Date()): PeriodBounds {
  const local = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezone);
  return {
    start: local.startOf("week").toISODate() as ISODate,
    end: local.endOf("week").toISODate() as ISODate,
  };
}

export function addRecurrenceInterval(
  date: ISODate,
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
  interval: number,
): ISODate {
  const dt = DateTime.fromISO(date);
  const unit =
    frequency === "DAILY"
      ? { days: interval }
      : frequency === "WEEKLY"
        ? { weeks: interval }
        : frequency === "MONTHLY"
          ? { months: interval }
          : { years: interval };
  return dt.plus(unit).toISODate() as ISODate;
}

export function isBeforeOrEqual(a: ISODate, b: ISODate): boolean {
  return a <= b; // seguro para strings YYYY-MM-DD
}

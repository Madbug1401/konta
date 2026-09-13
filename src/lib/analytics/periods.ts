// ============================================================================
// KONTA ANALYTICS — Períodos (Milestone Analytics).
//
// Função pura, sem I/O — mesma filosofia do Financial Engine
// (src/lib/financial-engine/datetime.ts, que já resolve "hoje"/limites de
// mês/ano no timezone do utilizador via Luxon). Este ficheiro só ACRESCENTA
// os presets que a página de Análises e a Konta AI precisam (mês passado,
// últimos N dias, últimos 12 meses, período de comparação) — nunca duplica
// getMonthBounds/getYearBounds/etc., reutiliza-os sempre que servem.
// ============================================================================

import { DateTime } from "luxon";
import { getMonthBounds, getPreviousMonthBounds, getYearBounds, type ISODate, type PeriodBounds } from "@/lib/financial-engine";

export const PERIOD_PRESETS = [
  "this_month",
  "last_month",
  "last_30d",
  "last_90d",
  "this_year",
  "last_year",
  "last_12_months",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const COMPARISON_MODES = ["previous_period", "previous_year", "none"] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export interface PeriodRange extends PeriodBounds {
  /** Rótulo humano, pronto a mostrar — nunca recalculado noutro sítio. */
  label: string;
}

export class InvalidPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPeriodError";
  }
}

// Limite de segurança: nunca deixar um período `custom` cobrir décadas (custo
// de cálculo desnecessário, e nenhuma pergunta financeira real precisa disto).
const MAX_CUSTOM_PERIOD_DAYS = 5 * 366;

const MONTH_LABEL_FORMAT = { month: "long", year: "numeric" } as const;

function formatMonthLabel(dt: DateTime, locale: string): string {
  const label = dt.setLocale(locale).toLocaleString(MONTH_LABEL_FORMAT);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function daysBetween(start: ISODate, end: ISODate): number {
  return Math.round(DateTime.fromISO(end).diff(DateTime.fromISO(start), "days").days) + 1;
}

/**
 * Resolve um preset (ou um intervalo `custom`) num `PeriodRange` concreto,
 * sempre calculado no timezone do utilizador (nunca `new Date()` nu — mesma
 * regra do resto do Financial Engine). `now` é injetável para testes
 * determinísticos, mesmo padrão de `getTodayInTimezone`.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  timezone: string,
  now: Date = new Date(),
  custom?: { from: ISODate; to: ISODate },
): PeriodRange {
  const locale = "pt-CV";
  const nowLocal = DateTime.fromJSDate(now, { zone: "utc" }).setZone(timezone);

  if (preset === "this_month") {
    const bounds = getMonthBounds(timezone, now);
    return { ...bounds, label: formatMonthLabel(nowLocal, locale) };
  }
  if (preset === "last_month") {
    const bounds = getPreviousMonthBounds(timezone, now);
    return { ...bounds, label: formatMonthLabel(nowLocal.minus({ months: 1 }), locale) };
  }
  if (preset === "last_30d") {
    const start = nowLocal.minus({ days: 29 }).toISODate() as ISODate;
    const end = nowLocal.toISODate() as ISODate;
    return { start, end, label: "Últimos 30 dias" };
  }
  if (preset === "last_90d") {
    const start = nowLocal.minus({ days: 89 }).toISODate() as ISODate;
    const end = nowLocal.toISODate() as ISODate;
    return { start, end, label: "Últimos 90 dias" };
  }
  if (preset === "this_year") {
    const bounds = getYearBounds(timezone, now);
    return { ...bounds, label: String(nowLocal.year) };
  }
  if (preset === "last_year") {
    const lastYear = nowLocal.minus({ years: 1 });
    return {
      start: lastYear.startOf("year").toISODate() as ISODate,
      end: lastYear.endOf("year").toISODate() as ISODate,
      label: String(lastYear.year),
    };
  }
  if (preset === "last_12_months") {
    const start = nowLocal.minus({ months: 11 }).startOf("month").toISODate() as ISODate;
    const end = nowLocal.endOf("month").toISODate() as ISODate;
    return { start, end, label: "Últimos 12 meses" };
  }

  // preset === "custom"
  const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  // [Correção — achado de auditoria] `from`/`to` vazios ou mal formados
  // nunca podem chegar ao cálculo de datas abaixo: sem esta validação
  // explícita, `custom.from > custom.to` compara duas strings vazias como
  // "iguais" (nunca lança), e `daysBetween("", "")` produz `NaN` — que
  // também nunca é `> MAX_CUSTOM_PERIOD_DAYS` — resultando num
  // `PeriodRange` vazio e silencioso (`{ start: "", end: "" }`) em vez de um
  // erro claro. Validar o FORMATO aqui, antes de qualquer comparação, é o
  // que fecha essa lacuna.
  if (!custom || !ISO_DATE_PATTERN.test(custom.from) || !ISO_DATE_PATTERN.test(custom.to)) {
    throw new InvalidPeriodError("Período personalizado exige 'from' e 'to' no formato AAAA-MM-DD.");
  }
  if (custom.from > custom.to) throw new InvalidPeriodError("A data inicial não pode ser depois da data final.");
  if (daysBetween(custom.from, custom.to) > MAX_CUSTOM_PERIOD_DAYS) {
    throw new InvalidPeriodError("O período personalizado é demasiado longo.");
  }
  return { start: custom.from, end: custom.to, label: `${custom.from} — ${custom.to}` };
}

function isFullCalendarMonth(start: DateTime, end: DateTime): boolean {
  return start.hasSame(start.startOf("month"), "day") && end.hasSame(start.endOf("month"), "day") && start.hasSame(end, "month");
}

function isFullCalendarYear(start: DateTime, end: DateTime): boolean {
  return start.hasSame(start.startOf("year"), "day") && end.hasSame(start.endOf("year"), "day") && start.year === end.year;
}

/**
 * Deriva o período de comparação a partir de um `PeriodRange` já resolvido.
 *
 * `previous_period` é intencionalmente mais inteligente do que "só recuar N
 * dias": um período que seja exatamente um mês de calendário compara com o
 * MÊS DE CALENDÁRIO anterior inteiro (ex: "Setembro 2026" vs "Agosto 2026",
 * o exemplo dado no pedido — nunca "2 a 31 de Agosto" só porque Setembro tem
 * 30 dias e Agosto 31); um ano de calendário compara com o ano anterior
 * inteiro; qualquer outro intervalo (últimos 30/90 dias, personalizado)
 * usa mesma duração, imediatamente antes. `"none"` devolve `null` — nunca
 * inventa uma comparação que o utilizador/IA não pediu.
 */
export function resolveComparisonPeriod(period: PeriodRange, mode: ComparisonMode): PeriodRange | null {
  if (mode === "none") return null;

  const start = DateTime.fromISO(period.start);
  const end = DateTime.fromISO(period.end);
  const lengthDays = daysBetween(period.start, period.end);

  if (mode === "previous_year") {
    const compStart = start.minus({ years: 1 });
    const compEnd = end.minus({ years: 1 });
    return {
      start: compStart.toISODate() as ISODate,
      end: compEnd.toISODate() as ISODate,
      label: `${period.label} (ano anterior)`,
    };
  }

  // previous_period
  if (isFullCalendarMonth(start, end)) {
    const prev = start.minus({ months: 1 });
    return {
      start: prev.startOf("month").toISODate() as ISODate,
      end: prev.endOf("month").toISODate() as ISODate,
      label: formatMonthLabel(prev, "pt-CV"),
    };
  }
  if (isFullCalendarYear(start, end)) {
    const prev = start.minus({ years: 1 });
    return { start: prev.startOf("year").toISODate() as ISODate, end: prev.endOf("year").toISODate() as ISODate, label: String(prev.year) };
  }

  // Intervalo arbitrário: mesma duração, termina no dia anterior ao início atual.
  const compEnd = start.minus({ days: 1 });
  const compStart = compEnd.minus({ days: lengthDays - 1 });
  return {
    start: compStart.toISODate() as ISODate,
    end: compEnd.toISODate() as ISODate,
    label: "Período anterior",
  };
}

export type Granularity = "day" | "week" | "month";

/** Escolhe automaticamente a granularidade de uma série temporal a partir da duração do período — nunca centenas de pontos diários num período de anos. */
export function autoGranularity(period: PeriodRange): Granularity {
  const days = daysBetween(period.start, period.end);
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

export interface PeriodBucket extends PeriodRange {
  /** Chave estável para agregação (ex: "2026-09" para mês, "2026-09-08" para dia). */
  key: string;
}

/** Parte um período em buckets consecutivos, na granularidade pedida — usado pelas séries temporais de cashflow/tendências. */
export function bucketizePeriod(period: PeriodRange, granularity: Granularity, locale = "pt-CV"): PeriodBucket[] {
  const start = DateTime.fromISO(period.start);
  const end = DateTime.fromISO(period.end);
  const unit = granularity === "day" ? "days" : granularity === "week" ? "weeks" : "months";

  const buckets: PeriodBucket[] = [];
  let cursor = granularity === "month" ? start.startOf("month") : granularity === "week" ? start.startOf("week") : start;

  while (cursor <= end) {
    const bucketEnd = (granularity === "day" ? cursor : cursor.endOf(granularity === "week" ? "week" : "month")).endOf("day");
    const clampedStart = (cursor < start ? start : cursor).toISODate() as ISODate;
    const clampedEnd = (bucketEnd > end ? end : bucketEnd).toISODate() as ISODate;
    const key =
      granularity === "day" ? clampedStart : granularity === "week" ? `${clampedStart}/${clampedEnd}` : cursor.toFormat("yyyy-MM");
    const label =
      granularity === "day"
        ? cursor.setLocale(locale).toFormat("d MMM")
        : granularity === "week"
          ? `${cursor.setLocale(locale).toFormat("d MMM")}–${(bucketEnd > end ? end : bucketEnd).setLocale(locale).toFormat("d MMM")}`
          : formatMonthLabel(cursor, locale);
    buckets.push({ key, start: clampedStart, end: clampedEnd, label });
    cursor = cursor.plus({ [unit]: 1 });
  }
  return buckets;
}

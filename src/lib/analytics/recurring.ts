// ============================================================================
// KONTA ANALYTICS — Recorrências (Milestone Analytics).
//
// Não reimplementa materialização (isso é exclusivo de
// materializeDueOccurrences, src/lib/db/recurring-transactions.ts) — esta
// camada só lê as séries já existentes e normaliza o seu valor para uma
// base "equivalente mensal" (aproximação explícita, documentada, nunca
// apresentada como um número exato) para se poder comparar frequências
// diferentes (diária/semanal/mensal/anual) e medir o peso no orçamento.
// ============================================================================

import { formatMinor, getExpenseTotal, type RecurringTransactionRecord } from "@/lib/financial-engine";
import type { AnalyticsDataset } from "./dataset";
import { bucketizePeriod } from "./periods";
import type { AnalyticsFilters } from "./types";

const AVERAGE_DAYS_PER_MONTH = 30.4375; // 365.25 / 12 — mesma aproximação usada em qualquer normalização financeira "por mês".
const AVERAGE_WEEKS_PER_MONTH = AVERAGE_DAYS_PER_MONTH / 7;

/** Valor mensal equivalente de UMA série — aproximação explícita (ver comentário do ficheiro), nunca um valor "exato" gravado nalgum sítio. */
function monthlyEquivalent(series: RecurringTransactionRecord): number {
  const perOccurrence = Number(series.amountMinor);
  const interval = Math.max(1, series.interval);
  if (series.frequency === "DAILY") return (perOccurrence * AVERAGE_DAYS_PER_MONTH) / interval;
  if (series.frequency === "WEEKLY") return (perOccurrence * AVERAGE_WEEKS_PER_MONTH) / interval;
  if (series.frequency === "MONTHLY") return perOccurrence / interval;
  return perOccurrence / (12 * interval); // YEARLY
}

export interface RecurringItemRow {
  id: string;
  description: string;
  type: RecurringTransactionRecord["type"];
  frequency: RecurringTransactionRecord["frequency"];
  accountName: string;
  amount: string;
  monthlyEquivalent: string;
  nextRunDate: string;
  isActive: boolean;
}

export interface RecurringAnalysis {
  currency: string;
  activeCount: number;
  recurringMonthlyExpenseEquivalent: string;
  recurringMonthlyIncomeEquivalent: string;
  /** % da despesa MENSAL MÉDIA do período que as recorrências ativas representam — `null` sem despesas no período. */
  shareOfMonthlyExpensesPercent: number | null;
  items: RecurringItemRow[];
}

export function getRecurringAnalysis(dataset: AnalyticsDataset, filters: AnalyticsFilters): RecurringAnalysis {
  const { currency, period } = filters;
  const accountsById = new Map(dataset.accounts.map((a) => [a.id, a]));
  const relevant = dataset.recurring.filter((s) => s.currency === currency);
  const active = relevant.filter((s) => s.isActive);

  const recurringMonthlyExpenseEquivalentValue = active.filter((s) => s.type === "EXPENSE").reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  const recurringMonthlyIncomeEquivalentValue = active.filter((s) => s.type === "INCOME").reduce((sum, s) => sum + monthlyEquivalent(s), 0);

  // Despesa mensal MÉDIA do período selecionado — número de buckets mensais
  // reais desse período, nunca fixo em "30 dias" quando o período é mais
  // curto ou mais longo do que isso.
  const monthlyBuckets = bucketizePeriod(period, "month");
  const totalExpenseInPeriod = Number(getExpenseTotal(dataset.transactions, period, currency));
  const averageMonthlyExpense = monthlyBuckets.length > 0 ? totalExpenseInPeriod / monthlyBuckets.length : 0;
  const shareOfMonthlyExpensesPercent = averageMonthlyExpense === 0 ? null : (recurringMonthlyExpenseEquivalentValue / averageMonthlyExpense) * 100;

  const items: RecurringItemRow[] = relevant
    .map((s) => ({
      id: s.id,
      description: s.description,
      type: s.type,
      frequency: s.frequency,
      accountName: accountsById.get(s.accountId)?.name ?? "Conta",
      amount: formatMinor(s.amountMinor, currency),
      monthlyEquivalent: formatMinor(BigInt(Math.round(monthlyEquivalent(s))), currency),
      nextRunDate: s.nextRunDate,
      isActive: s.isActive,
    }))
    .sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1));

  return {
    currency,
    activeCount: active.length,
    recurringMonthlyExpenseEquivalent: formatMinor(BigInt(Math.round(recurringMonthlyExpenseEquivalentValue)), currency),
    recurringMonthlyIncomeEquivalent: formatMinor(BigInt(Math.round(recurringMonthlyIncomeEquivalentValue)), currency),
    shareOfMonthlyExpensesPercent,
    items,
  };
}

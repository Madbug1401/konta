// ============================================================================
// KONTA ANALYTICS — Tendências (Milestone Analytics).
//
// "Tendência" aqui é sempre estatística simples e explicável (secção 38/39
// do pedido: "começar com estatística simples", "evitar afirmar
// causalidade") — nunca ML. Direção = comparação da média da primeira
// metade de uma janela de meses com a média da segunda metade; "estável"
// quando a diferença é pequena de mais para ser um sinal, não só zero exato.
// Reutiliza getIncomeTotal/getExpenseTotal/getCashflow/getNetWorth e
// getCategoryBreakdown (Financial Engine) — nunca um cálculo novo por trás
// da direção.
// ============================================================================

import { getCashflow, getExpenseTotal, getIncomeTotal, getNetWorth } from "@/lib/financial-engine";
import type { TrendDirection } from "./compare";
import type { AnalyticsDataset } from "./dataset";
import { getCategoryAnalysis } from "./categories";
import { bucketizePeriod, type PeriodRange } from "./periods";
import type { AnalyticsFilters } from "./types";

// Diferença mínima entre as duas metades para deixar de ser "estável" — 5%
// é uma escolha explícita, documentada, não um valor mágico escondido.
const STABILITY_THRESHOLD_PERCENT = 5;
const TREND_WINDOW_MONTHS = 6;

function classify(values: number[]): TrendDirection {
  if (values.length < 2) return "flat";
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const first = avg(firstHalf);
  const second = avg(secondHalf);
  if (first === 0) return second === 0 ? "flat" : "up";
  const changePercent = ((second - first) / Math.abs(first)) * 100;
  if (Math.abs(changePercent) < STABILITY_THRESHOLD_PERCENT) return "flat";
  return changePercent > 0 ? "up" : "down";
}

export interface MetricTrend {
  direction: TrendDirection;
  /** Valor de cada mês da janela, em unidade maior (Number) — só para desenhar um mini-gráfico, nunca usado para outro cálculo. */
  series: { label: string; value: number }[];
}

export interface CategoryTrendRow {
  categoryId: string | null;
  categoryName: string;
  changePercent: number;
  direction: TrendDirection;
}

export interface FinancialTrends {
  currency: string;
  windowMonths: number;
  income: MetricTrend;
  expenses: MetricTrend;
  cashflow: MetricTrend;
  netWorth: MetricTrend;
  /** Categorias com maior crescimento/queda entre o período e o período de comparação — `[]` sem comparação pedida. */
  topIncreasingCategories: CategoryTrendRow[];
  topDecreasingCategories: CategoryTrendRow[];
}

function monthlyWindowEnding(end: string, months: number): PeriodRange {
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  start.setUTCDate(1);
  return { start: start.toISOString().slice(0, 10), end, label: `Últimos ${months} meses` };
}

export function getFinancialTrends(dataset: AnalyticsDataset, filters: AnalyticsFilters): FinancialTrends {
  const { currency, period } = filters;
  const window = monthlyWindowEnding(period.end, TREND_WINDOW_MONTHS);
  const buckets = bucketizePeriod(window, "month");

  const incomeSeries = buckets.map((b) => ({ label: b.label, value: Number(getIncomeTotal(dataset.transactions, b, currency)) }));
  const expenseSeries = buckets.map((b) => ({ label: b.label, value: Number(getExpenseTotal(dataset.transactions, b, currency)) }));
  const cashflowSeries = buckets.map((b) => ({ label: b.label, value: Number(getCashflow(dataset.transactions, b, currency)) }));
  const netWorthSeries = buckets.map((b) => ({ label: b.label, value: Number(getNetWorth(dataset.accounts, dataset.transactions, b.end, currency)) }));

  const topIncreasingCategories: CategoryTrendRow[] = [];
  const topDecreasingCategories: CategoryTrendRow[] = [];
  if (filters.comparisonPeriod) {
    const rows = getCategoryAnalysis(dataset, filters).filter((r) => r.changePercent !== null);
    const increasing = [...rows].filter((r) => (r.changePercent ?? 0) > 0).sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
    const decreasing = [...rows].filter((r) => (r.changePercent ?? 0) < 0).sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
    for (const r of increasing.slice(0, 5)) topIncreasingCategories.push({ categoryId: r.categoryId, categoryName: r.categoryName, changePercent: r.changePercent as number, direction: "up" });
    for (const r of decreasing.slice(0, 5)) topDecreasingCategories.push({ categoryId: r.categoryId, categoryName: r.categoryName, changePercent: r.changePercent as number, direction: "down" });
  }

  return {
    currency,
    windowMonths: TREND_WINDOW_MONTHS,
    income: { direction: classify(incomeSeries.map((s) => s.value)), series: incomeSeries },
    expenses: { direction: classify(expenseSeries.map((s) => s.value)), series: expenseSeries },
    cashflow: { direction: classify(cashflowSeries.map((s) => s.value)), series: cashflowSeries },
    netWorth: { direction: classify(netWorthSeries.map((s) => s.value)), series: netWorthSeries },
    topIncreasingCategories,
    topDecreasingCategories,
  };
}

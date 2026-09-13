// ============================================================================
// KONTA ANALYTICS — Cash Flow (Milestone Analytics).
//
// Série temporal de receitas/despesas/cashflow — reutiliza
// getIncomeTotal/getExpenseTotal/getCashflow (Financial Engine) uma vez por
// bucket, nunca uma soma manual. `bucketizePeriod` (periods.ts) decide os
// intervalos; este ficheiro só agrega cada um.
// ============================================================================

import { formatMinor, getCashflow, getExpenseTotal, getIncomeTotal, type MinorAmount } from "@/lib/financial-engine";
import { compareAmounts } from "./compare";
import type { AnalyticsDataset } from "./dataset";
import { autoGranularity, bucketizePeriod, type Granularity, type PeriodRange } from "./periods";
import type { AnalyticsFilters } from "./types";

export interface CashflowBucket {
  /** Chave estável — usada para o drill-down "clicar num período" devolver de volta o PeriodRange exato. */
  key: string;
  label: string;
  start: string;
  end: string;
  incomeMinor: MinorAmount;
  expenseMinor: MinorAmount;
  cashflowMinor: MinorAmount;
  income: string;
  expense: string;
  cashflow: string;
}

export interface CashflowAnalysis {
  currency: string;
  granularity: Granularity;
  buckets: CashflowBucket[];
  totals: {
    income: string;
    expense: string;
    cashflow: string;
    incomeChangePercent: number | null;
    expenseChangePercent: number | null;
    cashflowChangePercent: number | null;
  };
}

export function getCashflowAnalysis(dataset: AnalyticsDataset, filters: AnalyticsFilters, granularity?: Granularity): CashflowAnalysis {
  const { currency, period, comparisonPeriod } = filters;
  const effectiveGranularity = granularity ?? autoGranularity(period);
  const buckets = bucketizePeriod(period, effectiveGranularity).map((bucket) => {
    const incomeMinor = getIncomeTotal(dataset.transactions, bucket, currency);
    const expenseMinor = getExpenseTotal(dataset.transactions, bucket, currency);
    const cashflowMinor = getCashflow(dataset.transactions, bucket, currency);
    return {
      key: bucket.key,
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      incomeMinor,
      expenseMinor,
      cashflowMinor,
      income: formatMinor(incomeMinor, currency),
      expense: formatMinor(expenseMinor, currency),
      cashflow: formatMinor(cashflowMinor, currency),
    };
  });

  const income = compareAmounts(
    getIncomeTotal(dataset.transactions, period, currency),
    comparisonPeriod ? getIncomeTotal(dataset.transactions, comparisonPeriod, currency) : null,
  );
  const expense = compareAmounts(
    getExpenseTotal(dataset.transactions, period, currency),
    comparisonPeriod ? getExpenseTotal(dataset.transactions, comparisonPeriod, currency) : null,
  );
  const cashflow = compareAmounts(
    getCashflow(dataset.transactions, period, currency),
    comparisonPeriod ? getCashflow(dataset.transactions, comparisonPeriod, currency) : null,
  );

  return {
    currency,
    granularity: effectiveGranularity,
    buckets,
    totals: {
      income: formatMinor(income.current, currency),
      expense: formatMinor(expense.current, currency),
      cashflow: formatMinor(cashflow.current, currency),
      incomeChangePercent: income.changePercent,
      expenseChangePercent: expense.changePercent,
      cashflowChangePercent: cashflow.changePercent,
    },
  };
}

/** Devolve o PeriodRange exato de um bucket, pela sua `key` — usado pelo drill-down "clicar num período" (secção 7 do pedido). */
export function findBucketPeriod(dataset: AnalyticsDataset, filters: AnalyticsFilters, bucketKey: string, granularity?: Granularity): PeriodRange | null {
  const effectiveGranularity = granularity ?? autoGranularity(filters.period);
  const bucket = bucketizePeriod(filters.period, effectiveGranularity).find((b) => b.key === bucketKey);
  return bucket ? { start: bucket.start, end: bucket.end, label: bucket.label } : null;
}

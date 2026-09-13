// ============================================================================
// KONTA ANALYTICS — Resumo executivo (Milestone Analytics).
//
// Reutiliza exatamente as funções do Financial Engine já usadas pelo
// Dashboard (getIncomeTotal/getExpenseTotal/getCashflow/getSavingsRate/
// getNetWorth/getAvailableBalance) — nunca reimplementadas aqui. A única
// coisa nova é comparar o período atual com o período de comparação, via
// compareAmounts (compare.ts).
// ============================================================================

import {
  formatMinor,
  getAccountBalance,
  getAvailableBalance,
  getCashflow,
  getDebtRemaining,
  getExpenseTotal,
  getIncomeTotal,
  getNetWorth,
  getSavingsRate,
  type MinorAmount,
} from "@/lib/financial-engine";
import { compareAmounts, comparePercent, type Comparison, type TrendDirection } from "./compare";
import type { AnalyticsDataset } from "./dataset";
import type { AnalyticsFilters } from "./types";

export interface FormattedComparison {
  currentMinor: MinorAmount;
  current: string;
  previousMinor: MinorAmount | null;
  previous: string | null;
  changePercent: number | null;
  direction: TrendDirection;
}

function formatComparison(comparison: Comparison, currency: string): FormattedComparison {
  return {
    currentMinor: comparison.current,
    current: formatMinor(comparison.current, currency),
    previousMinor: comparison.previous,
    previous: comparison.previous !== null ? formatMinor(comparison.previous, currency) : null,
    changePercent: comparison.changePercent,
    direction: comparison.direction,
  };
}

export interface AnalyticsOverview {
  currency: string;
  period: { label: string; start: string; end: string };
  comparisonPeriod: { label: string; start: string; end: string } | null;
  income: FormattedComparison;
  expenses: FormattedComparison;
  cashflow: FormattedComparison;
  savingsRatePercent: { current: number | null; previous: number | null; direction: TrendDirection };
  /** Ponto-no-tempo, calculado no fim do período (nunca "hoje" se o período for no passado) — nunca comparado (é um saldo, não um fluxo). */
  availableBalance: string;
  netWorth: string;
  debtsOutstanding: string;
  goals: { activeCount: number; averageProgressPercent: number | null };
}

export function getAnalyticsOverview(dataset: AnalyticsDataset, filters: AnalyticsFilters): AnalyticsOverview {
  const { currency, period, comparisonPeriod } = filters;
  const income = compareAmounts(
    getIncomeTotal(dataset.transactions, period, currency),
    comparisonPeriod ? getIncomeTotal(dataset.transactions, comparisonPeriod, currency) : null,
  );
  const expenses = compareAmounts(
    getExpenseTotal(dataset.transactions, period, currency),
    comparisonPeriod ? getExpenseTotal(dataset.transactions, comparisonPeriod, currency) : null,
  );
  const cashflow = compareAmounts(
    getCashflow(dataset.transactions, period, currency),
    comparisonPeriod ? getCashflow(dataset.transactions, comparisonPeriod, currency) : null,
  );
  const savingsRatePercent = comparePercent(
    getSavingsRate(dataset.transactions, period, currency),
    comparisonPeriod ? getSavingsRate(dataset.transactions, comparisonPeriod, currency) : null,
  );

  // Saldo/património são pontos-no-tempo (fim do período selecionado) —
  // nunca comparados como se fossem um fluxo; mostrar "hoje" só faria
  // sentido se `period.end` for hoje, mas usar sempre `period.end` é
  // consistente mesmo para um período histórico (ex: "Agosto 2026").
  const availableBalance = getAvailableBalance(dataset.accounts, dataset.transactions, period.end, currency);
  const netWorth = getNetWorth(dataset.accounts, dataset.transactions, period.end, currency);

  const debtsOutstandingMinor = dataset.debts
    .filter((d) => d.status === "ACTIVE" && d.currency === currency)
    .reduce((total, d) => total + getDebtRemaining(d, dataset.transactions), 0n);

  const activeGoals = dataset.goals.filter((g) => g.status === "ACTIVE" && g.currency === currency);
  const accountsById = new Map(dataset.accounts.map((a) => [a.id, a]));
  const goalProgressPercents = activeGoals.map((g) => {
    const linkedAccount = g.linkedAccountId ? accountsById.get(g.linkedAccountId) : undefined;
    if (!linkedAccount) return 0;
    const currentAmount = getAccountBalance(linkedAccount, dataset.transactions, period.end);
    return g.targetAmountMinor === 0n ? 0 : (Number(currentAmount) / Number(g.targetAmountMinor)) * 100;
  });
  const averageProgressPercent =
    goalProgressPercents.length > 0 ? goalProgressPercents.reduce((a, b) => a + b, 0) / goalProgressPercents.length : null;

  return {
    currency,
    period: { label: period.label, start: period.start, end: period.end },
    comparisonPeriod: comparisonPeriod ? { label: comparisonPeriod.label, start: comparisonPeriod.start, end: comparisonPeriod.end } : null,
    income: formatComparison(income, currency),
    expenses: formatComparison(expenses, currency),
    cashflow: formatComparison(cashflow, currency),
    savingsRatePercent,
    availableBalance: formatMinor(availableBalance, currency),
    netWorth: formatMinor(netWorth, currency),
    debtsOutstanding: formatMinor(debtsOutstandingMinor, currency),
    goals: { activeCount: activeGoals.length, averageProgressPercent },
  };
}

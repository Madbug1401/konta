// ============================================================================
// KONTA ANALYTICS — Investimentos (Milestone Analytics).
//
// Reutiliza computeInvestmentPerformance (Financial Engine) — o mesmo
// cálculo já usado por get_investments — nunca reimplementado. READ-ONLY por
// natureza (não existe nenhuma operação de compra/venda no Konta, ver
// secção 14 do pedido) — este ficheiro nem podia inventar uma.
// ============================================================================

import { computeInvestmentPerformance, formatMinor, type MinorAmount } from "@/lib/financial-engine";
import type { AnalyticsDataset } from "./dataset";
import type { AnalyticsFilters } from "./types";

export interface InvestmentAnalysisRow {
  accountId: string;
  accountName: string;
  investmentType: string | null;
  currency: string;
  capitalContributed: string;
  hasValuation: boolean;
  currentValue: string | null;
  returnPercent: number | null;
  asOfDate: string | null;
}

export interface InvestmentAnalysis {
  currency: string;
  totalCapitalContributed: string;
  /** `null` quando nem todas as contas têm avaliação registada — nunca soma parcial disfarçada de total. */
  totalCurrentValue: string | null;
  accounts: InvestmentAnalysisRow[];
}

export function getInvestmentAnalysis(dataset: AnalyticsDataset, filters: Pick<AnalyticsFilters, "currency">): InvestmentAnalysis {
  const { currency } = filters;
  const relevant = dataset.investmentAccounts.filter((i) => i.account.currency === currency);

  const rows: InvestmentAnalysisRow[] = relevant.map(({ account, detail, valuations }) => {
    const performance = computeInvestmentPerformance(account.id, dataset.transactions, valuations);
    return {
      accountId: account.id,
      accountName: account.name,
      investmentType: detail?.investmentType ?? null,
      currency,
      capitalContributed: formatMinor(performance.capitalContributedMinor, currency),
      hasValuation: performance.hasValuation,
      currentValue: performance.currentValueMinor !== null ? formatMinor(performance.currentValueMinor, currency) : null,
      returnPercent: performance.returnPercent,
      asOfDate: performance.asOfDate,
    };
  });

  const totalCapitalMinor: MinorAmount = relevant.reduce((sum, { account, valuations }) => {
    return sum + computeInvestmentPerformance(account.id, dataset.transactions, valuations).capitalContributedMinor;
  }, 0n);

  const allHaveValuation = relevant.length > 0 && relevant.every(({ account, valuations }) => computeInvestmentPerformance(account.id, dataset.transactions, valuations).hasValuation);
  const totalCurrentValueMinor: MinorAmount | null = allHaveValuation
    ? relevant.reduce((sum, { account, valuations }) => {
        const performance = computeInvestmentPerformance(account.id, dataset.transactions, valuations);
        return sum + (performance.currentValueMinor ?? 0n);
      }, 0n)
    : null;

  return {
    currency,
    totalCapitalContributed: formatMinor(totalCapitalMinor, currency),
    totalCurrentValue: totalCurrentValueMinor !== null ? formatMinor(totalCurrentValueMinor, currency) : null,
    accounts: rows,
  };
}

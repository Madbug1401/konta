// ============================================================================
// KONTA ANALYTICS — Dívidas (Milestone Analytics).
//
// Reutiliza getDebtRemaining/getUpcomingInstallments/getOverdueInstallments
// (Financial Engine) — nunca reimplementados. O único cálculo novo é
// "pressão financeira": quanto das parcelas com vencimento no período
// selecionado pesa sobre a receita desse mesmo período — uma métrica real e
// explicável (nunca "risco"/"juro" inventado, ver secção 12 do pedido).
// ============================================================================

import {
  formatMinor,
  getDebtRemaining,
  getIncomeTotal,
  getOverdueInstallments,
  getUpcomingInstallments,
  type MinorAmount,
} from "@/lib/financial-engine";
import type { AnalyticsDataset } from "./dataset";
import type { AnalyticsFilters } from "./types";

export interface DebtAnalysisRow {
  debtId: string;
  creditorName: string;
  status: string;
  remainingMinor: MinorAmount;
  remaining: string;
  progressPercent: number;
}

export interface DebtAnalysis {
  currency: string;
  totalOriginal: string;
  totalRemaining: string;
  totalPaid: string;
  activeCount: number;
  debts: DebtAnalysisRow[];
  upcomingInstallmentsCount: number;
  overdueInstallmentsCount: number;
  /** Soma das parcelas (de qualquer dívida) com vencimento dentro do período selecionado — nunca todas as parcelas futuras. */
  installmentsDueInPeriod: string;
  /**
   * % da receita do período comprometida com parcelas vencidas nesse mesmo
   * período — `null` sem receita (nunca uma divisão por zero disfarçada).
   * Indicador explicável, não uma previsão de risco.
   */
  debtServiceRatioPercent: number | null;
}

export function getDebtAnalysis(dataset: AnalyticsDataset, filters: AnalyticsFilters): DebtAnalysis {
  const { currency, period } = filters;
  const relevantDebts = dataset.debts.filter((d) => d.currency === currency);

  const totalOriginalMinor = relevantDebts.reduce((sum, d) => sum + d.originalAmountMinor, 0n);
  const totalRemainingMinor = relevantDebts.reduce((sum, d) => sum + getDebtRemaining(d, dataset.transactions), 0n);

  const rows: DebtAnalysisRow[] = relevantDebts.map((d) => {
    const remainingMinor = getDebtRemaining(d, dataset.transactions);
    const progressPercent = d.originalAmountMinor === 0n ? 100 : (Number(d.originalAmountMinor - remainingMinor) / Number(d.originalAmountMinor)) * 100;
    return {
      debtId: d.id,
      creditorName: d.creditorName,
      status: d.status,
      remainingMinor,
      remaining: formatMinor(remainingMinor, currency),
      progressPercent,
    };
  });

  let upcomingCount = 0;
  let overdueCount = 0;
  let installmentsDueInPeriodMinor: MinorAmount = 0n;
  for (const debt of relevantDebts) {
    upcomingCount += getUpcomingInstallments(debt.installments, period.end).length;
    overdueCount += getOverdueInstallments(debt.installments, period.end).length;
    for (const installment of debt.installments) {
      if (installment.dueDate >= period.start && installment.dueDate <= period.end) {
        installmentsDueInPeriodMinor += installment.amountMinor;
      }
    }
  }

  const incomeInPeriod = getIncomeTotal(dataset.transactions, period, currency);
  const debtServiceRatioPercent = incomeInPeriod === 0n ? null : (Number(installmentsDueInPeriodMinor) / Number(incomeInPeriod)) * 100;

  return {
    currency,
    totalOriginal: formatMinor(totalOriginalMinor, currency),
    totalRemaining: formatMinor(totalRemainingMinor, currency),
    totalPaid: formatMinor(totalOriginalMinor - totalRemainingMinor, currency),
    activeCount: relevantDebts.filter((d) => d.status === "ACTIVE").length,
    debts: rows.sort((a, b) => (b.remainingMinor > a.remainingMinor ? 1 : b.remainingMinor < a.remainingMinor ? -1 : 0)),
    upcomingInstallmentsCount: upcomingCount,
    overdueInstallmentsCount: overdueCount,
    installmentsDueInPeriod: formatMinor(installmentsDueInPeriodMinor, currency),
    debtServiceRatioPercent,
  };
}

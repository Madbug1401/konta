// ============================================================================
// KONTA ANALYTICS — aplicação de filtros a transações (Milestone Analytics).
//
// Função pura — nunca acede à base de dados. `accountId` cruza origem OU
// destino (mesma semântica de `listTransactions`, src/lib/db/transactions.ts)
// para uma transferência aparecer na análise de qualquer uma das duas contas.
// ============================================================================

import type { TransactionRecord } from "@/lib/financial-engine";
import type { PeriodRange } from "./periods";
import type { AnalyticsFilters } from "./types";

export function inPeriod(transaction: TransactionRecord, period: PeriodRange): boolean {
  return transaction.date >= period.start && transaction.date <= period.end;
}

function matchesCommonFilters(t: TransactionRecord, filters: Pick<AnalyticsFilters, "currency" | "accountId" | "categoryId" | "transactionType">): boolean {
  if (t.status !== "COMPLETED") return false;
  if (t.currency !== filters.currency) return false;
  if (filters.accountId && t.accountId !== filters.accountId && t.destinationAccountId !== filters.accountId) return false;
  if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
  if (filters.transactionType && t.type !== filters.transactionType) return false;
  return true;
}

/** Transações do período principal, já com todos os filtros aplicados. */
export function filterForPeriod(transactions: TransactionRecord[], filters: AnalyticsFilters): TransactionRecord[] {
  return transactions.filter((t) => inPeriod(t, filters.period) && matchesCommonFilters(t, filters));
}

/** Transações do período de comparação (mesmos filtros, `null` se não há comparação pedida). */
export function filterForComparisonPeriod(transactions: TransactionRecord[], filters: AnalyticsFilters): TransactionRecord[] | null {
  if (!filters.comparisonPeriod) return null;
  const comparisonPeriod = filters.comparisonPeriod;
  return transactions.filter((t) => inPeriod(t, comparisonPeriod) && matchesCommonFilters(t, filters));
}

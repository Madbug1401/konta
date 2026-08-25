import { sum } from "./money";
import type { MinorAmount, TransactionRecord } from "./types";

// Aceita tanto {start,end} (ver datetime.ts) sem depender diretamente do módulo,
// para manter este ficheiro fácil de testar isoladamente.
export interface PeriodBoundsLikeLocal {
  start: string;
  end: string;
}

function inPeriod(t: TransactionRecord, period?: PeriodBoundsLikeLocal): boolean {
  if (!period) return true;
  return t.date >= period.start && t.date <= period.end;
}

export function getIncomeTotal(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
): MinorAmount {
  return sum(
    transactions
      .filter((t) => t.type === "INCOME" && t.status === "COMPLETED" && inPeriod(t, period))
      .map((t) => t.amountMinor),
  );
}

export function getExpenseTotal(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
): MinorAmount {
  return sum(
    transactions
      .filter((t) => t.type === "EXPENSE" && t.status === "COMPLETED" && inPeriod(t, period))
      .map((t) => t.amountMinor),
  );
}

export function getCashflow(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
): MinorAmount {
  return getIncomeTotal(transactions, period) - getExpenseTotal(transactions, period);
}

/** Taxa de poupança = (receita - despesa) / receita, em percentagem. Sem receita, retorna null (não 0 nem Infinity). */
export function getSavingsRate(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
): number | null {
  const income = getIncomeTotal(transactions, period);
  if (income === 0n) return null;
  const cashflow = getCashflow(transactions, period);
  return (Number(cashflow) / Number(income)) * 100;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  totalMinor: MinorAmount;
}

export function getCategoryBreakdown(
  transactions: TransactionRecord[],
  type: "INCOME" | "EXPENSE",
  period?: PeriodBoundsLikeLocal,
): CategoryBreakdownItem[] {
  const relevant = transactions.filter(
    (t) => t.type === type && t.status === "COMPLETED" && inPeriod(t, period),
  );
  const totals = new Map<string | null, MinorAmount>();
  for (const t of relevant) {
    const key = t.categoryId;
    totals.set(key, (totals.get(key) ?? 0n) + t.amountMinor);
  }
  return Array.from(totals.entries()).map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }));
}

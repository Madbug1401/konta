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

// [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] `currency`
// é opcional em todas as funções abaixo e, quando passado, restringe a soma
// a transações dessa moeda — nunca se soma CVE com EUR como se fosse o
// mesmo número. Sem `currency`, o comportamento é exatamente o de antes
// desta funcionalidade existir (soma tudo, correto quando só há uma moeda
// em uso — o caso da esmagadora maioria dos utilizadores hoje).
function matchesCurrency(t: TransactionRecord, currency?: string): boolean {
  return currency === undefined || t.currency === currency;
}

export function getIncomeTotal(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
  currency?: string,
): MinorAmount {
  return sum(
    transactions
      .filter((t) => t.type === "INCOME" && t.status === "COMPLETED" && inPeriod(t, period) && matchesCurrency(t, currency))
      .map((t) => t.amountMinor),
  );
}

export function getExpenseTotal(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
  currency?: string,
): MinorAmount {
  return sum(
    transactions
      .filter((t) => t.type === "EXPENSE" && t.status === "COMPLETED" && inPeriod(t, period) && matchesCurrency(t, currency))
      .map((t) => t.amountMinor),
  );
}

export function getCashflow(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
  currency?: string,
): MinorAmount {
  return getIncomeTotal(transactions, period, currency) - getExpenseTotal(transactions, period, currency);
}

/** Taxa de poupança = (receita - despesa) / receita, em percentagem. Sem receita, retorna null (não 0 nem Infinity). */
export function getSavingsRate(
  transactions: TransactionRecord[],
  period?: PeriodBoundsLikeLocal,
  currency?: string,
): number | null {
  const income = getIncomeTotal(transactions, period, currency);
  if (income === 0n) return null;
  const cashflow = getCashflow(transactions, period, currency);
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
  currency?: string,
): CategoryBreakdownItem[] {
  const relevant = transactions.filter(
    (t) => t.type === type && t.status === "COMPLETED" && inPeriod(t, period) && matchesCurrency(t, currency),
  );
  const totals = new Map<string | null, MinorAmount>();
  for (const t of relevant) {
    const key = t.categoryId;
    totals.set(key, (totals.get(key) ?? 0n) + t.amountMinor);
  }
  return Array.from(totals.entries()).map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }));
}

// ============================================================================
// KONTA ANALYTICS — Categorias e Top Transações (Milestone Analytics).
//
// Reutiliza getCategoryBreakdown (Financial Engine) para os totais por
// categoria — nunca uma segunda soma manual. `getCategoryAnalysis` monta a
// tabela comparativa (secção 11 do pedido); `getCategoryDrilldown` monta o
// detalhe de UMA categoria (secção 9 — drill-down); `getTopTransactions`
// serve tanto a secção 10 (maiores despesas/receitas) como o drill-down.
// ============================================================================

import { formatMinor, getCategoryBreakdown, getExpenseTotal, type MinorAmount, type TransactionRecord, type TransactionType } from "@/lib/financial-engine";
import { compareAmounts, type TrendDirection } from "./compare";
import type { AnalyticsDataset } from "./dataset";
import { filterForComparisonPeriod, filterForPeriod, inPeriod } from "./filters";
import type { AnalyticsFilters } from "./types";

export interface CategoryAnalysisRow {
  categoryId: string | null;
  categoryName: string;
  currentMinor: MinorAmount;
  current: string;
  previousMinor: MinorAmount | null;
  previous: string | null;
  changePercent: number | null;
  direction: TrendDirection;
  /** Percentagem do total de despesas do período que esta categoria representa. */
  shareOfTotalPercent: number;
}

function categoryName(categoryId: string | null, dataset: AnalyticsDataset): string {
  if (categoryId === null) return "Sem categoria";
  return dataset.categories.find((c) => c.id === categoryId)?.name ?? "Categoria";
}

/**
 * Tabela de categorias (secção 11): atual, anterior, variação, % das
 * despesas do período. `type` decide se é despesas (omissão) ou receitas —
 * nunca mistura os dois tipos na mesma linha, mesmo princípio do resto do
 * Financial Engine.
 */
export function getCategoryAnalysis(dataset: AnalyticsDataset, filters: AnalyticsFilters, type: "INCOME" | "EXPENSE" = "EXPENSE"): CategoryAnalysisRow[] {
  const { currency, period, comparisonPeriod } = filters;
  const currentBreakdown = getCategoryBreakdown(dataset.transactions, type, period, currency);
  const previousBreakdown = comparisonPeriod ? getCategoryBreakdown(dataset.transactions, type, comparisonPeriod, currency) : null;
  const previousByCategory = new Map((previousBreakdown ?? []).map((item) => [item.categoryId, item.totalMinor]));

  const totalCurrent = currentBreakdown.reduce((sum, item) => sum + item.totalMinor, 0n);

  const rows = currentBreakdown.map((item) => {
    const comparison = compareAmounts(item.totalMinor, previousByCategory.get(item.categoryId) ?? (comparisonPeriod ? 0n : null));
    return {
      categoryId: item.categoryId,
      categoryName: categoryName(item.categoryId, dataset),
      currentMinor: item.totalMinor,
      current: formatMinor(item.totalMinor, currency),
      previousMinor: comparison.previous,
      previous: comparison.previous !== null ? formatMinor(comparison.previous, currency) : null,
      changePercent: comparison.changePercent,
      direction: comparison.direction,
      shareOfTotalPercent: totalCurrent === 0n ? 0 : (Number(item.totalMinor) / Number(totalCurrent)) * 100,
    };
  });

  return rows.sort((a, b) => (b.currentMinor > a.currentMinor ? 1 : b.currentMinor < a.currentMinor ? -1 : 0));
}

export interface TopTransactionRow {
  id: string;
  description: string;
  date: string;
  categoryName: string | null;
  amountMinor: MinorAmount;
  amount: string;
}

function toTopTransactionRow(t: TransactionRecord, dataset: AnalyticsDataset): TopTransactionRow {
  return {
    id: t.id,
    description: t.description,
    date: t.date,
    categoryName: t.categoryId ? categoryName(t.categoryId, dataset) : null,
    amountMinor: t.amountMinor,
    amount: formatMinor(t.amountMinor, t.currency),
  };
}

/** Maiores transações do período (secção 10) — despesas por omissão, `limit` sempre limitado (nunca "todas"). */
export function getTopTransactions(
  dataset: AnalyticsDataset,
  filters: AnalyticsFilters,
  options: { type?: TransactionType; limit?: number; categoryId?: string } = {},
): TopTransactionRow[] {
  const type = options.type ?? "EXPENSE";
  const limit = Math.min(options.limit ?? 10, 50);
  const scoped: AnalyticsFilters = { ...filters, transactionType: type, categoryId: options.categoryId ?? filters.categoryId };
  const transactions = filterForPeriod(dataset.transactions, scoped);
  return transactions
    .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : b.amountMinor < a.amountMinor ? -1 : 0))
    .slice(0, limit)
    .map((t) => toTopTransactionRow(t, dataset));
}

export interface CategoryDrilldown {
  categoryId: string | null;
  categoryName: string;
  currency: string;
  totalMinor: MinorAmount;
  total: string;
  shareOfExpensesPercent: number;
  changePercent: number | null;
  direction: TrendDirection;
  transactionCount: number;
  averagePerTransaction: string;
  topTransactions: TopTransactionRow[];
}

/**
 * Detalhe de UMA categoria (secção 9 — drill-down): total, % das despesas,
 * comparação com o período anterior, média por transação, e as maiores
 * transações dessa categoria no período.
 */
export function getCategoryDrilldown(dataset: AnalyticsDataset, filters: AnalyticsFilters, categoryId: string | null): CategoryDrilldown {
  const scoped: AnalyticsFilters = { ...filters, categoryId: categoryId ?? undefined, transactionType: "EXPENSE" };
  const transactions = filterForPeriod(dataset.transactions, scoped).filter((t) => t.categoryId === categoryId);
  const comparisonTransactions = comparisonPeriodTransactions(dataset, scoped, categoryId);

  const totalMinor = transactions.reduce((sum, t) => sum + t.amountMinor, 0n);
  const previousTotalMinor = filters.comparisonPeriod ? comparisonTransactions.reduce((sum, t) => sum + t.amountMinor, 0n) : null;
  const comparison = compareAmounts(totalMinor, previousTotalMinor);

  const totalExpenses = getExpenseTotal(dataset.transactions, filters.period, filters.currency);
  const shareOfExpensesPercent = totalExpenses === 0n ? 0 : (Number(totalMinor) / Number(totalExpenses)) * 100;

  return {
    categoryId,
    categoryName: categoryName(categoryId, dataset),
    currency: filters.currency,
    totalMinor,
    total: formatMinor(totalMinor, filters.currency),
    shareOfExpensesPercent,
    changePercent: comparison.changePercent,
    direction: comparison.direction,
    transactionCount: transactions.length,
    averagePerTransaction: formatMinor(transactions.length > 0 ? totalMinor / BigInt(transactions.length) : 0n, filters.currency),
    topTransactions: transactions
      .sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : b.amountMinor < a.amountMinor ? -1 : 0))
      .slice(0, 10)
      .map((t) => toTopTransactionRow(t, dataset)),
  };
}

function comparisonPeriodTransactions(dataset: AnalyticsDataset, filters: AnalyticsFilters, categoryId: string | null): TransactionRecord[] {
  const result = filterForComparisonPeriod(dataset.transactions, filters);
  return (result ?? []).filter((t) => t.categoryId === categoryId);
}

/** Resolve um nome de categoria (texto livre) para um id real do utilizador — nunca inventa, nunca escolhe entre ambíguos em silêncio (ver secção 15 do pedido). */
export type CategoryResolution =
  | { status: "resolved"; categoryId: string; categoryName: string }
  | { status: "not_found" }
  | { status: "ambiguous"; matches: string[] };

export function resolveCategoryName(dataset: AnalyticsDataset, name: string): CategoryResolution {
  const trimmed = name.trim().toLowerCase();
  const exact = dataset.categories.filter((c) => c.name.toLowerCase() === trimmed);
  if (exact.length === 1) return { status: "resolved", categoryId: exact[0].id, categoryName: exact[0].name };
  if (exact.length > 1) return { status: "ambiguous", matches: exact.map((c) => c.name) };

  const partial = dataset.categories.filter((c) => c.name.toLowerCase().includes(trimmed));
  if (partial.length === 1) return { status: "resolved", categoryId: partial[0].id, categoryName: partial[0].name };
  if (partial.length > 1) return { status: "ambiguous", matches: partial.map((c) => c.name) };
  return { status: "not_found" };
}

// Reexport para quem só precisa de saber se uma transação cai num período (evita importar filters.ts diretamente em todo o lado).
export { inPeriod };

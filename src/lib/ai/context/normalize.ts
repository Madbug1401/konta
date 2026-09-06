// ============================================================================
// KONTA AI — Context Builder: normalização (Milestone 2).
//
// Camada 100% pura: nenhuma chamada a src/lib/db, nenhum I/O, nenhuma leitura
// de `process.env`. Só recebe records já carregados (AccountRecord,
// TransactionRecord, DebtWithInstallments, GoalRecord, ...) e devolve DTOs de
// src/lib/ai/context/types.ts. Isto é o que torna esta camada testável sem
// nenhum mock de base de dados — os mesmos fixtures usados nos testes do
// próprio Financial Engine servem aqui.
//
// Regra que estas funções impõem em código, não só por disciplina: cada
// `return`/`.map` abaixo lista explicitamente os campos do DTO — nunca
// `{ ...record }` nem qualquer forma de espalhar um AccountRecord/
// TransactionRecord/DebtRecord/GoalRecord por inteiro. É assim que um campo
// novo adicionado a um desses tipos no futuro (ex: um metadata interno)
// nunca aparece aqui sem uma decisão explícita.
//
// Todos os valores monetários usam formatMinor() — a mesma função de
// formatação já usada pela UI — nunca um bigint nem um número JS a fingir de
// dinheiro.
// ============================================================================

import {
  calculateGoalProjection,
  computeInvestmentPerformance,
  formatMinor,
  getAccountBalance,
  getAvailableBalance,
  getCashflow,
  getCategoryBreakdown,
  getDebtRemaining,
  getExpenseTotal,
  getGoalProgress,
  getIncomeTotal,
  getNetWorth,
  getOverdueInstallments,
  getSavingsRate,
  getUpcomingInstallments,
  sum,
  type AccountRecord,
  type GoalRecord,
  type PeriodBounds,
  type TransactionRecord,
} from "@/lib/financial-engine";
import type { CategoryRow } from "@/lib/db/categories";
import type { DebtWithInstallments } from "@/lib/db/debts";
import type { InvestmentAccountData } from "./collect";
import type {
  AiAccountSummary,
  AiCategoryAmount,
  AiCategoryComparison,
  AiCurrencySummary,
  AiDebtSummary,
  AiGoalSummary,
  AiInvestmentSummary,
  AiTransactionSummary,
} from "./types";

// Mesmos valores já usados nas páginas equivalentes (dashboard/page.tsx,
// goals/page.tsx) — não são regras novas, só reaproveitadas aqui.
const TOP_CATEGORIES = 7;
export const GOAL_PROJECTION_LOOKBACK_DAYS = 90;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Mesma lógica de dashboard/page.tsx: moedas das contas não arquivadas, ou a moeda de omissão do utilizador se não houver nenhuma conta. */
function currenciesInUse(accounts: AccountRecord[], fallbackCurrency: string): string[] {
  const active = Array.from(new Set(accounts.filter((a) => !a.isArchived).map((a) => a.currency))).sort();
  return active.length > 0 ? active : [fallbackCurrency];
}

export function buildCurrencySummaries(
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  defaultCurrency: string,
  today: string,
  monthBounds: PeriodBounds,
): AiCurrencySummary[] {
  return currenciesInUse(accounts, defaultCurrency).map((currency) => {
    const savingsRate = getSavingsRate(transactions, monthBounds, currency);
    return {
      currency,
      availableBalance: formatMinor(getAvailableBalance(accounts, transactions, today, currency), currency),
      netWorth: formatMinor(getNetWorth(accounts, transactions, today, currency), currency),
      monthlyIncome: formatMinor(getIncomeTotal(transactions, monthBounds, currency), currency),
      monthlyExpense: formatMinor(getExpenseTotal(transactions, monthBounds, currency), currency),
      monthlyCashflow: formatMinor(getCashflow(transactions, monthBounds, currency), currency),
      savingsRatePercent: savingsRate === null ? null : round1(savingsRate),
    };
  });
}

/** Só contas ativas (não arquivadas) — uma conta arquivada não é acionável para o utilizador nem para a IA (mesmo critério já usado na grelha do Dashboard). */
export function buildAccountSummaries(accounts: AccountRecord[], transactions: TransactionRecord[], today: string): AiAccountSummary[] {
  return accounts
    .filter((a) => !a.isArchived)
    .map((account) => ({
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: formatMinor(getAccountBalance(account, transactions, today), account.currency),
    }));
}

export function buildTransactionSummaries(transactions: TransactionRecord[], categories: CategoryRow[]): AiTransactionSummary[] {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return transactions.map((t) => ({
    type: t.type,
    amount: formatMinor(t.amountMinor, t.currency),
    description: t.description,
    date: t.date,
    categoryName: t.categoryId ? (categoryNameById.get(t.categoryId) ?? "Categoria") : null,
  }));
}

function topExpenseCategories(
  transactions: TransactionRecord[],
  categories: CategoryRow[],
  period: PeriodBounds,
  currency: string,
): AiCategoryAmount[] {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const breakdown = [...getCategoryBreakdown(transactions, "EXPENSE", period, currency)].sort((a, b) =>
    b.totalMinor > a.totalMinor ? 1 : b.totalMinor < a.totalMinor ? -1 : 0,
  );
  return breakdown.slice(0, TOP_CATEGORIES).map((item) => ({
    categoryName: item.categoryId ? (categoryNameById.get(item.categoryId) ?? "Categoria") : "Sem categoria",
    amount: formatMinor(item.totalMinor, currency),
  }));
}

export function buildCategoryComparison(
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  categories: CategoryRow[],
  defaultCurrency: string,
  monthBounds: PeriodBounds,
  previousMonthBounds: PeriodBounds,
): AiCategoryComparison[] {
  return currenciesInUse(accounts, defaultCurrency).map((currency) => ({
    currency,
    currentMonth: topExpenseCategories(transactions, categories, monthBounds, currency),
    previousMonth: topExpenseCategories(transactions, categories, previousMonthBounds, currency),
  }));
}

export function buildDebtSummaries(debts: DebtWithInstallments[], transactions: TransactionRecord[], today: string): AiDebtSummary[] {
  return debts.map((debt) => {
    const upcoming = getUpcomingInstallments(debt.installments, today);
    const overdue = getOverdueInstallments(debt.installments, today);
    return {
      creditorName: debt.creditorName,
      currency: debt.currency,
      status: debt.status,
      remaining: formatMinor(getDebtRemaining(debt, transactions), debt.currency),
      upcomingInstallments: upcoming.map((i) => ({ dueDate: i.dueDate, amount: formatMinor(i.amountMinor, debt.currency), status: i.status })),
      overdueInstallments: overdue.map((i) => ({ dueDate: i.dueDate, amount: formatMinor(i.amountMinor, debt.currency), status: i.status })),
    };
  });
}

export function buildGoalSummaries(
  goals: GoalRecord[],
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  today: string,
  lookbackStart: string,
  lookbackDays: number,
): AiGoalSummary[] {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  return goals.map((goal) => {
    const linkedAccount = goal.linkedAccountId ? accountsById.get(goal.linkedAccountId) : undefined;
    const progress = getGoalProgress(goal, linkedAccount, transactions, today);
    // Mesma definição de "contribuição" já usada em goals/page.tsx: soma das
    // transações marcadas com este goalId dentro da janela de lookback.
    const contributionsLastPeriod = sum(
      transactions.filter((t) => t.goalId === goal.id && t.date >= lookbackStart && t.date <= today).map((t) => t.amountMinor),
    );
    const projection = calculateGoalProjection(goal, progress.currentAmountMinor, contributionsLastPeriod, lookbackDays, today);
    return {
      name: goal.name,
      currency: goal.currency,
      status: goal.status,
      targetAmount: formatMinor(goal.targetAmountMinor, goal.currency),
      targetDate: goal.targetDate,
      currentAmount: formatMinor(progress.currentAmountMinor, goal.currency),
      progressPercent: round1(progress.progressPercent),
      estimatedCompletionDate: projection.estimatedCompletionDate,
      onTrack: projection.onTrack,
    };
  });
}

export function buildInvestmentSummaries(investmentAccounts: InvestmentAccountData[], transactions: TransactionRecord[]): AiInvestmentSummary[] {
  return investmentAccounts.map(({ account, detail, valuations }) => {
    const performance = computeInvestmentPerformance(account.id, transactions, valuations);
    return {
      accountName: account.name,
      investmentType: detail.investmentType,
      currency: account.currency,
      capitalContributed: formatMinor(performance.capitalContributedMinor, account.currency),
      hasValuation: performance.hasValuation,
      currentValue: performance.currentValueMinor === null ? null : formatMinor(performance.currentValueMinor, account.currency),
      returnPercent: performance.returnPercent === null ? null : round1(performance.returnPercent),
      asOfDate: performance.asOfDate,
    };
  });
}

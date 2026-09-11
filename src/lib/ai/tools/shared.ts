// ============================================================================
// KONTA AI — Tool Registry: DTOs partilhados entre tools de transações
// (Milestone 3).
//
// Mesma filosofia do Context Builder (Milestone 2): construção de DTO campo
// a campo, nunca `{ ...record }`. `id` é uma exceção documentada aqui — ao
// contrário dos DTOs do Context Builder (que nunca precisam de id, porque só
// alimentam texto de conversa), get_transactions/create_transaction/
// update_transaction precisam de devolver um `id` real: é a ÚNICA forma do
// modelo poder referenciar uma transação específica num update_transaction/
// delete_transaction subsequente. Nenhum outro campo interno (userId,
// accountId, categoryId, debtId, goalId, recurringTransactionId) é exposto.
// ============================================================================

import {
  calculateGoalProjection,
  formatMinor,
  getAccountBalance,
  getDebtRemaining,
  getGoalProgress,
  sum,
  type AccountRecord,
  type CategoryKind,
  type DebtInstallmentRecord,
  type DebtRecord,
  type GoalRecord,
  type InvestmentPerformance,
  type RecurringTransactionRecord,
  type TransactionRecord,
} from "@/lib/financial-engine";
import { createCategory, listCategories, type CategoryRow } from "@/lib/db/categories";
import type { DebtWithInstallments } from "@/lib/db/debts";
import type { InvestmentDetailRecord } from "@/lib/db/investments";

export interface AiToolTransaction {
  id: string;
  type: TransactionRecord["type"];
  amount: string;
  description: string;
  date: string;
  categoryName: string | null;
}

export function toAiToolTransaction(transaction: TransactionRecord, categories: CategoryRow[]): AiToolTransaction {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return {
    id: transaction.id,
    type: transaction.type,
    amount: formatMinor(transaction.amountMinor, transaction.currency),
    description: transaction.description,
    date: transaction.date,
    categoryName: transaction.categoryId ? (categoryNameById.get(transaction.categoryId) ?? "Categoria") : null,
  };
}

// [Correção — bug reportado em uso real, 07/09/2026] `create_transaction` e
// `update_transaction` reutilizavam literalmente `categoryId` dos schemas
// Zod das rotas HTTP — mas NENHUMA tool desta V1 alguma vez expõe um
// categoryId real ao modelo (ver o comentário em
// src/lib/ai/tools/tools/get-transactions.ts: só `categoryName` sai daqui,
// nunca o id, de propósito). Resultado: o modelo nunca tinha um categoryId
// válido para passar, por isso toda transação criada/atualizada pela IA
// ficava sempre sem categoria (`categoryId` omitido) — mesmo quando o
// pedido do utilizador ("gastos com weed") descrevia claramente uma
// categoria já existente na conta dele. A palavra acabava só na descrição
// livre da transação, nunca na categoria.
//
// Corrigido substituindo `categoryId` por `category` (nome em texto livre)
// nas duas tools — o modelo só precisa de saber o NOME, nunca um id interno
// (mesmo princípio de minimização já seguido no resto do Tool Registry).
// Esta função resolve esse nome para uma categoria real: reutiliza uma
// categoria existente do utilizador com o mesmo nome (comparação sem
// distinguir maiúsculas/minúsculas — "weed" e "Weed" são a mesma categoria,
// nunca duas) e do mesmo `kind`; se não existir nenhuma, cria uma nova —
// exatamente a mesma ação que um humano já pode fazer em qualquer formulário
// de transação através de `CategoryQuickCreate`
// (src/components/category-quick-create.tsx → POST /api/categories). Nunca
// mais permissão do que a interface manual já dá.
export async function resolveCategoryByName(userId: string, name: string, kind: CategoryKind): Promise<CategoryRow> {
  const trimmed = name.trim();
  const categories = await listCategories(userId);
  const existing = categories.find((c) => c.kind === kind && c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  return createCategory({ userId, name: trimmed, kind });
}

export interface AiToolAccount {
  id: string;
  name: string;
  type: AccountRecord["type"];
  currency: string;
  balance: string;
}

export function toAiToolAccount(account: AccountRecord, transactions: TransactionRecord[], today: string): AiToolAccount {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: formatMinor(getAccountBalance(account, transactions, today), account.currency),
  };
}

// ============================================================================
// [Milestone 6 — cobertura completa] DTOs partilhados entre as novas tools de
// Dívidas/Metas/Recorrências/Investimentos. Mesma disciplina do resto deste
// ficheiro: campo a campo, nunca `{ ...record }`; e, ao contrário dos DTOs
// equivalentes em src/lib/ai/context/normalize.ts (que só alimentam texto do
// system prompt e por isso nunca precisam de id), estes expõem sempre `id` —
// é a única forma do modelo poder referenciar uma dívida/parcela/meta/
// recorrência específica numa tool de escrita a seguir (mesmo princípio já
// documentado no topo deste ficheiro para `AiToolTransaction`). Nunca
// reimplementa cálculo financeiro: reutiliza sempre as mesmas funções do
// Financial Engine já usadas por normalize.ts.
// ============================================================================

export interface AiToolCategory {
  id: string;
  name: string;
  kind: CategoryKind;
}

export function toAiToolCategory(category: CategoryRow): AiToolCategory {
  return { id: category.id, name: category.name, kind: category.kind };
}

export interface AiToolDebtInstallment {
  id: string;
  sequence: number;
  dueDate: string;
  amount: string;
  status: DebtInstallmentRecord["status"];
}

export interface AiToolDebt {
  id: string;
  creditorName: string;
  description: string | null;
  currency: string;
  status: DebtRecord["status"];
  remaining: string;
  installments: AiToolDebtInstallment[];
}

export function toAiToolDebt(debt: DebtWithInstallments, transactions: TransactionRecord[]): AiToolDebt {
  return {
    id: debt.id,
    creditorName: debt.creditorName,
    description: debt.description,
    currency: debt.currency,
    status: debt.status,
    remaining: formatMinor(getDebtRemaining(debt, transactions), debt.currency),
    installments: debt.installments.map((i) => ({
      id: i.id,
      sequence: i.sequence,
      dueDate: i.dueDate,
      amount: formatMinor(i.amountMinor, debt.currency),
      status: i.status,
    })),
  };
}

export interface AiToolGoal {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  status: GoalRecord["status"];
  targetAmount: string;
  targetDate: string | null;
  currentAmount: string;
  progressPercent: number;
  estimatedCompletionDate: string | null;
  onTrack: boolean | null;
  // [Contribuir/retirar de uma meta] Nunca uma tool própria — o progresso da
  // meta É o saldo em direto de `linkedAccountId` (ver src/lib/db/goals.ts),
  // por isso "adicionar/retirar dinheiro" é sempre um create_transaction
  // normal (INCOME/EXPENSE/TRANSFER) contra esta conta, opcionalmente com
  // `goalId` = este `id` (create_transaction já aceita ambos os campos).
  linkedAccountId: string | null;
  linkedAccountName: string | null;
}

export function toAiToolGoal(
  goal: GoalRecord,
  linkedAccount: AccountRecord | undefined,
  transactions: TransactionRecord[],
  today: string,
  lookbackStart: string,
  lookbackDays: number,
): AiToolGoal {
  const progress = getGoalProgress(goal, linkedAccount, transactions, today);
  const contributionsLastPeriod = sum(
    transactions.filter((t) => t.goalId === goal.id && t.date >= lookbackStart && t.date <= today).map((t) => t.amountMinor),
  );
  const projection = calculateGoalProjection(goal, progress.currentAmountMinor, contributionsLastPeriod, lookbackDays, today);
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description,
    currency: goal.currency,
    status: goal.status,
    targetAmount: formatMinor(goal.targetAmountMinor, goal.currency),
    targetDate: goal.targetDate,
    currentAmount: formatMinor(progress.currentAmountMinor, goal.currency),
    progressPercent: Math.round(progress.progressPercent * 10) / 10,
    estimatedCompletionDate: projection.estimatedCompletionDate,
    onTrack: projection.onTrack,
    linkedAccountId: goal.linkedAccountId,
    linkedAccountName: linkedAccount?.name ?? null,
  };
}

export interface AiToolRecurringTransaction {
  id: string;
  type: TransactionRecord["type"];
  accountName: string;
  destinationAccountName: string | null;
  amount: string;
  currency: string;
  categoryName: string | null;
  description: string;
  frequency: RecurringTransactionRecord["frequency"];
  interval: number;
  startDate: string;
  endDate: string | null;
  occurrencesTotal: number | null;
  occurrencesGenerated: number;
  nextRunDate: string;
  isActive: boolean;
}

export function toAiToolRecurringTransaction(
  series: RecurringTransactionRecord,
  accountsById: Map<string, AccountRecord>,
  categories: CategoryRow[],
): AiToolRecurringTransaction {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return {
    id: series.id,
    type: series.type,
    accountName: accountsById.get(series.accountId)?.name ?? "Conta",
    destinationAccountName: series.destinationAccountId ? (accountsById.get(series.destinationAccountId)?.name ?? "Conta") : null,
    amount: formatMinor(series.amountMinor, series.currency),
    currency: series.currency,
    categoryName: series.categoryId ? (categoryNameById.get(series.categoryId) ?? "Categoria") : null,
    description: series.description,
    frequency: series.frequency,
    interval: series.interval,
    startDate: series.startDate,
    endDate: series.endDate,
    occurrencesTotal: series.occurrencesTotal,
    occurrencesGenerated: series.occurrencesGenerated,
    nextRunDate: series.nextRunDate,
    isActive: series.isActive,
  };
}

export interface AiToolInvestment {
  accountId: string;
  accountName: string;
  investmentType: string | null;
  expectedReturnRate: number | null;
  maturityDate: string | null;
  currency: string;
  capitalContributed: string;
  hasValuation: boolean;
  currentValue: string | null;
  returnPercent: number | null;
  asOfDate: string | null;
}

export function toAiToolInvestment(
  account: AccountRecord,
  detail: InvestmentDetailRecord | null,
  performance: InvestmentPerformance,
): AiToolInvestment {
  return {
    accountId: account.id,
    accountName: account.name,
    investmentType: detail?.investmentType ?? null,
    expectedReturnRate: detail?.expectedReturnRate ?? null,
    maturityDate: detail?.maturityDate ?? null,
    currency: account.currency,
    capitalContributed: formatMinor(performance.capitalContributedMinor, account.currency),
    hasValuation: performance.hasValuation,
    currentValue: performance.currentValueMinor !== null ? formatMinor(performance.currentValueMinor, account.currency) : null,
    returnPercent: performance.returnPercent,
    asOfDate: performance.asOfDate,
  };
}

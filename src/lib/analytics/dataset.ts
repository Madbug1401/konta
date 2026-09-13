// ============================================================================
// KONTA ANALYTICS — Dataset (Milestone Analytics).
//
// Único ponto de I/O desta camada — mesma separação já usada pelo Context
// Builder (collect.ts faz I/O, normalize.ts é puro) e pelas tools de
// leitura (get_debts/get_goals/get_investments): busca tudo o que a camada
// de Analytics pode precisar, UMA vez por pedido, sempre `WHERE userId = $1`
// (nunca um id vindo de fora sem cruzar com o utilizador autenticado — regra
// 6 do briefing). Cada função de `src/lib/analytics/*.ts` recebe este
// dataset já pronto e só calcula — nunca faz a sua própria query.
//
// Reutiliza `listAllTransactionsForBalances` (a mesma função que o Dashboard
// e o Financial Engine já usam para saldos) — nunca uma segunda forma de
// carregar transações. Sem paginação: mesma decisão já tomada para
// get_debts/get_goals/get_investments (histórico pessoal, não um relatório
// multi-tenant) — ver comentário em transactions.ts sobre o propósito dessa
// função.
// ============================================================================

import { listAccounts } from "@/lib/db/accounts";
import { listCategories, type CategoryRow } from "@/lib/db/categories";
import { listDebts, type DebtWithInstallments } from "@/lib/db/debts";
import { listGoals } from "@/lib/db/goals";
import { getInvestmentDetailByAccountId, listValuations, type InvestmentDetailRecord } from "@/lib/db/investments";
import { listRecurringTransactions } from "@/lib/db/recurring-transactions";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import type {
  AccountRecord,
  GoalRecord,
  InvestmentValuationRecord,
  RecurringTransactionRecord,
  TransactionRecord,
} from "@/lib/financial-engine";

export interface InvestmentAccountData {
  account: AccountRecord;
  detail: InvestmentDetailRecord | null;
  valuations: InvestmentValuationRecord[];
}

export interface AnalyticsDataset {
  userId: string;
  timezone: string;
  defaultCurrency: string;
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  categories: CategoryRow[];
  debts: DebtWithInstallments[];
  goals: GoalRecord[];
  recurring: RecurringTransactionRecord[];
  investmentAccounts: InvestmentAccountData[];
}

/**
 * Carrega tudo o que a camada de Analytics precisa para `userId`, numa só
 * chamada. Sempre ownership-scoped (cada função de `src/lib/db` já filtra
 * por `userId` internamente) — nenhuma query nova aqui, só agregação.
 */
export async function collectAnalyticsDataset(userId: string): Promise<AnalyticsDataset> {
  const [user, accounts, transactions, categories, debts, goals, recurring] = await Promise.all([
    findUserById(userId),
    listAccounts(userId),
    listAllTransactionsForBalances(userId),
    listCategories(userId),
    listDebts(userId),
    listGoals(userId),
    listRecurringTransactions(userId),
  ]);

  const investmentAccountRecords = accounts.filter((a) => a.type === "INVESTMENT" && !a.isArchived);
  const investmentAccounts: InvestmentAccountData[] = await Promise.all(
    investmentAccountRecords.map(async (account) => {
      const [detail, valuations] = await Promise.all([
        getInvestmentDetailByAccountId(userId, account.id),
        listValuations(userId, account.id),
      ]);
      return { account, detail, valuations };
    }),
  );

  return {
    userId,
    timezone: user?.timezone ?? "Atlantic/Cape_Verde",
    defaultCurrency: user?.defaultCurrency ?? "CVE",
    accounts,
    transactions,
    categories,
    debts,
    goals,
    recurring,
    investmentAccounts,
  };
}

/** Todas as moedas em uso pelas contas não arquivadas — mesmo critério do Dashboard (nunca somar CVE com EUR). */
export function currenciesInUse(dataset: AnalyticsDataset): string[] {
  const set = new Set(dataset.accounts.filter((a) => !a.isArchived).map((a) => a.currency));
  return set.size > 0 ? Array.from(set).sort() : [dataset.defaultCurrency];
}

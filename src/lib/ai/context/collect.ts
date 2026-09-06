// ============================================================================
// KONTA AI — Context Builder: recolha de dados (Milestone 2).
//
// Único ficheiro deste módulo que fala com src/lib/db — a "collection" da
// separação collection/normalization/presentation pedida no milestone.
// Nunca constrói SQL novo: reutiliza exatamente as mesmas funções de
// domínio já usadas pelas páginas (dashboard, contas, dívidas, metas), que
// já impõem ownership por userId. Busca só o que `needs` pede — nunca
// "tudo, para garantir" (ver builder.ts::computeNeeds).
// ============================================================================

import { listAccounts } from "@/lib/db/accounts";
import { listCategories, type CategoryRow } from "@/lib/db/categories";
import { listDebts, type DebtWithInstallments } from "@/lib/db/debts";
import { listGoals } from "@/lib/db/goals";
import { getInvestmentDetailByAccountId, listValuations, type InvestmentDetailRecord } from "@/lib/db/investments";
import { listAllTransactionsForBalances, listTransactions } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import type { AccountRecord, GoalRecord, InvestmentValuationRecord, TransactionRecord } from "@/lib/financial-engine";
import type { DirectedTransactionFilters } from "./types";

const DEFAULT_TIMEZONE = "Atlantic/Cape_Verde";
const DEFAULT_CURRENCY = "CVE";

export interface CollectNeeds {
  /** `listAccounts` só é chamado quando algo realmente precisa da lista de contas (accounts/goals/investments) — um pedido directed só de "transactions" ou só de "debts" nunca a toca. */
  accounts: boolean;
  /** Ledger completo (todas as transações) — necessário sempre que algo precisar de saldo/progresso calculado (contas, dívidas, metas, investimentos). */
  ledger: boolean;
  categories: boolean;
  debts: boolean;
  goals: boolean;
  investments: boolean;
  /** Presente só quando "transactions" foi pedido como domínio directed isolado — lista filtrada/paginada, nunca o ledger inteiro. */
  directedTransactions?: DirectedTransactionFilters;
}

export interface InvestmentAccountData {
  account: AccountRecord;
  detail: InvestmentDetailRecord;
  valuations: InvestmentValuationRecord[];
}

export interface FinancialSnapshot {
  timezone: string;
  defaultCurrency: string;
  accounts: AccountRecord[];
  categories: CategoryRow[];
  ledgerTransactions: TransactionRecord[];
  directedTransactions: TransactionRecord[];
  debts: DebtWithInstallments[];
  goals: GoalRecord[];
  investmentAccounts: InvestmentAccountData[];
}

/**
 * `userId` tem de vir sempre de uma sessão já autenticada no servidor
 * (getSessionUser(), nunca de input do cliente/modelo) — esta função, tal
 * como todas em src/lib/db/*, confia no valor recebido e não faz a sua
 * própria verificação de identidade. Isso é intencional: a autorização já
 * está resolvida antes deste ponto, não duplicamos um segundo mecanismo.
 */
export async function collectFinancialData(userId: string, needs: CollectNeeds): Promise<FinancialSnapshot> {
  const [user, accounts] = await Promise.all([
    findUserById(userId),
    needs.accounts ? listAccounts(userId) : Promise.resolve<AccountRecord[]>([]),
  ]);

  // [Segurança — ver relatório do milestone] findUserById devolve a linha
  // "User" completa, incluindo passwordHash e email. Só dois campos são
  // lidos aqui, um de cada vez — nunca `{ ...user }` nem qualquer forma de
  // espalhar este objeto. Nada mais dele sai desta função.
  const timezone = user?.timezone ?? DEFAULT_TIMEZONE;
  const defaultCurrency = user?.defaultCurrency ?? DEFAULT_CURRENCY;

  const [categories, ledgerTransactions, directedTransactions, debts, goals] = await Promise.all([
    needs.categories ? listCategories(userId) : Promise.resolve<CategoryRow[]>([]),
    needs.ledger ? listAllTransactionsForBalances(userId) : Promise.resolve<TransactionRecord[]>([]),
    needs.directedTransactions
      ? listTransactions(userId, {
          from: needs.directedTransactions.from,
          to: needs.directedTransactions.to,
          type: needs.directedTransactions.type,
        })
      : Promise.resolve<TransactionRecord[]>([]),
    needs.debts ? listDebts(userId) : Promise.resolve<DebtWithInstallments[]>([]),
    needs.goals ? listGoals(userId) : Promise.resolve<GoalRecord[]>([]),
  ]);

  const investmentAccounts = needs.investments
    ? await collectInvestmentAccounts(userId, accounts)
    : [];

  return { timezone, defaultCurrency, accounts, categories, ledgerTransactions, directedTransactions, debts, goals, investmentAccounts };
}

async function collectInvestmentAccounts(userId: string, accounts: AccountRecord[]): Promise<InvestmentAccountData[]> {
  const candidates = accounts.filter((a) => a.type === "INVESTMENT" && !a.isArchived);
  if (candidates.length === 0) return [];

  const details = await Promise.all(candidates.map((account) => getInvestmentDetailByAccountId(userId, account.id)));
  const withDetail = candidates
    .map((account, i) => ({ account, detail: details[i] }))
    .filter((entry): entry is { account: AccountRecord; detail: InvestmentDetailRecord } => entry.detail !== null);

  const valuations = await Promise.all(withDetail.map((entry) => listValuations(userId, entry.account.id)));
  return withDetail.map((entry, i) => ({ account: entry.account, detail: entry.detail, valuations: valuations[i] }));
}

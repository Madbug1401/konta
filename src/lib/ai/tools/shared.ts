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

import { formatMinor, getAccountBalance, type AccountRecord, type TransactionRecord } from "@/lib/financial-engine";
import type { CategoryRow } from "@/lib/db/categories";

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

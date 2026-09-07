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

import { formatMinor, getAccountBalance, type AccountRecord, type CategoryKind, type TransactionRecord } from "@/lib/financial-engine";
import { createCategory, listCategories, type CategoryRow } from "@/lib/db/categories";

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

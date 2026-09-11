// KONTA AI — tool: get_recurring_transactions (LOW, Milestone 6).
//
// [Nunca materializa] Esta tool só lista séries já existentes — a
// materialização de ocorrências em Transactions reais (`materializeDueOccurrences`,
// src/lib/db/recurring-transactions.ts) já corre automaticamente a cada
// pedido autenticado (src/app/(app)/layout.tsx), nunca a partir daqui.
import { z } from "zod";
import { listAccounts } from "@/lib/db/accounts";
import { listCategories } from "@/lib/db/categories";
import { listRecurringTransactions } from "@/lib/db/recurring-transactions";
import { toAiToolRecurringTransaction, type AiToolRecurringTransaction } from "../shared";
import type { AiTool } from "../types";

const GetRecurringTransactionsParamsSchema = z.object({}).strict();
type GetRecurringTransactionsParams = z.infer<typeof GetRecurringTransactionsParamsSchema>;

async function execute(userId: string): Promise<AiToolRecurringTransaction[]> {
  const [series, accounts, categories] = await Promise.all([
    listRecurringTransactions(userId),
    listAccounts(userId),
    listCategories(userId),
  ]);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  return series.map((s) => toAiToolRecurringTransaction(s, accountsById, categories));
}

export const getRecurringTransactionsTool: AiTool<GetRecurringTransactionsParams, AiToolRecurringTransaction[]> = {
  name: "get_recurring_transactions",
  description:
    "Lista as séries de transações recorrentes do utilizador (id, conta, valor, frequência, próxima data, ativa/em pausa). Usa o `id` para set_recurring_transaction_active — nunca inventes um id.",
  paramsSchema: GetRecurringTransactionsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas transações recorrentes.",
  execute,
};

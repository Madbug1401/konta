// KONTA AI — tool: get_accounts (LOW). Ver docs/konta-ai-design.html, secção L.
import { z } from "zod";
import { listAccounts } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { toAiToolAccount, type AiToolAccount } from "../shared";
import type { AiTool } from "../types";

// Sem parâmetros — `.strict()` garante que um campo extra (ex: um userId
// tentado pelo modelo) é rejeitado alto e a bom som, em vez de ignorado em
// silêncio. userId nunca vem daqui — vem sempre do argumento `userId` de
// `execute`, resolvido pelo executor a partir da sessão autenticada.
const GetAccountsParamsSchema = z.object({}).strict();
type GetAccountsParams = z.infer<typeof GetAccountsParamsSchema>;

async function execute(userId: string): Promise<AiToolAccount[]> {
  const [user, accounts, transactions] = await Promise.all([
    findUserById(userId),
    listAccounts(userId),
    listAllTransactionsForBalances(userId),
  ]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");

  // Só contas não arquivadas — mesma regra já usada no Context Builder
  // (Milestone 2) e na grelha do Dashboard: uma conta arquivada não é
  // acionável.
  return accounts.filter((a) => !a.isArchived).map((account) => toAiToolAccount(account, transactions, today));
}

export const getAccountsTool: AiTool<GetAccountsParams, AiToolAccount[]> = {
  name: "get_accounts",
  description: "Lista as contas do utilizador autenticado, com o saldo atual já calculado pelo Financial Engine.",
  paramsSchema: GetAccountsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas contas.",
  execute,
};

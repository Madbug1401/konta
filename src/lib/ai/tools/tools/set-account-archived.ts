// KONTA AI — tool: set_account_archived (HIGH, Milestone 6).
// Arquivar/desarquivar — reversível de propósito (ver comentário em
// src/lib/db/accounts.ts::setAccountArchived). Uma conta arquivada deixa de
// aparecer nos seletores e não pode ser origem/destino de novas transações.
import { z } from "zod";
import { getAccountById, setAccountArchived } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { toAiToolAccount, type AiToolAccount } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

const SetAccountArchivedToolSchema = z
  .object({
    accountId: z.string().min(1),
    archived: z.boolean(),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type SetAccountArchivedParams = z.infer<typeof SetAccountArchivedToolSchema>;

async function execute(userId: string, params: SetAccountArchivedParams): Promise<AiToolAccount> {
  const existing = await getAccountById(userId, params.accountId);
  if (!existing) throw new ToolExecutionError("Conta não encontrada.");

  const updated = await setAccountArchived(userId, params.accountId, params.archived);
  if (!updated) throw new ToolExecutionError("Conta não encontrada.");

  const [user, transactions] = await Promise.all([findUserById(userId), listAllTransactionsForBalances(userId)]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  return toAiToolAccount(updated, transactions, today);
}

export const setAccountArchivedTool: AiTool<SetAccountArchivedParams, AiToolAccount> = {
  name: "set_account_archived",
  description:
    "Arquiva (archived=true) ou desarquiva (archived=false) uma conta — reversível, nunca apaga histórico. `accountId` tem de vir de get_accounts. Escrita financeira — exige confirmação explícita.",
  paramsSchema: SetAccountArchivedToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const accountPhrase = params.accountName ? ` "${params.accountName}"` : "";
    return params.archived ? `Arquivar a conta${accountPhrase}.` : `Desarquivar a conta${accountPhrase}.`;
  },
  execute,
};

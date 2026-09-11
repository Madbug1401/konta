// KONTA AI — tool: update_account (HIGH, Milestone 6).
// Só name/type/color são editáveis — mesmo limite de PATCH /api/accounts/[id]
// (ver comentário em src/lib/db/accounts.ts::updateAccount: currency e
// initialBalanceMinor ficam de fora porque transações já gravadas dependem
// deles — nunca editáveis aqui também).
import { z } from "zod";
import { ACCOUNT_COLOR_IDS } from "@/lib/account-colors";
import { getAccountById, updateAccount } from "@/lib/db/accounts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import { toAiToolAccount, type AiToolAccount } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

const UpdateAccountToolSchema = z
  .object({
    accountId: z.string().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    type: z.enum(["WALLET", "BANK", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "EMERGENCY_FUND", "OTHER"]).optional(),
    color: z.enum(ACCOUNT_COLOR_IDS).nullable().optional(),
    // [Cosmético — mesmo padrão de accountName em create_transaction] Só para
    // o texto de confirmação; nunca usado para resolver a conta (isso é
    // sempre accountId, verificado por ownership em execute()).
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type UpdateAccountParams = z.infer<typeof UpdateAccountToolSchema>;

async function execute(userId: string, params: UpdateAccountParams): Promise<AiToolAccount> {
  const existing = await getAccountById(userId, params.accountId);
  if (!existing) throw new ToolExecutionError("Conta não encontrada.");

  const updated = await updateAccount(userId, params.accountId, { name: params.name, type: params.type, color: params.color });
  if (!updated) throw new ToolExecutionError("Conta não encontrada.");

  const [user, transactions] = await Promise.all([findUserById(userId), listAllTransactionsForBalances(userId)]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  return toAiToolAccount(updated, transactions, today);
}

export const updateAccountTool: AiTool<UpdateAccountParams, AiToolAccount> = {
  name: "update_account",
  description:
    "Atualiza o nome, tipo ou cor de uma conta existente (nunca a moeda nem o saldo inicial — esses ficam fixos depois de criada). `accountId` tem de vir de get_accounts, nunca inventado. Escrita financeira — exige confirmação explícita.",
  paramsSchema: UpdateAccountToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const changes: string[] = [];
    if (params.name) changes.push(`nome para "${params.name}"`);
    if (params.type) changes.push(`tipo para ${params.type.toLowerCase()}`);
    if (params.color !== undefined) changes.push("cor");
    const accountPhrase = params.accountName ? ` "${params.accountName}"` : "";
    return `Atualizar a conta${accountPhrase}${changes.length > 0 ? ": " + changes.join(", ") : ""}.`;
  },
  execute,
};

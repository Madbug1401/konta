// KONTA AI — tool: delete_account (HIGH, Milestone 6).
// Só aceite quando a conta nunca foi usada (ver AccountNotEmptyError,
// src/lib/db/accounts.ts::deleteAccount) — o mesmo guard que já protege
// DELETE /api/accounts/[id]. Com qualquer histórico (transações, metas,
// recorrências, detalhe de investimento), a tool rejeita com uma mensagem
// clara em vez de apagar em cascata; o caminho para uma conta com histórico
// continua a ser set_account_archived, nunca isto.
import { z } from "zod";
import { AccountNotEmptyError, deleteAccount, getAccountById } from "@/lib/db/accounts";
import { ToolExecutionError, type AiTool } from "../types";

const DeleteAccountToolSchema = z
  .object({
    accountId: z.string().min(1),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type DeleteAccountParams = z.infer<typeof DeleteAccountToolSchema>;

async function execute(userId: string, params: DeleteAccountParams): Promise<{ deleted: true }> {
  const existing = await getAccountById(userId, params.accountId);
  if (!existing) throw new ToolExecutionError("Conta não encontrada.");

  try {
    const deleted = await deleteAccount(userId, params.accountId);
    if (!deleted) throw new ToolExecutionError("Conta não encontrada.");
  } catch (error) {
    if (error instanceof AccountNotEmptyError) throw new ToolExecutionError(error.message);
    throw error;
  }
  return { deleted: true };
}

export const deleteAccountTool: AiTool<DeleteAccountParams, { deleted: true }> = {
  name: "delete_account",
  description:
    "Elimina uma conta — só funciona se a conta nunca teve nenhuma transação, meta, recorrência ou investimento associado (senão é rejeitado, nunca apaga histórico em cascata). Para uma conta com histórico, usa set_account_archived em vez disto. `accountId` tem de vir de get_accounts. Escrita financeira — exige confirmação explícita.",
  paramsSchema: DeleteAccountToolSchema,
  riskTier: "HIGH",
  summarize: (params) => `Eliminar a conta${params.accountName ? ` "${params.accountName}"` : ""} — só funciona se nunca foi usada.`,
  execute,
};

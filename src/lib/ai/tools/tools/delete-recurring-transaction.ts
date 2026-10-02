// KONTA AI — tool: delete_recurring_transaction (HIGH, Task 1). Elimina o
// template; as Transaction já geradas sobrevivem (FK SetNull, ver
// prisma/manual-sql/0007_recurring_transaction_fk_setnull.sql). Ação
// irreversível — exige sempre confirmação explícita.
import { z } from "zod";
import { deleteRecurringTransaction } from "@/lib/db/recurring-transactions";
import { ToolExecutionError, type AiTool } from "../types";

const DeleteRecurringTransactionParamsSchema = z
  .object({ recurringTransactionId: z.string().min(1, "Falta o id da recorrência a remover.") })
  .strict();
type DeleteRecurringTransactionParams = z.infer<typeof DeleteRecurringTransactionParamsSchema>;

export interface AiToolDeleteResult {
  deleted: true;
}

async function execute(userId: string, params: DeleteRecurringTransactionParams): Promise<AiToolDeleteResult> {
  // deleteRecurringTransaction (src/lib/db/recurring-transactions.ts) já
  // filtra sempre por "userId" = $1 AND id = $2 — nunca elimina a série de
  // outro utilizador mesmo adivinhando o id.
  const deleted = await deleteRecurringTransaction(userId, params.recurringTransactionId);
  if (!deleted) throw new ToolExecutionError("Recorrência não encontrada.");
  return { deleted: true };
}

export const deleteRecurringTransactionTool: AiTool<DeleteRecurringTransactionParams, AiToolDeleteResult> = {
  name: "delete_recurring_transaction",
  description:
    "Remove uma série recorrente existente, identificada pelo id (obtido previamente via get_recurring_transactions). As transações já geradas por esta série NÃO são apagadas, só deixam de estar ligadas a ela. Ação irreversível — exige confirmação explícita.",
  paramsSchema: DeleteRecurringTransactionParamsSchema,
  riskTier: "HIGH",
  summarize: () => "Remover esta recorrência. As transações já geradas por ela ficam, só a série deixa de existir. Esta ação não pode ser desfeita.",
  execute,
};

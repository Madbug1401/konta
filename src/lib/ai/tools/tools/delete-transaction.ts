// KONTA AI — tool: delete_transaction (HIGH). Ver docs/konta-ai-design.html,
// secções E e L. Escrita financeira — exige sempre confirmação explícita.
import { z } from "zod";
import { deleteTransaction } from "@/lib/db/transactions";
import { ToolExecutionError, type AiTool } from "../types";

const DeleteTransactionParamsSchema = z
  .object({ id: z.string().min(1, "Falta o id da transação a remover.") })
  .strict();
type DeleteTransactionParams = z.infer<typeof DeleteTransactionParamsSchema>;

export interface AiToolDeleteResult {
  deleted: true;
}

async function execute(userId: string, params: DeleteTransactionParams): Promise<AiToolDeleteResult> {
  // [Política de eliminação — IMPORTANTE] Transaction, ao contrário de
  // Account, não tem arquivamento nem "status" de eliminação — a política
  // REAL e já existente (DELETE /api/transactions/[id], ver
  // src/lib/db/transactions.ts::deleteTransaction) é eliminação física
  // direta, sempre restrita por "userId" = $1 AND id = $2. Esta tool
  // reutiliza exatamente essa função: nunca inventa um hard delete "novo"
  // específico para IA, e nunca oferece ao modelo a escolha entre "arquivar"
  // e "apagar de vez" — essa escolha não existe para Transaction em lado
  // nenhum do sistema, humano incluído.
  const deleted = await deleteTransaction(userId, params.id);
  if (!deleted) throw new ToolExecutionError("Transação não encontrada.");
  return { deleted: true };
}

export const deleteTransactionTool: AiTool<DeleteTransactionParams, AiToolDeleteResult> = {
  name: "delete_transaction",
  description:
    "Remove uma transação existente do utilizador, identificada pelo id (obtido previamente via get_transactions). Ação irreversível — exige confirmação explícita.",
  paramsSchema: DeleteTransactionParamsSchema,
  riskTier: "HIGH",
  summarize: () => "Remover esta transação. Esta ação não pode ser desfeita.",
  execute,
};

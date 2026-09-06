// KONTA AI — tool: update_transaction (HIGH). Ver docs/konta-ai-design.html,
// secções E e L. Escrita financeira — exige sempre confirmação explícita.
import { z } from "zod";
import { UpdateTransactionSchema } from "@/app/api/transactions/[id]/route";
import { getCategoryById, type CategoryRow } from "@/lib/db/categories";
import { updateTransaction } from "@/lib/db/transactions";
import { toAiToolTransaction, type AiToolTransaction } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

// [DECISÃO] Estende literalmente o schema já usado por
// PATCH /api/transactions/[id] — só acrescenta `id` (o alvo da atualização,
// que na rota HTTP vem do URL, não do corpo). Mesmas regras de validação,
// nenhuma duplicada. `id` é o único identificador que o modelo pode
// legitimamente ter em mãos: veio de um resultado anterior de
// get_transactions (ver src/lib/ai/tools/shared.ts).
const UpdateTransactionToolSchema = UpdateTransactionSchema.extend({
  id: z.string().min(1, "Falta o id da transação a atualizar."),
}).strict();
type UpdateTransactionParams = z.infer<typeof UpdateTransactionToolSchema>;

async function execute(userId: string, params: UpdateTransactionParams): Promise<AiToolTransaction> {
  // [Ownership] Mesma verificação já feita pela rota HTTP antes de aceitar
  // um categoryId — nunca confiar que uma categoria "existe", só que existe
  // E pertence a este utilizador (ou é de sistema).
  let category: CategoryRow | null = null;
  if (params.categoryId) {
    category = await getCategoryById(userId, params.categoryId);
    if (!category) throw new ToolExecutionError("Categoria não encontrada.");
  }

  // updateTransaction (src/lib/db/transactions.ts) já filtra sempre por
  // "userId" = $1 AND id = $2 — não é possível atualizar uma transação de
  // outro utilizador mesmo adivinhando o id.
  const updated = await updateTransaction(userId, params.id, {
    amountMinor: params.amountMinor !== undefined ? BigInt(params.amountMinor) : undefined,
    categoryId: params.categoryId,
    description: params.description,
    date: params.date,
  });
  if (!updated) throw new ToolExecutionError("Transação não encontrada.");

  return toAiToolTransaction(updated, category ? [category] : []);
}

export const updateTransactionTool: AiTool<UpdateTransactionParams, AiToolTransaction> = {
  name: "update_transaction",
  description:
    "Atualiza o valor, categoria, descrição ou data de uma transação existente do utilizador, identificada pelo id (obtido previamente via get_transactions). Escrita financeira — exige confirmação explícita.",
  paramsSchema: UpdateTransactionToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const changes: string[] = [];
    if (params.amountMinor !== undefined) changes.push(`valor para ${params.amountMinor.toLocaleString("pt-CV")} (moeda da conta)`);
    if (params.description) changes.push(`descrição para "${params.description}"`);
    if (params.date) changes.push(`data para ${params.date}`);
    if (params.categoryId) changes.push("categoria");
    return `Atualizar a transação${changes.length > 0 ? ": " + changes.join(", ") : ""}.`;
  },
  execute,
};

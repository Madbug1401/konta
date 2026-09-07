// KONTA AI — tool: update_transaction (HIGH). Ver docs/konta-ai-design.html,
// secções E e L. Escrita financeira — exige sempre confirmação explícita.
import { z } from "zod";
import { UpdateTransactionSchema } from "@/app/api/transactions/[id]/route";
import { getTransactionById, updateTransaction } from "@/lib/db/transactions";
import { resolveCategoryByName, toAiToolTransaction, type AiToolTransaction } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

// [DECISÃO] Estende o schema já usado por PATCH /api/transactions/[id] —
// mas troca `categoryId` (um id interno da base de dados) por `category`
// (o NOME em texto livre da categoria) e acrescenta `id` (o alvo da
// atualização, que na rota HTTP vem do URL, não do corpo). `id` é o único
// identificador que o modelo pode legitimamente ter em mãos: veio de um
// resultado anterior de get_transactions (ver src/lib/ai/tools/shared.ts).
//
// [Correção — 07/09/2026, mesmo bug de create-transaction.ts] `categoryId`
// nunca foi um valor que o modelo pudesse legitimamente ter — nenhuma tool
// desta V1 alguma vez expõe um categoryId real (ver
// get-transactions.ts). Substituído por `category` (nome), resolvido em
// `execute` via `resolveCategoryByName` (reutiliza uma categoria existente
// com esse nome, ou cria uma nova — mesma ação que um humano já pode fazer).
// `UpdateTransactionSchema` é um `z.object` simples (sem `.refine()`
// encadeados), por isso `.omit()`/`.extend()` funcionam diretamente aqui,
// ao contrário de CreateTransactionSchema (ver comentário em
// create-transaction.ts).
const UpdateTransactionToolSchema = UpdateTransactionSchema.omit({ categoryId: true })
  .extend({
    id: z.string().min(1, "Falta o id da transação a atualizar."),
    category: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
type UpdateTransactionParams = z.infer<typeof UpdateTransactionToolSchema>;

async function execute(userId: string, params: UpdateTransactionParams): Promise<AiToolTransaction> {
  // Precisamos do `type` da transação já existente para saber com que
  // `kind` de categoria (INCOME/EXPENSE) resolver `category` — este schema
  // nunca permite mudar o tipo de uma transação já criada (mesma regra da
  // rota HTTP: type não está em UpdateTransactionSchema). `getTransactionById`
  // já filtra por userId — nunca revela uma transação de outro utilizador.
  const existing = await getTransactionById(userId, params.id);
  if (!existing) throw new ToolExecutionError("Transação não encontrada.");

  // [Ownership] Mesma regra de create-transaction.ts: nunca inventar um
  // categoryId, resolver sempre pelo nome — ignorado para TRANSFER (nunca
  // têm categoria).
  const category =
    params.category && existing.type !== "TRANSFER" ? await resolveCategoryByName(userId, params.category, existing.type) : null;

  // updateTransaction (src/lib/db/transactions.ts) já filtra sempre por
  // "userId" = $1 AND id = $2 — não é possível atualizar uma transação de
  // outro utilizador mesmo adivinhando o id.
  const updated = await updateTransaction(userId, params.id, {
    amountMinor: params.amountMinor !== undefined ? BigInt(params.amountMinor) : undefined,
    categoryId: params.category ? (category?.id ?? null) : undefined,
    description: params.description,
    date: params.date,
  });
  if (!updated) throw new ToolExecutionError("Transação não encontrada.");

  return toAiToolTransaction(updated, category ? [category] : []);
}

export const updateTransactionTool: AiTool<UpdateTransactionParams, AiToolTransaction> = {
  name: "update_transaction",
  description:
    'Atualiza o valor, categoria (por nome, ex: "Alimentação" — nunca um id), descrição ou data de uma transação existente do utilizador, identificada pelo id (obtido previamente via get_transactions). Escrita financeira — exige confirmação explícita.',
  paramsSchema: UpdateTransactionToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const changes: string[] = [];
    if (params.amountMinor !== undefined) changes.push(`valor para ${params.amountMinor.toLocaleString("pt-CV")} (moeda da conta)`);
    if (params.description) changes.push(`descrição para "${params.description}"`);
    if (params.date) changes.push(`data para ${params.date}`);
    if (params.category) changes.push(`categoria para "${params.category}"`);
    return `Atualizar a transação${changes.length > 0 ? ": " + changes.join(", ") : ""}.`;
  },
  execute,
};

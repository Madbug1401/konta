// KONTA AI — tool: update_recurring_transaction (HIGH, Task 1). Ver
// src/app/api/recurring-transactions/[id]/route.ts para a mesma validação
// (ownership, self-transfer, moeda) — reutilizada aqui, nunca duplicada.
// Escrita financeira — exige sempre confirmação explícita.
import { z } from "zod";
import { UpdateRecurringTransactionSchema } from "@/app/api/recurring-transactions/[id]/route";
import { getAccountById } from "@/lib/db/accounts";
import { getRecurringTransactionById, updateRecurringTransaction } from "@/lib/db/recurring-transactions";
import { resolveCategoryByName } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

// [DECISÃO] Mesmo padrão de update-transaction.ts: troca `categoryId` (id
// interno) por `category` (nome em texto livre, nunca exposto como id ao
// modelo) e acrescenta `recurringTransactionId` (o alvo, vindo sempre de
// get_recurring_transactions). `currency`/`type` continuam de fora — nunca
// editáveis, mesma regra da rota HTTP.
const UpdateRecurringTransactionToolSchema = UpdateRecurringTransactionSchema.omit({ categoryId: true })
  .extend({
    recurringTransactionId: z.string().min(1, "Falta o id da recorrência a atualizar."),
    category: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
type UpdateRecurringTransactionParams = z.infer<typeof UpdateRecurringTransactionToolSchema>;

async function execute(userId: string, params: UpdateRecurringTransactionParams): Promise<{ id: string }> {
  const existing = await getRecurringTransactionById(userId, params.recurringTransactionId);
  if (!existing) throw new ToolExecutionError("Recorrência não encontrada.");

  // [Mesma validação de PATCH /api/recurring-transactions/[id] — ver
  // comentário lá] `type` não é editável: presença/ausência de destino
  // decide-se sempre pelo type ORIGINAL da série.
  if (params.destinationAccountId !== undefined) {
    if (existing.type !== "TRANSFER") {
      throw new ToolExecutionError("Só uma série de transferência pode ter conta de destino.");
    }
    if (params.destinationAccountId === null) {
      throw new ToolExecutionError("Uma série de transferência precisa sempre de uma conta de destino.");
    }
  }

  const nextAccountId = params.accountId ?? existing.accountId;
  const nextDestinationAccountId = params.destinationAccountId !== undefined ? params.destinationAccountId : existing.destinationAccountId;

  if ((params.accountId !== undefined || params.destinationAccountId !== undefined) && nextDestinationAccountId === nextAccountId) {
    throw new ToolExecutionError("A conta de destino tem de ser diferente da conta de origem.");
  }

  if (params.accountId !== undefined) {
    const account = await getAccountById(userId, params.accountId);
    if (!account) throw new ToolExecutionError("Conta não encontrada.");
    if (account.isArchived) throw new ToolExecutionError("Esta conta está arquivada.");
  }

  if (params.destinationAccountId) {
    const destination = await getAccountById(userId, params.destinationAccountId);
    if (!destination) throw new ToolExecutionError("Conta de destino não encontrada.");
    if (destination.isArchived) throw new ToolExecutionError("A conta de destino está arquivada.");
  }

  if (existing.type === "TRANSFER" && nextDestinationAccountId && (params.accountId !== undefined || params.destinationAccountId !== undefined)) {
    const [origin, destination] = await Promise.all([
      getAccountById(userId, nextAccountId),
      getAccountById(userId, nextDestinationAccountId),
    ]);
    if (origin && destination && origin.currency !== destination.currency) {
      throw new ToolExecutionError("Transferências entre contas de moedas diferentes ainda não são suportadas.");
    }
  }

  const category =
    params.category && existing.type !== "TRANSFER" ? await resolveCategoryByName(userId, params.category, existing.type) : null;

  const updated = await updateRecurringTransaction(userId, params.recurringTransactionId, {
    accountId: params.accountId,
    destinationAccountId: params.destinationAccountId,
    amountMinor: params.amountMinor !== undefined ? BigInt(params.amountMinor) : undefined,
    categoryId: params.category ? (category?.id ?? null) : undefined,
    description: params.description,
    frequency: params.frequency,
    interval: params.interval,
    startDate: params.startDate,
    endDate: params.endDate,
    occurrencesTotal: params.occurrencesTotal,
  });
  if (!updated) throw new ToolExecutionError("Recorrência não encontrada.");

  return { id: updated.id };
}

export const updateRecurringTransactionTool: AiTool<UpdateRecurringTransactionParams, { id: string }> = {
  name: "update_recurring_transaction",
  description:
    "Atualiza uma série recorrente existente — valor, conta, categoria (por nome, nunca id), descrição, frequência, datas. `recurringTransactionId` tem de vir de get_recurring_transactions. Nunca muda `type` nem a moeda da série, e nunca toca nas transações já geradas por esta série (só afeta ocorrências futuras). Escrita financeira — exige confirmação explícita.",
  paramsSchema: UpdateRecurringTransactionToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const changes: string[] = [];
    if (params.amountMinor !== undefined) changes.push(`valor para ${params.amountMinor.toLocaleString("pt-CV")} (moeda da conta)`);
    if (params.description) changes.push(`descrição para "${params.description}"`);
    if (params.category) changes.push(`categoria para "${params.category}"`);
    if (params.frequency) changes.push(`frequência para ${params.frequency.toLowerCase()}`);
    return `Atualizar a recorrência${changes.length > 0 ? ": " + changes.join(", ") : ""}.`;
  },
  execute,
};

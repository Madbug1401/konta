// KONTA AI — tool: create_recurring_transaction (HIGH, Milestone 6).
// Mesmas regras de POST /api/recurring-transactions (TRANSFER exige
// destinationAccountId diferente da origem). `category` é o NOME em texto
// livre, nunca um id — mesmo princípio de create_transaction (ver
// resolveCategoryByName em ../shared.ts). Nunca materializa nada aqui: a
// primeira ocorrência só é gerada por materializeDueOccurrences, que já
// corre automaticamente noutro sítio (ver get-recurring-transactions.ts).
import { z } from "zod";
import { getAccountById } from "@/lib/db/accounts";
import { createRecurringTransaction } from "@/lib/db/recurring-transactions";
import { resolveCategoryByName } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

const CreateRecurringTransactionToolSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
    accountId: z.string().min(1),
    destinationAccountId: z.string().min(1).optional(),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    category: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(255),
    frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().min(1).max(365).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    occurrencesTotal: z.number().int().min(1).max(10_000).optional(),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict()
  .refine((data) => (data.type === "TRANSFER" ? !!data.destinationAccountId : true), {
    message: "Uma transferência precisa de uma conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => (data.type !== "TRANSFER" ? !data.destinationAccountId : true), {
    message: "Só uma transferência pode ter conta de destino.",
    path: ["destinationAccountId"],
  })
  .refine((data) => data.accountId !== data.destinationAccountId, {
    message: "A conta de destino tem de ser diferente da conta de origem.",
    path: ["destinationAccountId"],
  });
type CreateRecurringTransactionParams = z.infer<typeof CreateRecurringTransactionToolSchema>;

async function execute(userId: string, params: CreateRecurringTransactionParams): Promise<{ id: string }> {
  const account = await getAccountById(userId, params.accountId);
  if (!account) throw new ToolExecutionError("Conta não encontrada.");
  if (account.isArchived) throw new ToolExecutionError("Esta conta está arquivada.");

  if (params.destinationAccountId) {
    const destination = await getAccountById(userId, params.destinationAccountId);
    if (!destination) throw new ToolExecutionError("Conta de destino não encontrada.");
    if (destination.isArchived) throw new ToolExecutionError("A conta de destino está arquivada.");
  }

  const category =
    params.category && params.type !== "TRANSFER" ? await resolveCategoryByName(userId, params.category, params.type) : null;

  const series = await createRecurringTransaction({
    userId,
    type: params.type,
    accountId: params.accountId,
    destinationAccountId: params.destinationAccountId,
    amountMinor: BigInt(params.amountMinor),
    currency: account.currency,
    categoryId: category?.id ?? null,
    description: params.description,
    frequency: params.frequency,
    interval: params.interval,
    startDate: params.startDate,
    endDate: params.endDate,
    occurrencesTotal: params.occurrencesTotal,
  });
  return { id: series.id };
}

export const createRecurringTransactionTool: AiTool<CreateRecurringTransactionParams, { id: string }> = {
  name: "create_recurring_transaction",
  description:
    "Cria uma série de transações recorrentes (receita, despesa ou transferência) numa conta. Usa `category` (nome em texto livre, nunca id) para receitas/despesas. A primeira transação real só aparece quando a série for materializada automaticamente (nunca a partir desta tool). Escrita financeira — exige confirmação explícita.",
  paramsSchema: CreateRecurringTransactionToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const accountPhrase = params.accountName ? ` em "${params.accountName}"` : "";
    return `Criar uma recorrência ${params.frequency.toLowerCase()} de ${params.amountMinor.toLocaleString("pt-CV")}${accountPhrase} — "${params.description}", a partir de ${params.startDate}.`;
  },
  execute,
};

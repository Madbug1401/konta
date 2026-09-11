// KONTA AI — tool: create_goal (HIGH, Milestone 6).
// `linkedAccountId` é obrigatório (mesma regra de POST /api/goals) — sem
// conta associada não há saldo para calcular progresso. Para contribuir ou
// retirar dinheiro de uma meta depois de criada, usa create_transaction
// contra esta conta (ver comentário em shared.ts::AiToolGoal) — nunca uma
// tool própria de "contribuir".
import { z } from "zod";
import { getAccountById } from "@/lib/db/accounts";
import { createGoal } from "@/lib/db/goals";
import { ToolExecutionError, type AiTool } from "../types";

const CreateGoalToolSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    targetAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().length(3).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    linkedAccountId: z.string().min(1),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type CreateGoalParams = z.infer<typeof CreateGoalToolSchema>;

async function execute(userId: string, params: CreateGoalParams): Promise<{ id: string; name: string }> {
  const account = await getAccountById(userId, params.linkedAccountId);
  if (!account) throw new ToolExecutionError("Conta não encontrada.");

  const goal = await createGoal({
    userId,
    name: params.name,
    description: params.description,
    targetAmountMinor: BigInt(params.targetAmountMinor),
    currency: params.currency ?? account.currency,
    targetDate: params.targetDate,
    linkedAccountId: params.linkedAccountId,
  });
  return { id: goal.id, name: goal.name };
}

export const createGoalTool: AiTool<CreateGoalParams, { id: string; name: string }> = {
  name: "create_goal",
  description:
    "Cria uma nova meta financeira, ligada obrigatoriamente a uma conta (linkedAccountId, de get_accounts) — o progresso da meta É o saldo dessa conta. Se o utilizador não tiver uma conta dedicada para a meta, pergunta se quer criar uma primeiro (create_account) ou usar uma existente. Escrita financeira — exige confirmação explícita.",
  paramsSchema: CreateGoalToolSchema,
  riskTier: "HIGH",
  summarize: (params) =>
    `Criar a meta "${params.name}" de ${params.targetAmountMinor.toLocaleString("pt-CV")}${params.accountName ? ` ligada à conta "${params.accountName}"` : ""}${params.targetDate ? `, até ${params.targetDate}` : ""}.`,
  execute,
};

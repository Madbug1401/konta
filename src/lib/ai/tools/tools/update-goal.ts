// KONTA AI — tool: update_goal (HIGH, Milestone 6).
// `linkedAccountId` nunca faz parte deste schema de propósito (ver
// comentário em src/lib/db/goals.ts::updateGoal) — trocar a conta ligada
// trocaria instantaneamente todo o histórico de progresso sem aviso.
import { z } from "zod";
import { getGoalById, updateGoal } from "@/lib/db/goals";
import { ToolExecutionError, type AiTool } from "../types";

const UpdateGoalToolSchema = z
  .object({
    goalId: z.string().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    targetAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();
type UpdateGoalParams = z.infer<typeof UpdateGoalToolSchema>;

async function execute(userId: string, params: UpdateGoalParams): Promise<{ id: string; name: string }> {
  const existing = await getGoalById(userId, params.goalId);
  if (!existing) throw new ToolExecutionError("Meta não encontrada.");

  const updated = await updateGoal(userId, params.goalId, {
    name: params.name,
    description: params.description,
    targetAmountMinor: params.targetAmountMinor !== undefined ? BigInt(params.targetAmountMinor) : undefined,
    targetDate: params.targetDate,
  });
  if (!updated) throw new ToolExecutionError("Meta não encontrada.");
  return { id: updated.id, name: updated.name };
}

export const updateGoalTool: AiTool<UpdateGoalParams, { id: string; name: string }> = {
  name: "update_goal",
  description:
    "Atualiza o nome, descrição, valor-alvo ou data-alvo de uma meta existente (nunca a conta ligada — essa fica fixa depois de criada). `goalId` tem de vir de get_goals. Escrita financeira — exige confirmação explícita.",
  paramsSchema: UpdateGoalToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const changes: string[] = [];
    if (params.name) changes.push(`nome para "${params.name}"`);
    if (params.targetAmountMinor !== undefined) changes.push(`valor-alvo para ${params.targetAmountMinor.toLocaleString("pt-CV")}`);
    if (params.targetDate !== undefined) changes.push("data-alvo");
    if (params.description !== undefined) changes.push("descrição");
    return `Atualizar a meta${changes.length > 0 ? ": " + changes.join(", ") : ""}.`;
  },
  execute,
};

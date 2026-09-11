// KONTA AI — tool: update_goal_status (HIGH, Milestone 6).
// Só ACHIEVED/ABANDONED (nunca ACTIVE) — mesma regra de
// POST /api/goals/[id]/status: não existe forma de "reabrir" uma meta
// encerrada (irreversível de propósito, ver src/lib/db/goals.ts).
import { z } from "zod";
import { getGoalById, updateGoalStatus } from "@/lib/db/goals";
import { ToolExecutionError, type AiTool } from "../types";

const UpdateGoalStatusToolSchema = z
  .object({
    goalId: z.string().min(1),
    status: z.enum(["ACHIEVED", "ABANDONED"]),
    goalName: z.string().trim().max(120).optional(),
  })
  .strict();
type UpdateGoalStatusParams = z.infer<typeof UpdateGoalStatusToolSchema>;

async function execute(userId: string, params: UpdateGoalStatusParams): Promise<{ status: string }> {
  const existing = await getGoalById(userId, params.goalId);
  if (!existing) throw new ToolExecutionError("Meta não encontrada.");
  if (existing.status !== "ACTIVE") throw new ToolExecutionError("Só uma meta ativa pode mudar de estado.");

  const updated = await updateGoalStatus(userId, params.goalId, params.status);
  if (!updated) throw new ToolExecutionError("Não foi possível atualizar a meta.");
  return { status: updated.status };
}

function describeStatus(status: UpdateGoalStatusParams["status"]): string {
  return status === "ACHIEVED" ? "concluída" : "abandonada";
}

export const updateGoalStatusTool: AiTool<UpdateGoalStatusParams, { status: string }> = {
  name: "update_goal_status",
  description:
    'Marca uma meta ATIVA como concluída (ACHIEVED, ex: "conclui esta meta") ou abandonada (ABANDONED). Irreversível: não existe forma de reabrir uma meta encerrada. `goalId` tem de vir de get_goals. Escrita financeira — exige confirmação explícita.',
  paramsSchema: UpdateGoalStatusToolSchema,
  riskTier: "HIGH",
  summarize: (params) =>
    `Marcar a meta${params.goalName ? ` "${params.goalName}"` : ""} como ${describeStatus(params.status)} — ação irreversível.`,
  execute,
};

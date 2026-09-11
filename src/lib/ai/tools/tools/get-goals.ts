// KONTA AI — tool: get_goals (LOW). Ver docs/konta-ai-design.html, secção L.
//
// [Milestone 6] DTO trocado de `AiGoalSummary` (Context Builder, só texto de
// prompt, nunca id) para `AiToolGoal` (shared.ts, com `id` da meta e
// `linkedAccountId`) — é a única forma do modelo poder referenciar uma meta
// específica em `update_goal`/`update_goal_status`, e poder contribuir/
// retirar dela via create_transaction (accountId = linkedAccountId, goalId =
// este id — nunca uma tool própria de "contribuir", ver comentário em
// shared.ts::AiToolGoal). Mesmos cálculos do Financial Engine
// (`getGoalProgress`/`calculateGoalProjection`), nunca reimplementados.
import { z } from "zod";
import { GOAL_PROJECTION_LOOKBACK_DAYS } from "@/lib/ai/context";
import { listAccounts } from "@/lib/db/accounts";
import { listGoals } from "@/lib/db/goals";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { daysFromToday, getTodayInTimezone } from "@/lib/financial-engine";
import { toAiToolGoal, type AiToolGoal } from "../shared";
import type { AiTool } from "../types";

const GetGoalsParamsSchema = z.object({}).strict();
type GetGoalsParams = z.infer<typeof GetGoalsParamsSchema>;

async function execute(userId: string): Promise<AiToolGoal[]> {
  const [user, goals, accounts, transactions] = await Promise.all([
    findUserById(userId),
    listGoals(userId),
    listAccounts(userId),
    listAllTransactionsForBalances(userId),
  ]);
  const timezone = user?.timezone ?? "Atlantic/Cape_Verde";
  const today = getTodayInTimezone(timezone);
  const lookbackStart = daysFromToday(timezone, -GOAL_PROJECTION_LOOKBACK_DAYS);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  return goals.map((goal) =>
    toAiToolGoal(
      goal,
      goal.linkedAccountId ? accountsById.get(goal.linkedAccountId) : undefined,
      transactions,
      today,
      lookbackStart,
      GOAL_PROJECTION_LOOKBACK_DAYS,
    ),
  );
}

export const getGoalsTool: AiTool<GetGoalsParams, AiToolGoal[]> = {
  name: "get_goals",
  description:
    "Lista as metas do utilizador, com progresso, projeção de conclusão, e a conta ligada a cada uma. Usa o `id` para update_goal/update_goal_status; usa `linkedAccountId` como `accountId` de um create_transaction (com `goalId` = este `id`) para registar uma contribuição ou levantamento — nunca inventes um id.",
  paramsSchema: GetGoalsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas metas.",
  execute,
};

// KONTA AI — tool: get_goals (LOW). Ver docs/konta-ai-design.html, secção L.
import { z } from "zod";
import { buildGoalSummaries, GOAL_PROJECTION_LOOKBACK_DAYS, type AiGoalSummary } from "@/lib/ai/context";
import { listAccounts } from "@/lib/db/accounts";
import { listGoals } from "@/lib/db/goals";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { daysFromToday, getTodayInTimezone } from "@/lib/financial-engine";
import type { AiTool } from "../types";

const GetGoalsParamsSchema = z.object({}).strict();
type GetGoalsParams = z.infer<typeof GetGoalsParamsSchema>;

async function execute(userId: string): Promise<AiGoalSummary[]> {
  const [user, goals, accounts, transactions] = await Promise.all([
    findUserById(userId),
    listGoals(userId),
    listAccounts(userId),
    listAllTransactionsForBalances(userId),
  ]);
  const timezone = user?.timezone ?? "Atlantic/Cape_Verde";
  const today = getTodayInTimezone(timezone);
  const lookbackStart = daysFromToday(timezone, -GOAL_PROJECTION_LOOKBACK_DAYS);
  // Reutiliza o mesmo cálculo (progresso, projeção de conclusão) já testado
  // no Context Builder (Milestone 2) — nunca reimplementado aqui.
  return buildGoalSummaries(goals, accounts, transactions, today, lookbackStart, GOAL_PROJECTION_LOOKBACK_DAYS);
}

export const getGoalsTool: AiTool<GetGoalsParams, AiGoalSummary[]> = {
  name: "get_goals",
  description: "Lista as metas do utilizador, com progresso e projeção de conclusão.",
  paramsSchema: GetGoalsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas metas.",
  execute,
};

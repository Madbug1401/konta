// KONTA AI — tool: get_goal_analysis (LOW, Milestone Analytics).
// [Não confundir com get_goals] get_goals (Milestone 6) devolve o id de cada
// meta para uma escrita subsequente (update_goal/create_transaction com
// goalId). Esta tool é analítica: progresso/contribuições no PERÍODO
// selecionado — nunca escreve, nunca é o caminho para obter um id.
import { collectAnalyticsDataset, getGoalAnalysis } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters, type AnalyticsFilterParams } from "../analytics-shared";
import type { AiTool } from "../types";

async function execute(userId: string, params: AnalyticsFilterParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  return getGoalAnalysis(dataset, filters);
}

export const getGoalAnalysisTool: AiTool<AnalyticsFilterParams, ReturnType<typeof getGoalAnalysis>> = {
  name: "get_goal_analysis",
  description:
    "Análise de metas: progresso, valor acumulado/restante, contribuições feitas DENTRO do período selecionado, e projeção de conclusão ao ritmo atual (sempre marcada como projeção, nunca certeza). Para obter o id de uma meta para editar/contribuir, usa get_goals em vez desta.",
  paramsSchema: AnalyticsFilterParamsSchema,
  riskTier: "LOW",
  summarize: () => "Analisar as tuas metas.",
  execute,
};

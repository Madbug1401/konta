// KONTA AI — tool: get_recurring_analysis (LOW, Milestone Analytics).
import { collectAnalyticsDataset, getRecurringAnalysis } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters, type AnalyticsFilterParams } from "../analytics-shared";
import type { AiTool } from "../types";

async function execute(userId: string, params: AnalyticsFilterParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  return getRecurringAnalysis(dataset, filters);
}

export const getRecurringAnalysisTool: AiTool<AnalyticsFilterParams, ReturnType<typeof getRecurringAnalysis>> = {
  name: "get_recurring_analysis",
  description:
    "Análise de despesas/receitas recorrentes ativas: valor mensal equivalente (normalizado por frequência — aproximação explícita), e que % da despesa mensal média do período elas representam. Usa para 'quanto pesam as minhas recorrências no orçamento'.",
  paramsSchema: AnalyticsFilterParamsSchema,
  riskTier: "LOW",
  summarize: () => "Analisar as tuas despesas/receitas recorrentes.",
  execute,
};

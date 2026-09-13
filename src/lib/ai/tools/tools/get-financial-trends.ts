// KONTA AI — tool: get_financial_trends (LOW, Milestone Analytics).
import { collectAnalyticsDataset, getFinancialTrends } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters, type AnalyticsFilterParams } from "../analytics-shared";
import type { AiTool } from "../types";

async function execute(userId: string, params: AnalyticsFilterParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  return getFinancialTrends(dataset, filters);
}

export const getFinancialTrendsTool: AiTool<AnalyticsFilterParams, ReturnType<typeof getFinancialTrends>> = {
  name: "get_financial_trends",
  description:
    "Tendências (crescente/decrescente/estável, estatística simples explicável — nunca causalidade inventada) de receita/despesa/cash flow/património nos últimos 6 meses, e as categorias que mais cresceram/diminuíram (só quando há período de comparação). Usa para 'qual é a minha tendência financeira' ou 'que categorias estão a crescer'.",
  paramsSchema: AnalyticsFilterParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas tendências financeiras.",
  execute,
};

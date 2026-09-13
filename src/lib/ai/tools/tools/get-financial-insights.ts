// KONTA AI — tool: get_financial_insights (LOW, Milestone Analytics).
// Todos os insights são determinísticos (src/lib/analytics/insights.ts) —
// esta tool nunca deixa o Claude inventar um; só devolve os que já foram
// calculados a partir de dados reais.
import { collectAnalyticsDataset, getFinancialInsights } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters, type AnalyticsFilterParams } from "../analytics-shared";
import type { AiTool } from "../types";

async function execute(userId: string, params: AnalyticsFilterParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  return getFinancialInsights(dataset, filters);
}

export const getFinancialInsightsTool: AiTool<AnalyticsFilterParams, ReturnType<typeof getFinancialInsights>> = {
  name: "get_financial_insights",
  description:
    "Lista de observações/alertas/oportunidades financeiras já calculadas a partir de dados reais (variações de categoria acima de 15%, peso de recorrências/dívidas, contribuições a metas) — cada uma com a métrica e a fonte exatas. Nunca inventes um insight que não venha desta lista.",
  paramsSchema: AnalyticsFilterParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar os insights financeiros.",
  execute,
};

// KONTA AI — tool: get_analytics_overview (LOW, Milestone Analytics).
// READ-ONLY: reutiliza collectAnalyticsDataset + getAnalyticsOverview — nunca
// um segundo cálculo financeiro. Ver docs/architecture/OVERVIEW.md, secção
// "Konta Analytics".
import { collectAnalyticsDataset, getAnalyticsOverview, type AiVisualization } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters, type AnalyticsFilterParams } from "../analytics-shared";
import type { AiTool } from "../types";

async function execute(userId: string, params: AnalyticsFilterParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  const overview = getAnalyticsOverview(dataset, filters);

  // [Milestone Analytics — visualização declarativa, secção 31 do pedido]
  // Só quando há período de comparação — nunca inventa um "anterior" para
  // preencher o gráfico. Revalidado de qualquer forma pelo orquestrador
  // (parseAiVisualization) antes de chegar ao frontend — nunca confiado só
  // por vir daqui.
  const visualization: AiVisualization | undefined = overview.comparisonPeriod
    ? {
        type: "comparison",
        title: "Cash flow",
        current: { label: overview.period.label, value: overview.cashflow.current },
        previous: { label: overview.comparisonPeriod.label, value: overview.cashflow.previous ?? "—" },
        changePercent: overview.cashflow.changePercent,
      }
    : undefined;

  return { ...overview, visualization };
}

export const getAnalyticsOverviewTool: AiTool<AnalyticsFilterParams, ReturnType<typeof getAnalyticsOverview>> = {
  name: "get_analytics_overview",
  description:
    "Resumo financeiro (receita, despesa, cash flow, taxa de poupança, saldo disponível, património, dívidas em aberto, progresso médio de metas) para um período, comparado com o período anterior. `period` é um preset (this_month/last_month/last_30d/last_90d/this_year/last_year/last_12_months/custom — 'custom' exige from/to); omitido, assume 'this_month'. Usa isto para 'como estão as minhas finanças?'.",
  paramsSchema: AnalyticsFilterParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar o resumo financeiro.",
  execute,
};

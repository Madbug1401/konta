// KONTA AI — tool: get_cashflow_analysis (LOW, Milestone Analytics).
import { z } from "zod";
import { collectAnalyticsDataset, getCashflowAnalysis, type AiVisualization } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters } from "../analytics-shared";
import type { AiTool } from "../types";

const GetCashflowAnalysisToolSchema = AnalyticsFilterParamsSchema.extend({
  granularity: z.enum(["day", "week", "month"]).optional(),
}).strict();
type GetCashflowAnalysisParams = z.infer<typeof GetCashflowAnalysisToolSchema>;

// Limite do schema de visualização (visualization.ts: max 60 pontos) — um
// período personalizado muito longo pode gerar mais buckets do que isso;
// mostra sempre os mais recentes, nunca rejeita a chamada por causa disto
// (a tabela de dados em `buckets` continua completa, só o gráfico é que
// corta).
const MAX_CHART_POINTS = 60;

async function execute(userId: string, params: GetCashflowAnalysisParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  const analysis = getCashflowAnalysis(dataset, filters, params.granularity);

  const visualization: AiVisualization = {
    type: "bar",
    title: "Cash flow",
    data: analysis.buckets.slice(-MAX_CHART_POINTS).map((b) => ({ label: b.label, value: Number(b.cashflowMinor) })),
    unit: analysis.currency,
  };

  return { ...analysis, visualization };
}

export const getCashflowAnalysisTool: AiTool<GetCashflowAnalysisParams, ReturnType<typeof getCashflowAnalysis>> = {
  name: "get_cashflow_analysis",
  description:
    "Evolução de receitas/despesas/cash flow ao longo do período, dividida em dia/semana/mês (granularidade automática se omitida), com os totais comparados ao período anterior. Usa para 'mostra a evolução do meu fluxo de caixa' ou 'compara este mês com o anterior'.",
  paramsSchema: GetCashflowAnalysisToolSchema,
  riskTier: "LOW",
  summarize: () => "Consultar o fluxo de caixa.",
  execute,
};

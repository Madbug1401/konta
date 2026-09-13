// KONTA AI — tool: get_category_analysis (LOW, Milestone Analytics).
// `categoryName` (texto livre) resolve para um id real via resolveCategoryName
// — mesma disciplina de nunca aceitar um id inventado pelo modelo (secção 15
// do pedido: exact match -> unique partial match -> ambiguity -> clarification).
import { z } from "zod";
import { collectAnalyticsDataset, getCategoryAnalysis, getCategoryDrilldown, resolveCategoryName, type AiVisualization } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters } from "../analytics-shared";
import { ToolExecutionError, type AiTool } from "../types";

const MAX_CHART_CATEGORIES = 10;

const GetCategoryAnalysisToolSchema = AnalyticsFilterParamsSchema.extend({
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  /** Nome em texto livre — se dado, devolve o DRILL-DOWN dessa categoria em vez da tabela inteira. */
  categoryName: z.string().trim().min(1).max(120).optional(),
}).strict();
type GetCategoryAnalysisParams = z.infer<typeof GetCategoryAnalysisToolSchema>;

async function execute(userId: string, params: GetCategoryAnalysisParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);

  if (!params.categoryName) {
    const rows = getCategoryAnalysis(dataset, filters, params.type ?? "EXPENSE");
    const visualization: AiVisualization | undefined =
      rows.length > 0
        ? { type: "bar", title: "Categorias", data: rows.slice(0, MAX_CHART_CATEGORIES).map((r) => ({ label: r.categoryName, value: Number(r.currentMinor) })), unit: filters.currency }
        : undefined;
    return { rows, visualization };
  }

  const resolution = resolveCategoryName(dataset, params.categoryName);
  if (resolution.status === "not_found") throw new ToolExecutionError(`Categoria "${params.categoryName}" não encontrada.`);
  if (resolution.status === "ambiguous") {
    throw new ToolExecutionError(`Categoria ambígua — encontrei mais do que uma: ${resolution.matches.join(", ")}. Pergunta ao utilizador qual.`);
  }
  return { drilldown: getCategoryDrilldown(dataset, filters, resolution.categoryId) };
}

export const getCategoryAnalysisTool: AiTool<GetCategoryAnalysisParams, Awaited<ReturnType<typeof execute>>> = {
  name: "get_category_analysis",
  description:
    "Sem `categoryName`: tabela de TODAS as categorias (atual, anterior, variação %, % das despesas do período). Com `categoryName` (nome em texto livre, nunca id): drill-down de UMA categoria (total, % das despesas, variação, média por transação, maiores transações). Se o nome for ambíguo, pergunta ao utilizador qual antes de repetir a chamada.",
  paramsSchema: GetCategoryAnalysisToolSchema,
  riskTier: "LOW",
  summarize: (params) => (params.categoryName ? `Consultar a categoria "${params.categoryName}".` : "Consultar as tuas categorias."),
  execute,
};

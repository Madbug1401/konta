// KONTA AI — tool: get_debt_analysis (LOW, Milestone Analytics).
//
// [Não confundir com get_debts] `get_debts` (Milestone 6) lista dívidas com
// id de cada dívida/parcela — usada para RESOLVER ids antes de uma escrita
// (pay_debt_installment/update_debt/mark_debt_defaulted). Esta tool é
// analítica: agregados do período selecionado (total, % da receita
// comprometida, parcelas do período) — nunca escreve, nunca é o caminho
// para obter um id.
import { collectAnalyticsDataset, getDebtAnalysis } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters, type AnalyticsFilterParams } from "../analytics-shared";
import type { AiTool } from "../types";

async function execute(userId: string, params: AnalyticsFilterParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  return getDebtAnalysis(dataset, filters);
}

export const getDebtAnalysisTool: AiTool<AnalyticsFilterParams, ReturnType<typeof getDebtAnalysis>> = {
  name: "get_debt_analysis",
  description:
    "Análise agregada de dívidas para um período: total original/restante/pago, parcelas com vencimento nesse período, e quanto essas parcelas representam da receita do mesmo período (indicador explicável, nunca uma previsão de risco). Para obter o id de uma dívida/parcela para pagar ou editar, usa get_debts em vez desta.",
  paramsSchema: AnalyticsFilterParamsSchema,
  riskTier: "LOW",
  summarize: () => "Analisar as tuas dívidas.",
  execute,
};

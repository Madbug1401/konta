// KONTA AI — tool: get_investment_analysis (LOW, Milestone Analytics).
// READ-ONLY por natureza — o Konta não tem nenhuma operação de compra/venda
// de ativos, por isso esta tool nunca podia oferecer isso (secção 14/33 do
// pedido: "Analytics é READ-ONLY").
import { z } from "zod";
import { collectAnalyticsDataset, currenciesInUse, getInvestmentAnalysis } from "@/lib/analytics";
import type { AiTool } from "../types";

const GetInvestmentAnalysisToolSchema = z.object({ currency: z.string().length(3).optional() }).strict();
type GetInvestmentAnalysisParams = z.infer<typeof GetInvestmentAnalysisToolSchema>;

async function execute(userId: string, params: GetInvestmentAnalysisParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const currency = params.currency ?? currenciesInUse(dataset)[0];
  return getInvestmentAnalysis(dataset, { currency });
}

export const getInvestmentAnalysisTool: AiTool<GetInvestmentAnalysisParams, ReturnType<typeof getInvestmentAnalysis>> = {
  name: "get_investment_analysis",
  description:
    "Análise de investimentos: capital investido, valor atual (só quando já existe avaliação registada — nunca inventado) e retorno, por conta de investimento. Nunca sugere comprar/vender nada — o Konta não suporta essa operação.",
  paramsSchema: GetInvestmentAnalysisToolSchema,
  riskTier: "LOW",
  summarize: () => "Analisar os teus investimentos.",
  execute,
};

// KONTA AI — tool: add_investment_valuation (HIGH, Milestone 6).
// Nunca edita/apaga uma avaliação antiga — só insere uma nova (mesma
// filosofia de histórico imutável já usada no resto do projeto, ver
// src/lib/db/investments.ts::addValuation). `valueMinor` pode ser 0, nunca
// negativo.
import { z } from "zod";
import { addValuation } from "@/lib/db/investments";
import { ToolExecutionError, type AiTool } from "../types";

const AddInvestmentValuationToolSchema = z
  .object({
    accountId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    valueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type AddInvestmentValuationParams = z.infer<typeof AddInvestmentValuationToolSchema>;

async function execute(userId: string, params: AddInvestmentValuationParams): Promise<{ date: string }> {
  const valuation = await addValuation(userId, params.accountId, { date: params.date, valueMinor: BigInt(params.valueMinor) });
  if (!valuation) throw new ToolExecutionError("Ainda não existe detalhe de investimento para esta conta.");
  return { date: valuation.date };
}

export const addInvestmentValuationTool: AiTool<AddInvestmentValuationParams, { date: string }> = {
  name: "add_investment_valuation",
  description:
    "Regista uma nova avaliação (valor atual, numa data) de uma conta de investimento — nunca edita uma avaliação antiga, só adiciona uma nova. `accountId` tem de vir de get_accounts/get_investments (a conta precisa de já ter create_investment_detail feito). Escrita financeira — exige confirmação explícita.",
  paramsSchema: AddInvestmentValuationToolSchema,
  riskTier: "HIGH",
  summarize: (params) =>
    `Registar uma avaliação de ${params.valueMinor.toLocaleString("pt-CV")}${params.accountName ? ` na conta "${params.accountName}"` : ""}, em ${params.date}.`,
  execute,
};

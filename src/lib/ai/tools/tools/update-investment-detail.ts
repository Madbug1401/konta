// KONTA AI — tool: update_investment_detail (HIGH, Milestone 6).
import { z } from "zod";
import { updateInvestmentDetail } from "@/lib/db/investments";
import { ToolExecutionError, type AiTool } from "../types";

const UpdateInvestmentDetailToolSchema = z
  .object({
    accountId: z.string().min(1),
    investmentType: z.string().trim().min(1).max(60).optional(),
    expectedReturnRate: z.number().min(0).max(999.999).nullable().optional(),
    maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type UpdateInvestmentDetailParams = z.infer<typeof UpdateInvestmentDetailToolSchema>;

async function execute(userId: string, params: UpdateInvestmentDetailParams): Promise<{ investmentType: string }> {
  const updated = await updateInvestmentDetail(userId, params.accountId, {
    investmentType: params.investmentType,
    expectedReturnRate: params.expectedReturnRate,
    maturityDate: params.maturityDate,
  });
  if (!updated) throw new ToolExecutionError("Detalhe de investimento não encontrado.");
  return { investmentType: updated.investmentType };
}

export const updateInvestmentDetailTool: AiTool<UpdateInvestmentDetailParams, { investmentType: string }> = {
  name: "update_investment_detail",
  description:
    "Atualiza o tipo, a taxa de retorno esperada ou a data de vencimento do detalhe de investimento de uma conta. `accountId` tem de vir de get_accounts/get_investments. Escrita financeira — exige confirmação explícita.",
  paramsSchema: UpdateInvestmentDetailToolSchema,
  riskTier: "HIGH",
  summarize: (params) => `Atualizar o investimento${params.accountName ? ` da conta "${params.accountName}"` : ""}.`,
  execute,
};

// KONTA AI — tool: create_investment_detail (HIGH, Milestone 6).
// A conta tem de já existir, pertencer ao utilizador E ser do tipo
// INVESTMENT — verificado dentro de createInvestmentDetail (join com
// Account), mesmo princípio de POST /api/accounts/[id]/investment-detail.
import { z } from "zod";
import { createInvestmentDetail } from "@/lib/db/investments";
import { ToolExecutionError, type AiTool } from "../types";

const CreateInvestmentDetailToolSchema = z
  .object({
    accountId: z.string().min(1),
    investmentType: z.string().trim().min(1).max(60),
    expectedReturnRate: z.number().min(0).max(999.999).nullable().optional(),
    maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    accountName: z.string().trim().max(255).optional(),
  })
  .strict();
type CreateInvestmentDetailParams = z.infer<typeof CreateInvestmentDetailToolSchema>;

async function execute(userId: string, params: CreateInvestmentDetailParams): Promise<{ investmentType: string }> {
  const detail = await createInvestmentDetail(userId, params.accountId, {
    investmentType: params.investmentType,
    expectedReturnRate: params.expectedReturnRate,
    maturityDate: params.maturityDate,
  });
  if (!detail) throw new ToolExecutionError("Conta não encontrada ou não é uma conta de investimento.");
  return { investmentType: detail.investmentType };
}

export const createInvestmentDetailTool: AiTool<CreateInvestmentDetailParams, { investmentType: string }> = {
  name: "create_investment_detail",
  description:
    "Regista o detalhe de investimento (tipo, taxa de retorno esperada, data de vencimento) de uma conta já existente do tipo INVESTMENT. `accountId` tem de vir de get_accounts (uma conta do tipo INVESTMENT). Escrita financeira — exige confirmação explícita.",
  paramsSchema: CreateInvestmentDetailToolSchema,
  riskTier: "HIGH",
  summarize: (params) =>
    `Registar o investimento "${params.investmentType}"${params.accountName ? ` na conta "${params.accountName}"` : ""}.`,
  execute,
};

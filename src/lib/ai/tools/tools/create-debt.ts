// KONTA AI — tool: create_debt (HIGH, Milestone 6).
// Escrita financeira — cria a dívida E o plano de parcelas (mesma operação
// atómica de POST /api/debts, via createDebtWithInstallments). `finalDueDate`
// nunca é um parâmetro — é sempre derivado do plano gerado, mesma regra da
// rota HTTP.
import { z } from "zod";
import { createDebtWithInstallments } from "@/lib/db/debts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { toAiToolDebt, type AiToolDebt } from "../shared";
import type { AiTool } from "../types";

// Mesmos limites de POST /api/debts — nunca mais permissão do que o
// formulário manual já dá.
const CreateDebtToolSchema = z
  .object({
    creditorName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    originalAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().length(3).optional(),
    interestRate: z.number().min(0).max(999.999).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    installmentCount: z.number().int().min(1).max(600),
    frequency: z.enum(["MONTHLY", "WEEKLY", "DAILY", "YEARLY"]).optional(),
  })
  .strict();
type CreateDebtParams = z.infer<typeof CreateDebtToolSchema>;

async function execute(userId: string, params: CreateDebtParams): Promise<AiToolDebt> {
  const debt = await createDebtWithInstallments({
    userId,
    creditorName: params.creditorName,
    description: params.description,
    originalAmountMinor: BigInt(params.originalAmountMinor),
    currency: params.currency,
    interestRate: params.interestRate,
    startDate: params.startDate,
    installmentCount: params.installmentCount,
    frequency: params.frequency,
  });
  const transactions = await listAllTransactionsForBalances(userId);
  return toAiToolDebt(debt, transactions);
}

export const createDebtTool: AiTool<CreateDebtParams, AiToolDebt> = {
  name: "create_debt",
  description:
    "Regista uma nova dívida com o seu plano de parcelas (gerado automaticamente a partir de originalAmountMinor/installmentCount/frequency — nunca peças ao utilizador para calcular parcelas). `currency` por omissão CVE, `frequency` por omissão MONTHLY. Escrita financeira — exige confirmação explícita.",
  paramsSchema: CreateDebtToolSchema,
  riskTier: "HIGH",
  summarize: (params) =>
    `Registar uma dívida a "${params.creditorName}" de ${params.originalAmountMinor.toLocaleString("pt-CV")} (moeda: ${params.currency ?? "CVE"}), em ${params.installmentCount} parcela(s) a partir de ${params.startDate}.`,
  execute,
};

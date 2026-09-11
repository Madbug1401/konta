// KONTA AI — tool: update_debt (HIGH, Milestone 6).
// Só campos informativos são editáveis (creditorName/description/
// interestRate) — mesmo limite de PATCH /api/debts/[debtId]. originalAmountMinor/
// startDate/installmentCount/frequency ficam de fora de propósito: já geraram
// o plano de parcelas persistido (ver comentário em
// src/lib/db/debts.ts::updateDebt) — editar isso agora desincronizaria do
// plano real sem regeneração nenhuma.
import { z } from "zod";
import { getDebtById, listDebts, updateDebt } from "@/lib/db/debts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { toAiToolDebt, type AiToolDebt } from "../shared";
import { ToolExecutionError, type AiTool } from "../types";

const UpdateDebtToolSchema = z
  .object({
    debtId: z.string().min(1),
    creditorName: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    interestRate: z.number().min(0).max(999.999).nullable().optional(),
  })
  .strict();
type UpdateDebtParams = z.infer<typeof UpdateDebtToolSchema>;

async function execute(userId: string, params: UpdateDebtParams): Promise<AiToolDebt> {
  const existing = await getDebtById(userId, params.debtId);
  if (!existing) throw new ToolExecutionError("Dívida não encontrada.");

  const updated = await updateDebt(userId, params.debtId, {
    creditorName: params.creditorName,
    description: params.description,
    interestRate: params.interestRate,
  });
  if (!updated) throw new ToolExecutionError("Dívida não encontrada.");

  const [allDebts, transactions] = await Promise.all([listDebts(userId), listAllTransactionsForBalances(userId)]);
  const withInstallments = allDebts.find((d) => d.id === updated.id);
  return toAiToolDebt({ ...updated, installments: withInstallments?.installments ?? [] }, transactions);
}

export const updateDebtTool: AiTool<UpdateDebtParams, AiToolDebt> = {
  name: "update_debt",
  description:
    "Atualiza o credor, a descrição ou a taxa de juro de uma dívida existente (nunca o valor original, data de início ou número de parcelas — esses ficam fixos depois de criada, já geraram o plano de parcelas). `debtId` tem de vir de get_debts. Escrita financeira — exige confirmação explícita.",
  paramsSchema: UpdateDebtToolSchema,
  riskTier: "HIGH",
  summarize: (params) => {
    const changes: string[] = [];
    if (params.creditorName) changes.push(`credor para "${params.creditorName}"`);
    if (params.description !== undefined) changes.push("descrição");
    if (params.interestRate !== undefined) changes.push("taxa de juro");
    return `Atualizar a dívida${changes.length > 0 ? ": " + changes.join(", ") : ""}.`;
  },
  execute,
};

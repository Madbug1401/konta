// KONTA AI — tool: mark_debt_defaulted (HIGH, Milestone 6).
//
// [IMPORTANTE — nunca confundir com "paga"] Isto marca a dívida como
// INCUMPRIDA (DEFAULTED) — o oposto de paga. Uma dívida fica paga
// automaticamente (PAID_OFF) quando a última parcela é paga via
// pay_debt_installment; não existe (nem aqui, nem na aplicação) uma ação
// "marcar dívida inteira como paga" independente das parcelas. Irreversível
// — a condição `status = 'ACTIVE'` no próprio SQL (ver
// src/lib/db/debts.ts::markDebtDefaulted) impede reabrir uma dívida já
// incumprida ou paga.
import { z } from "zod";
import { getDebtById, markDebtDefaulted } from "@/lib/db/debts";
import { ToolExecutionError, type AiTool } from "../types";

const MarkDebtDefaultedToolSchema = z
  .object({
    debtId: z.string().min(1),
    creditorName: z.string().trim().max(120).optional(),
  })
  .strict();
type MarkDebtDefaultedParams = z.infer<typeof MarkDebtDefaultedToolSchema>;

async function execute(userId: string, params: MarkDebtDefaultedParams): Promise<{ status: string }> {
  const existing = await getDebtById(userId, params.debtId);
  if (!existing) throw new ToolExecutionError("Dívida não encontrada.");
  if (existing.status !== "ACTIVE") throw new ToolExecutionError("Só uma dívida ativa pode ser marcada como incumprida.");

  const updated = await markDebtDefaulted(userId, params.debtId);
  if (!updated) throw new ToolExecutionError("Não foi possível marcar a dívida como incumprida.");
  return { status: updated.status };
}

export const markDebtDefaultedTool: AiTool<MarkDebtDefaultedParams, { status: string }> = {
  name: "mark_debt_defaulted",
  description:
    'Marca uma dívida ATIVA como incumprida (DEFAULTED) — usa só quando o utilizador disser claramente que não vai conseguir pagá-la (ex: "não vou conseguir pagar esta dívida", "marca como incumprida"). NUNCA uses isto para "marcar como paga" — uma dívida fica paga sozinha (PAID_OFF) quando todas as parcelas forem pagas via pay_debt_installment. Irreversível: não existe forma de reabrir uma dívida incumprida. `debtId` tem de vir de get_debts. Escrita financeira — exige confirmação explícita.',
  paramsSchema: MarkDebtDefaultedToolSchema,
  riskTier: "HIGH",
  summarize: (params) => `Marcar a dívida${params.creditorName ? ` a "${params.creditorName}"` : ""} como incumprida — ação irreversível.`,
  execute,
};

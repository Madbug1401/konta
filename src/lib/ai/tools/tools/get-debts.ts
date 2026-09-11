// KONTA AI — tool: get_debts (LOW). Ver docs/konta-ai-design.html, secção L.
//
// [Milestone 6] DTO trocado de `AiDebtSummary` (Context Builder, só texto de
// prompt, nunca id) para `AiToolDebt` (shared.ts, com `id` da dívida e de
// cada parcela) — é a única forma do modelo poder referenciar uma dívida ou
// parcela específica em `update_debt`/`pay_debt_installment`/
// `mark_debt_defaulted` a seguir. Mesmo cálculo do Financial Engine
// (`getDebtRemaining`), nunca reimplementado.
import { z } from "zod";
import { listDebts } from "@/lib/db/debts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { toAiToolDebt, type AiToolDebt } from "../shared";
import type { AiTool } from "../types";

const GetDebtsParamsSchema = z.object({}).strict();
type GetDebtsParams = z.infer<typeof GetDebtsParamsSchema>;

async function execute(userId: string): Promise<AiToolDebt[]> {
  const [debts, transactions] = await Promise.all([listDebts(userId), listAllTransactionsForBalances(userId)]);
  return debts.map((debt) => toAiToolDebt(debt, transactions));
}

export const getDebtsTool: AiTool<GetDebtsParams, AiToolDebt[]> = {
  name: "get_debts",
  description:
    "Lista as dívidas do utilizador, com saldo em falta e todas as parcelas (id, data, valor, estado). Usa o `id` da dívida/parcela para update_debt, pay_debt_installment ou mark_debt_defaulted — nunca inventes um id.",
  paramsSchema: GetDebtsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas dívidas.",
  execute,
};

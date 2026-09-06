// KONTA AI — tool: get_debts (LOW). Ver docs/konta-ai-design.html, secção L.
import { z } from "zod";
import { buildDebtSummaries, type AiDebtSummary } from "@/lib/ai/context";
import { listDebts } from "@/lib/db/debts";
import { listAllTransactionsForBalances } from "@/lib/db/transactions";
import { findUserById } from "@/lib/db/users";
import { getTodayInTimezone } from "@/lib/financial-engine";
import type { AiTool } from "../types";

const GetDebtsParamsSchema = z.object({}).strict();
type GetDebtsParams = z.infer<typeof GetDebtsParamsSchema>;

async function execute(userId: string): Promise<AiDebtSummary[]> {
  const [user, debts, transactions] = await Promise.all([
    findUserById(userId),
    listDebts(userId),
    listAllTransactionsForBalances(userId),
  ]);
  const today = getTodayInTimezone(user?.timezone ?? "Atlantic/Cape_Verde");
  // Reutiliza o mesmo cálculo (saldo em dívida, parcelas a vencer/em atraso)
  // já testado no Context Builder (Milestone 2) — nunca reimplementado aqui.
  return buildDebtSummaries(debts, transactions, today);
}

export const getDebtsTool: AiTool<GetDebtsParams, AiDebtSummary[]> = {
  name: "get_debts",
  description: "Lista as dívidas do utilizador, com saldo em falta e próximas parcelas.",
  paramsSchema: GetDebtsParamsSchema,
  riskTier: "LOW",
  summarize: () => "Consultar as tuas dívidas.",
  execute,
};

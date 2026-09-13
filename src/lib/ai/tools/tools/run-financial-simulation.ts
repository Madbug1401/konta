// KONTA AI — tool: run_financial_simulation (LOW, Milestone Analytics).
//
// [REGRA ABSOLUTA — secção 17/33 do pedido] Puramente analítico — nunca
// escreve na base de dados, nunca cria/altera uma Transaction/Goal real
// (ver src/lib/analytics/simulations.ts). Por isso é LOW, não HIGH: não há
// nenhuma escrita a confirmar. Se o utilizador quiser EXECUTAR a mudança
// simulada de verdade, a Konta AI usa create_transaction/update_goal (as
// tools normais, com a sua própria confirmação HIGH) — esta tool nunca é
// esse caminho.
import { z } from "zod";
import { collectAnalyticsDataset, runFinancialSimulation, SimulationInputError } from "@/lib/analytics";
import { AnalyticsFilterParamsSchema, resolveAnalyticsFilters } from "../analytics-shared";
import { ToolExecutionError, type AiTool } from "../types";

const RunFinancialSimulationToolSchema = AnalyticsFilterParamsSchema.extend({
  type: z.enum(["reduce_category", "adjust_expenses", "increase_goal_contribution"]),
  categoryName: z.string().trim().min(1).max(120).optional(),
  percent: z.number().min(1).max(100).optional(),
  amountMinorDelta: z.number().int().optional(),
  goalId: z.string().min(1).optional(),
  extraAmountMinor: z.number().int().positive().optional(),
})
  .strict()
  .refine((d) => (d.type === "reduce_category" ? !!d.categoryName && d.percent !== undefined : true), {
    message: "reduce_category exige categoryName e percent.",
  })
  .refine((d) => (d.type === "adjust_expenses" ? d.amountMinorDelta !== undefined : true), { message: "adjust_expenses exige amountMinorDelta." })
  .refine((d) => (d.type === "increase_goal_contribution" ? !!d.goalId && d.extraAmountMinor !== undefined : true), {
    message: "increase_goal_contribution exige goalId e extraAmountMinor.",
  });
type RunFinancialSimulationParams = z.infer<typeof RunFinancialSimulationToolSchema>;

async function execute(userId: string, params: RunFinancialSimulationParams) {
  const dataset = await collectAnalyticsDataset(userId);
  const filters = resolveAnalyticsFilters(dataset, params);
  try {
    if (params.type === "reduce_category") {
      return runFinancialSimulation(dataset, filters, { type: "reduce_category", categoryName: params.categoryName!, percent: params.percent! });
    }
    if (params.type === "adjust_expenses") {
      return runFinancialSimulation(dataset, filters, { type: "adjust_expenses", amountMinorDelta: params.amountMinorDelta! });
    }
    return runFinancialSimulation(dataset, filters, {
      type: "increase_goal_contribution",
      goalId: params.goalId!,
      extraAmountMinor: params.extraAmountMinor!,
    });
  } catch (error) {
    if (error instanceof SimulationInputError) throw new ToolExecutionError(error.message);
    throw error;
  }
}

export const runFinancialSimulationTool: AiTool<RunFinancialSimulationParams, Awaited<ReturnType<typeof execute>>> = {
  name: "run_financial_simulation",
  description:
    'Simula (NUNCA executa de verdade) o impacto de: reduzir uma categoria em X% ("reduce_category", exige categoryName+percent), ajustar a despesa total por um valor ("adjust_expenses", exige amountMinorDelta — negativo para poupar, positivo para gastar mais), ou aumentar a contribuição para uma meta ("increase_goal_contribution", exige goalId de get_goals + extraAmountMinor). Devolve sempre REAL vs SIMULADO lado a lado, nunca altera dados. Se o utilizador quiser mesmo aplicar a mudança, usa as tools normais de escrita depois.',
  paramsSchema: RunFinancialSimulationToolSchema,
  riskTier: "LOW",
  summarize: () => "Simular um cenário financeiro (sem alterar nada real).",
  execute,
};

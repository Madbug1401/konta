// ============================================================================
// KONTA ANALYTICS — Simulações What-If (Milestone Analytics).
//
// [REGRA ABSOLUTA — secção 17/33 do pedido] Puramente analítico: NUNCA
// escreve na base de dados, nunca cria/altera uma Transaction/Goal real.
// Cada resultado separa explicitamente REAL de SIMULADO — nunca um número
// só, que pudesse ser confundido com dado real. Todos os cálculos reutilizam
// getExpenseTotal/getCashflow/getSavingsRate/calculateGoalProjection
// (Financial Engine) sobre os mesmos totais já obtidos por outros módulos
// desta camada — nunca uma segunda fórmula financeira paralela.
// ============================================================================

import { calculateGoalProjection, formatMinor, getAccountBalance, getExpenseTotal, getIncomeTotal, type MinorAmount } from "@/lib/financial-engine";
import type { AnalyticsDataset } from "./dataset";
import { getCategoryAnalysis, resolveCategoryName } from "./categories";
import type { AnalyticsFilters } from "./types";

export class SimulationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationInputError";
  }
}

export type SimulationInput =
  | { type: "reduce_category"; categoryName: string; percent: number }
  | { type: "adjust_expenses"; amountMinorDelta: number }
  | { type: "increase_goal_contribution"; goalId: string; extraAmountMinor: number };

interface SimulationSnapshot {
  incomeMinor: MinorAmount;
  expenseMinor: MinorAmount;
  cashflowMinor: MinorAmount;
  savingsRatePercent: number | null;
}

function snapshot(incomeMinor: MinorAmount, expenseMinor: MinorAmount): SimulationSnapshot {
  const cashflowMinor = incomeMinor - expenseMinor;
  const savingsRatePercent = incomeMinor === 0n ? null : (Number(cashflowMinor) / Number(incomeMinor)) * 100;
  return { incomeMinor, expenseMinor, cashflowMinor, savingsRatePercent };
}

function formatSnapshot(s: SimulationSnapshot, currency: string) {
  return {
    income: formatMinor(s.incomeMinor, currency),
    expenses: formatMinor(s.expenseMinor, currency),
    cashflow: formatMinor(s.cashflowMinor, currency),
    savingsRatePercent: s.savingsRatePercent,
  };
}

export interface SimulationResult {
  currency: string;
  periodLabel: string;
  real: ReturnType<typeof formatSnapshot>;
  simulated: ReturnType<typeof formatSnapshot>;
  assumptions: string[];
  /** Só presente para "increase_goal_contribution" — a projeção da meta com a contribuição extra, sempre rotulada como projeção. */
  goalProjection?: { estimatedCompletionDate: string | null; onTrack: boolean | null };
}

export function runFinancialSimulation(dataset: AnalyticsDataset, filters: AnalyticsFilters, input: SimulationInput): SimulationResult {
  const { currency, period } = filters;
  const incomeMinor = getIncomeTotal(dataset.transactions, period, currency);
  const expenseMinor = getExpenseTotal(dataset.transactions, period, currency);
  const real = snapshot(incomeMinor, expenseMinor);

  if (input.type === "reduce_category") {
    if (input.percent <= 0 || input.percent > 100) throw new SimulationInputError("A percentagem de redução tem de estar entre 1 e 100.");
    const resolution = resolveCategoryName(dataset, input.categoryName);
    if (resolution.status === "not_found") throw new SimulationInputError(`Categoria "${input.categoryName}" não encontrada.`);
    if (resolution.status === "ambiguous") throw new SimulationInputError(`Categoria ambígua: ${resolution.matches.join(", ")}.`);

    const categoryRow = getCategoryAnalysis(dataset, filters).find((r) => r.categoryId === resolution.categoryId);
    const categoryAmountMinor = categoryRow?.currentMinor ?? 0n;
    const reductionMinor = (categoryAmountMinor * BigInt(Math.round(input.percent * 100))) / 10_000n;
    const simulatedExpenseMinor = expenseMinor - reductionMinor;
    const simulated = snapshot(incomeMinor, simulatedExpenseMinor);

    return {
      currency,
      periodLabel: period.label,
      real: formatSnapshot(real, currency),
      simulated: formatSnapshot(simulated, currency),
      assumptions: [
        `Redução de ${input.percent}% em "${resolution.categoryName}" (atual: ${formatMinor(categoryAmountMinor, currency)}).`,
        "Assume que as restantes despesas do período se mantêm exatamente iguais.",
      ],
    };
  }

  if (input.type === "adjust_expenses") {
    if (!Number.isFinite(input.amountMinorDelta)) throw new SimulationInputError("Valor de ajuste inválido.");
    const deltaMinor = BigInt(Math.round(input.amountMinorDelta));
    const simulatedExpenseMinor = expenseMinor + deltaMinor > 0n ? expenseMinor + deltaMinor : 0n;
    const simulated = snapshot(incomeMinor, simulatedExpenseMinor);
    return {
      currency,
      periodLabel: period.label,
      real: formatSnapshot(real, currency),
      simulated: formatSnapshot(simulated, currency),
      assumptions: [
        `Despesa ajustada em ${deltaMinor >= 0n ? "+" : ""}${formatMinor(deltaMinor, currency)} face ao período real.`,
        "Assume que a receita do período se mantém exatamente igual.",
      ],
    };
  }

  // increase_goal_contribution
  if (input.extraAmountMinor <= 0) throw new SimulationInputError("O valor extra tem de ser positivo.");
  const goal = dataset.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new SimulationInputError("Meta não encontrada.");
  const accountsById = new Map(dataset.accounts.map((a) => [a.id, a]));
  const linkedAccount = goal.linkedAccountId ? accountsById.get(goal.linkedAccountId) : undefined;
  const currentAmountMinor = linkedAccount ? getAccountBalance(linkedAccount, dataset.transactions, period.end) : 0n;
  const extraMinor = BigInt(Math.round(input.extraAmountMinor));
  const periodDays = Math.max(1, Math.round((new Date(`${period.end}T00:00:00Z`).getTime() - new Date(`${period.start}T00:00:00Z`).getTime()) / 86_400_000) + 1);
  const projection = calculateGoalProjection(goal, currentAmountMinor, extraMinor, periodDays, period.end);
  const simulatedExpenseMinor = expenseMinor + extraMinor; // dinheiro desviado para a meta reduz o que sobra, tal como uma despesa
  const simulated = snapshot(incomeMinor, simulatedExpenseMinor);

  return {
    currency: goal.currency,
    periodLabel: period.label,
    real: formatSnapshot(real, currency),
    simulated: formatSnapshot(simulated, goal.currency),
    assumptions: [
      `Contribuição extra de ${formatMinor(extraMinor, goal.currency)} para a meta "${goal.name}".`,
      "A projeção assume que este ritmo extra se mantém — é uma estimativa, nunca uma certeza.",
    ],
    goalProjection: { estimatedCompletionDate: projection.estimatedCompletionDate, onTrack: projection.onTrack },
  };
}

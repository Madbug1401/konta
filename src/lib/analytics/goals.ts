// ============================================================================
// KONTA ANALYTICS — Metas (Milestone Analytics).
//
// Reutiliza getGoalProgress/calculateGoalProjection (Financial Engine) —
// nunca reimplementados. "Ritmo de contribuição" usa a soma de transações
// com `goalId` = esta meta DENTRO do período selecionado (o mesmo período
// que o utilizador escolheu na página, não uma janela fixa) — a projeção
// resultante é sempre marcada como projeção, nunca como certeza (secção 13
// do pedido).
// ============================================================================

import { calculateGoalProjection, formatMinor, getGoalProgress, sum, type MinorAmount } from "@/lib/financial-engine";
import type { AnalyticsDataset } from "./dataset";
import type { AnalyticsFilters } from "./types";

export interface GoalAnalysisRow {
  goalId: string;
  name: string;
  status: string;
  targetAmountMinor: MinorAmount;
  targetAmount: string;
  currentAmountMinor: MinorAmount;
  currentAmount: string;
  remaining: string;
  progressPercent: number;
  contributionsInPeriod: string;
  /** Sempre rotulado como projeção — nunca uma certeza (secção 13 do pedido). */
  projection: { estimatedCompletionDate: string | null; onTrack: boolean | null };
}

export interface GoalAnalysis {
  currency: string;
  activeCount: number;
  averageProgressPercent: number | null;
  goals: GoalAnalysisRow[];
}

export function getGoalAnalysis(dataset: AnalyticsDataset, filters: AnalyticsFilters): GoalAnalysis {
  const { currency, period } = filters;
  const accountsById = new Map(dataset.accounts.map((a) => [a.id, a]));
  const relevantGoals = dataset.goals.filter((g) => g.currency === currency);
  const periodDays = daysBetween(period.start, period.end);

  const rows: GoalAnalysisRow[] = relevantGoals.map((goal) => {
    const linkedAccount = goal.linkedAccountId ? accountsById.get(goal.linkedAccountId) : undefined;
    const progress = getGoalProgress(goal, linkedAccount, dataset.transactions, period.end);
    const contributionsInPeriodMinor = sum(
      dataset.transactions
        .filter((t) => t.goalId === goal.id && t.date >= period.start && t.date <= period.end)
        .map((t) => t.amountMinor),
    );
    const projection = calculateGoalProjection(goal, progress.currentAmountMinor, contributionsInPeriodMinor, periodDays, period.end);
    return {
      goalId: goal.id,
      name: goal.name,
      status: goal.status,
      targetAmountMinor: goal.targetAmountMinor,
      targetAmount: formatMinor(goal.targetAmountMinor, currency),
      currentAmountMinor: progress.currentAmountMinor,
      currentAmount: formatMinor(progress.currentAmountMinor, currency),
      remaining: formatMinor(goal.targetAmountMinor - progress.currentAmountMinor, currency),
      progressPercent: Math.round(progress.progressPercent * 10) / 10,
      contributionsInPeriod: formatMinor(contributionsInPeriodMinor, currency),
      projection: { estimatedCompletionDate: projection.estimatedCompletionDate, onTrack: projection.onTrack },
    };
  });

  const activeRows = rows.filter((r) => r.status === "ACTIVE");
  const averageProgressPercent = activeRows.length > 0 ? activeRows.reduce((sum, r) => sum + r.progressPercent, 0) / activeRows.length : null;

  return { currency, activeCount: activeRows.length, averageProgressPercent, goals: rows };
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
}

// ============================================================================
// Metas.
//
// [DECISÃO 10] Corrige a limitação da auditoria de só existir uma meta global
// de poupança/investimento: cada Goal tem o seu próprio targetAmountMinor e
// (opcionalmente) uma Account dedicada cujo saldo é o progresso da meta —
// múltiplas metas coexistem sem se misturar.
// ============================================================================

import type { AccountRecord, GoalRecord, MinorAmount, TransactionRecord } from "./types";
import { getAccountBalance } from "./balance";

export interface GoalProgress {
  goalId: string;
  currentAmountMinor: MinorAmount;
  targetAmountMinor: MinorAmount;
  progressPercent: number; // 0-100, sem limite superior artificial (pode passar de 100 se ultrapassar a meta)
}

export function getGoalProgress(
  goal: GoalRecord,
  linkedAccount: AccountRecord | undefined,
  transactions: TransactionRecord[],
  asOfDate?: string,
): GoalProgress {
  // [Correção — ver DECISIONS.md "Saldo não pode incluir o futuro"] Tal como
  // o saldo de uma conta, o progresso de uma meta nunca deve contar dinheiro
  // datado no futuro como já "guardado" — daí receber e propagar `asOfDate`
  // em vez de deixar getAccountBalance somar tudo sem filtro de data.
  const currentAmountMinor = linkedAccount ? getAccountBalance(linkedAccount, transactions, asOfDate) : 0n;
  const progressPercent =
    goal.targetAmountMinor === 0n
      ? 0
      : (Number(currentAmountMinor) / Number(goal.targetAmountMinor)) * 100;
  return {
    goalId: goal.id,
    currentAmountMinor,
    targetAmountMinor: goal.targetAmountMinor,
    progressPercent,
  };
}

/**
 * Projeta se a meta será atingida até targetDate ao ritmo médio de
 * contribuição observado nos últimos `lookbackDays`. Devolve null quando não
 * há histórico suficiente para projetar — em vez de inventar uma data.
 */
export function calculateGoalProjection(
  goal: GoalRecord,
  currentAmountMinor: MinorAmount,
  contributionsLastPeriodMinor: MinorAmount,
  periodDays: number,
  todayIso: string,
): { estimatedCompletionDate: string | null; onTrack: boolean | null } {
  if (contributionsLastPeriodMinor <= 0n) {
    return { estimatedCompletionDate: null, onTrack: null };
  }
  const remaining = goal.targetAmountMinor - currentAmountMinor;
  if (remaining <= 0n) {
    return { estimatedCompletionDate: todayIso, onTrack: true };
  }
  const dailyRate = Number(contributionsLastPeriodMinor) / periodDays;
  const daysNeeded = Math.ceil(Number(remaining) / dailyRate);
  const estimated = new Date(todayIso);
  estimated.setDate(estimated.getDate() + daysNeeded);
  const estimatedCompletionDate = estimated.toISOString().slice(0, 10);
  const onTrack = goal.targetDate ? estimatedCompletionDate <= goal.targetDate : null;
  return { estimatedCompletionDate, onTrack };
}

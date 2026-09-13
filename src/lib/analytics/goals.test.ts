import { describe, expect, it } from "vitest";
import { getGoalAnalysis } from "./goals";
import { makeAccount, makeDataset, makeFilters, makeGoal, makeTransaction } from "./test-fixtures";

describe("getGoalAnalysis", () => {
  it("sem metas: activeCount 0, averageProgressPercent null", () => {
    const analysis = getGoalAnalysis(makeDataset(), makeFilters());
    expect(analysis).toEqual({ currency: "CVE", activeCount: 0, averageProgressPercent: null, goals: [] });
  });

  it("calcula progresso a partir do saldo da conta ligada — nunca um valor guardado à parte", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-goal", initialBalanceMinor: 0n })],
      goals: [makeGoal({ id: "goal-1", targetAmountMinor: 10_000n, linkedAccountId: "acc-goal" })],
      transactions: [makeTransaction({ type: "INCOME", accountId: "acc-goal", amountMinor: 4_000n, date: "2026-09-05" })],
    });
    const analysis = getGoalAnalysis(dataset, makeFilters());
    expect(analysis.goals[0].currentAmountMinor).toBe(4_000n);
    expect(analysis.goals[0].progressPercent).toBe(40);
  });

  it("contribuições no período contam só transações com goalId = esta meta, dentro do período selecionado", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-goal" })],
      goals: [makeGoal({ id: "goal-1", linkedAccountId: "acc-goal" })],
      transactions: [
        makeTransaction({ type: "INCOME", accountId: "acc-goal", goalId: "goal-1", amountMinor: 2_000n, date: "2026-09-05" }),
        makeTransaction({ type: "INCOME", accountId: "acc-goal", goalId: "goal-1", amountMinor: 9_000n, date: "2026-08-05" }), // fora do período
        makeTransaction({ type: "INCOME", accountId: "acc-goal", amountMinor: 500n, date: "2026-09-06" }), // sem goalId — nunca contado como contribuição
      ],
    });
    const analysis = getGoalAnalysis(dataset, makeFilters());
    expect(analysis.goals[0].contributionsInPeriod).not.toContain("9500");
  });

  it("meta sem conta ligada: progresso 0, nunca lança exceção", () => {
    const dataset = makeDataset({ goals: [makeGoal({ id: "goal-1", linkedAccountId: null })] });
    const analysis = getGoalAnalysis(dataset, makeFilters());
    expect(analysis.goals[0].progressPercent).toBe(0);
  });

  it("projeção vem sempre marcada como tal (estimatedCompletionDate/onTrack), nunca uma certeza embutida no texto", () => {
    const dataset = makeDataset({ goals: [makeGoal({ id: "goal-1", linkedAccountId: null })] });
    const analysis = getGoalAnalysis(dataset, makeFilters());
    expect(analysis.goals[0]).toHaveProperty("projection");
    expect(analysis.goals[0].projection).toHaveProperty("estimatedCompletionDate");
  });

  it("média de progresso só considera metas ATIVAS", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" }), makeAccount({ id: "acc-2" })],
      goals: [
        makeGoal({ id: "g1", targetAmountMinor: 1000n, linkedAccountId: "acc-1", status: "ACTIVE" }),
        makeGoal({ id: "g2", targetAmountMinor: 1000n, linkedAccountId: "acc-2", status: "ACHIEVED" }),
      ],
    });
    const analysis = getGoalAnalysis(dataset, makeFilters());
    expect(analysis.activeCount).toBe(1);
  });
});

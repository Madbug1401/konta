import { describe, expect, it } from "vitest";
import { runFinancialSimulation, SimulationInputError } from "./simulations";
import { makeAccount, makeCategory, makeDataset, makeFilters, makeGoal, makeTransaction } from "./test-fixtures";

describe("runFinancialSimulation — reduce_category", () => {
  it("reduz a categoria em X% e recalcula despesa/cashflow simulados — nunca altera o dataset real", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-food", name: "Alimentação" })],
      transactions: [
        makeTransaction({ type: "INCOME", amountMinor: 20_000n, date: "2026-09-01" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-food", amountMinor: 10_000n, date: "2026-09-05" }),
      ],
    });
    const result = runFinancialSimulation(dataset, makeFilters(), { type: "reduce_category", categoryName: "Alimentação", percent: 10 });
    expect(result.real.expenses.replace(/[^\d]/g, "")).toBe("10000");
    expect(result.simulated.expenses.replace(/[^\d]/g, "")).toBe("9000");
    expect(result.assumptions.length).toBeGreaterThan(0);
    // Nunca mutou o dataset original.
    expect(dataset.transactions.find((t) => t.categoryId === "cat-food")?.amountMinor).toBe(10_000n);
  });

  it("categoria inexistente lança SimulationInputError — nunca simula sobre um valor inventado", () => {
    const dataset = makeDataset();
    expect(() => runFinancialSimulation(dataset, makeFilters(), { type: "reduce_category", categoryName: "Não Existe", percent: 10 })).toThrow(
      SimulationInputError,
    );
  });

  it("percentagem fora de 1-100 é rejeitada", () => {
    const dataset = makeDataset({ categories: [makeCategory({ id: "cat-1", name: "X" })] });
    expect(() => runFinancialSimulation(dataset, makeFilters(), { type: "reduce_category", categoryName: "X", percent: 0 })).toThrow(SimulationInputError);
    expect(() => runFinancialSimulation(dataset, makeFilters(), { type: "reduce_category", categoryName: "X", percent: 150 })).toThrow(SimulationInputError);
  });
});

describe("runFinancialSimulation — adjust_expenses", () => {
  it("aumenta a despesa simulada por um delta fixo", () => {
    const dataset = makeDataset({ transactions: [makeTransaction({ type: "EXPENSE", amountMinor: 5000n, date: "2026-09-05" })] });
    const result = runFinancialSimulation(dataset, makeFilters(), { type: "adjust_expenses", amountMinorDelta: 2000 });
    expect(result.simulated.expenses.replace(/[^\d]/g, "")).toBe("7000");
  });

  it("nunca deixa a despesa simulada ficar negativa", () => {
    const dataset = makeDataset({ transactions: [makeTransaction({ type: "EXPENSE", amountMinor: 1000n, date: "2026-09-05" })] });
    const result = runFinancialSimulation(dataset, makeFilters(), { type: "adjust_expenses", amountMinorDelta: -999_999 });
    expect(result.simulated.expenses.replace(/[^\d]/g, "")).toBe("0");
  });
});

describe("runFinancialSimulation — increase_goal_contribution", () => {
  it("projeta a meta com a contribuição extra, sempre rotulada como projeção", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-goal" })],
      goals: [makeGoal({ id: "goal-1", linkedAccountId: "acc-goal", targetAmountMinor: 100_000n, currency: "CVE" })],
      transactions: [makeTransaction({ type: "INCOME", amountMinor: 30_000n, date: "2026-09-01" })],
    });
    const result = runFinancialSimulation(dataset, makeFilters(), { type: "increase_goal_contribution", goalId: "goal-1", extraAmountMinor: 5000 });
    expect(result.goalProjection).toBeDefined();
    expect(result.assumptions.some((a) => a.toLowerCase().includes("estimativa"))).toBe(true);
  });

  it("meta inexistente lança SimulationInputError", () => {
    const dataset = makeDataset();
    expect(() => runFinancialSimulation(dataset, makeFilters(), { type: "increase_goal_contribution", goalId: "goal-x", extraAmountMinor: 1000 })).toThrow(
      SimulationInputError,
    );
  });

  it("valor extra não positivo é rejeitado", () => {
    const dataset = makeDataset({ goals: [makeGoal({ id: "goal-1" })] });
    expect(() => runFinancialSimulation(dataset, makeFilters(), { type: "increase_goal_contribution", goalId: "goal-1", extraAmountMinor: 0 })).toThrow(
      SimulationInputError,
    );
  });
});

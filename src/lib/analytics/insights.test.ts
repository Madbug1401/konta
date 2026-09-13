import { describe, expect, it } from "vitest";
import { getFinancialInsights } from "./insights";
import { makeAccount, makeCategory, makeDataset, makeDebt, makeFilters, makeGoal, makeInstallment, makeRecurring, makeTransaction } from "./test-fixtures";

describe("getFinancialInsights", () => {
  it("sem dados: lista vazia — nunca um insight genérico inventado", () => {
    expect(getFinancialInsights(makeDataset(), makeFilters({ comparisonMode: "none", comparisonPeriod: null }))).toEqual([]);
  });

  it("cashflow melhorado gera um insight do tipo 'trend', com a métrica real anexada", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "INCOME", amountMinor: 10_000n, date: "2026-09-05" }),
        makeTransaction({ type: "INCOME", amountMinor: 5_000n, date: "2026-08-05" }),
      ],
    });
    const insights = getFinancialInsights(dataset, makeFilters());
    const cashflowInsight = insights.find((i) => i.id === "cashflow-change");
    expect(cashflowInsight?.kind).toBe("trend");
    expect(cashflowInsight?.source).toBe("getAnalyticsOverview.cashflow");
  });

  it("categoria com variação abaixo do limiar (15%) NÃO gera insight — evita ruído trivial", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-1", name: "Lazer" })],
      transactions: [
        makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 1000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 950n, date: "2026-08-05" }), // +5.3%, abaixo do limiar
      ],
    });
    const insights = getFinancialInsights(dataset, makeFilters());
    expect(insights.find((i) => i.id === "category-cat-1")).toBeUndefined();
  });

  it("categoria com variação acima do limiar gera insight com kind correto (alerta a subir, oportunidade a descer)", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-1", name: "Lazer" })],
      transactions: [
        makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 3000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 1000n, date: "2026-08-05" }),
      ],
    });
    const insights = getFinancialInsights(dataset, makeFilters());
    const categoryInsight = insights.find((i) => i.id === "category-cat-1");
    expect(categoryInsight?.kind).toBe("alert");
  });

  it("contribuição real para uma meta gera um insight de observação, nunca inventado", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-goal" })],
      goals: [makeGoal({ id: "goal-1", linkedAccountId: "acc-goal", targetAmountMinor: 10_000n })],
      transactions: [makeTransaction({ type: "INCOME", accountId: "acc-goal", goalId: "goal-1", amountMinor: 2_000n, date: "2026-09-05" })],
    });
    const insights = getFinancialInsights(dataset, makeFilters());
    expect(insights.find((i) => i.id === "goal-goal-1")).toBeDefined();
  });

  it("dívida com serviço de dívida acima de 30% da receita do período gera um alerta", () => {
    const debt = makeDebt({ id: "debt-1" }, [makeInstallment({ id: "i1", debtId: "debt-1", dueDate: "2026-09-10", amountMinor: 4000n })]);
    const dataset = makeDataset({
      debts: [debt],
      transactions: [makeTransaction({ type: "INCOME", amountMinor: 10_000n, date: "2026-09-01" })],
    });
    const insights = getFinancialInsights(dataset, makeFilters());
    expect(insights.find((i) => i.id === "debt-service-ratio")?.kind).toBe("alert");
  });

  it("recorrências com peso >= 30% do orçamento geram uma observação", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" })],
      recurring: [makeRecurring({ id: "rec-1", type: "EXPENSE", amountMinor: 4000n, accountId: "acc-1" })],
      transactions: [makeTransaction({ type: "EXPENSE", amountMinor: 10_000n, date: "2026-09-10" })],
    });
    const insights = getFinancialInsights(dataset, makeFilters());
    expect(insights.find((i) => i.id === "recurring-share")).toBeDefined();
  });
});

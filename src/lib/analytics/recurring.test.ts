import { describe, expect, it } from "vitest";
import { getRecurringAnalysis } from "./recurring";
import { makeAccount, makeDataset, makeFilters, makeRecurring, makeTransaction } from "./test-fixtures";

describe("getRecurringAnalysis", () => {
  it("sem recorrências: tudo zero, shareOfMonthlyExpensesPercent null", () => {
    const analysis = getRecurringAnalysis(makeDataset(), makeFilters());
    expect(analysis.activeCount).toBe(0);
    expect(analysis.shareOfMonthlyExpensesPercent).toBeNull();
  });

  it("normaliza séries MONTHLY diretamente (equivalente mensal = valor da série)", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" })],
      recurring: [makeRecurring({ id: "rec-1", type: "EXPENSE", frequency: "MONTHLY", amountMinor: 5000n, accountId: "acc-1" })],
    });
    const analysis = getRecurringAnalysis(dataset, makeFilters());
    expect(analysis.recurringMonthlyExpenseEquivalent).toContain("5000");
  });

  it("só conta séries ATIVAS no equivalente mensal — uma série em pausa entra na lista mas não no total", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" })],
      recurring: [
        makeRecurring({ id: "rec-1", type: "EXPENSE", amountMinor: 1000n, isActive: true, accountId: "acc-1" }),
        makeRecurring({ id: "rec-2", type: "EXPENSE", amountMinor: 999_999n, isActive: false, accountId: "acc-1" }),
      ],
    });
    const analysis = getRecurringAnalysis(dataset, makeFilters());
    expect(analysis.items).toHaveLength(2);
    expect(analysis.recurringMonthlyExpenseEquivalent).toContain("1000");
    expect(analysis.recurringMonthlyExpenseEquivalent).not.toContain("999999");
  });

  it("nunca soma receitas e despesas recorrentes juntas", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" })],
      recurring: [
        makeRecurring({ id: "rec-1", type: "EXPENSE", amountMinor: 1000n, accountId: "acc-1" }),
        makeRecurring({ id: "rec-2", type: "INCOME", amountMinor: 50_000n, accountId: "acc-1" }),
      ],
    });
    const analysis = getRecurringAnalysis(dataset, makeFilters());
    expect(analysis.recurringMonthlyExpenseEquivalent).toContain("1000");
    expect(analysis.recurringMonthlyIncomeEquivalent.replace(/[^\d]/g, "")).toBe("50000");
  });

  it("share da despesa mensal usa a despesa MÉDIA mensal do período, nunca dividido por zero", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" })],
      recurring: [makeRecurring({ id: "rec-1", type: "EXPENSE", amountMinor: 3000n, accountId: "acc-1" })],
      transactions: [makeTransaction({ type: "EXPENSE", amountMinor: 6000n, date: "2026-09-10" })],
    });
    const analysis = getRecurringAnalysis(dataset, makeFilters());
    expect(analysis.shareOfMonthlyExpensesPercent).toBe(50); // 3000 / 6000
  });
});

import { describe, expect, it } from "vitest";
import { getFinancialTrends } from "./trends";
import { makeCategory, makeDataset, makeFilters, makeTransaction } from "./test-fixtures";

describe("getFinancialTrends", () => {
  it("sem histórico: direção 'flat' em tudo, nunca lança exceção", () => {
    const trends = getFinancialTrends(makeDataset(), makeFilters({ comparisonMode: "none", comparisonPeriod: null }));
    expect(trends.income.direction).toBe("flat");
    expect(trends.windowMonths).toBe(6);
  });

  it("despesa a crescer consistentemente ao longo da janela: direção 'up'", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "EXPENSE", amountMinor: 1000n, date: "2026-05-10" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 1000n, date: "2026-06-10" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 5000n, date: "2026-08-10" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 5000n, date: "2026-09-10" }),
      ],
    });
    const trends = getFinancialTrends(dataset, makeFilters());
    expect(trends.expenses.direction).toBe("up");
  });

  it("variação pequena (< 5%) é classificada como 'flat' — nunca um falso sinal de tendência", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "EXPENSE", amountMinor: 1000n, date: "2026-05-10" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 1010n, date: "2026-09-10" }), // +1%
      ],
    });
    const trends = getFinancialTrends(dataset, makeFilters());
    expect(trends.expenses.direction).toBe("flat");
  });

  it("categorias em crescimento/queda só aparecem quando há período de comparação", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-1", name: "Lazer" })],
      transactions: [
        makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 5000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 1000n, date: "2026-08-05" }),
      ],
    });
    const withComparison = getFinancialTrends(dataset, makeFilters());
    expect(withComparison.topIncreasingCategories.length).toBeGreaterThan(0);

    const withoutComparison = getFinancialTrends(dataset, makeFilters({ comparisonMode: "none", comparisonPeriod: null }));
    expect(withoutComparison.topIncreasingCategories).toEqual([]);
  });

  it("nunca afirma causalidade — devolve só direção e série, nunca um texto explicativo embutido", () => {
    const trends = getFinancialTrends(makeDataset(), makeFilters());
    expect(trends.cashflow).not.toHaveProperty("reason");
    expect(trends.cashflow).not.toHaveProperty("cause");
  });
});

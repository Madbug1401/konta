import { describe, expect, it } from "vitest";
import { getAnalyticsOverview } from "./overview";
import { COMPARISON_PERIOD, makeAccount, makeDataset, makeFilters, makeTransaction } from "./test-fixtures";

describe("getAnalyticsOverview", () => {
  it("sem transações: tudo zero, sem percentagens inventadas", () => {
    const dataset = makeDataset();
    const overview = getAnalyticsOverview(dataset, makeFilters({ comparisonMode: "none", comparisonPeriod: null }));
    expect(overview.income.current).toBe("0 CVE");
    expect(overview.income.changePercent).toBeNull();
    expect(overview.debtsOutstanding).toBe("0 CVE");
    expect(overview.goals).toEqual({ activeCount: 0, averageProgressPercent: null });
  });

  it("calcula receita/despesa/cashflow do período e compara com o período anterior", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "INCOME", amountMinor: 10_000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 4_000n, date: "2026-09-10" }),
        makeTransaction({ type: "INCOME", amountMinor: 8_000n, date: "2026-08-05" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 4_000n, date: "2026-08-10" }),
      ],
    });
    const overview = getAnalyticsOverview(dataset, makeFilters());
    expect(overview.income.currentMinor).toBe(10_000n);
    expect(overview.income.previousMinor).toBe(8_000n);
    expect(overview.income.changePercent).toBe(25);
    expect(overview.expenses.changePercent).toBe(0);
    expect(overview.cashflow.currentMinor).toBe(6_000n);
  });

  it("nunca mistura moedas diferentes na mesma análise", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "INCOME", amountMinor: 10_000n, currency: "CVE", date: "2026-09-05" }),
        makeTransaction({ type: "INCOME", amountMinor: 99_999n, currency: "EUR", date: "2026-09-05" }),
      ],
    });
    const overview = getAnalyticsOverview(dataset, makeFilters({ currency: "CVE" }));
    expect(overview.income.currentMinor).toBe(10_000n); // nunca 109 999
  });

  it("saldo/património são calculados no FIM do período selecionado — nunca com dados do futuro em relação a esse período", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1", initialBalanceMinor: 0n })],
      transactions: [
        makeTransaction({ type: "INCOME", accountId: "acc-1", amountMinor: 5_000n, date: "2026-09-15" }),
        // Transação depois do fim do período selecionado — nunca deve entrar no saldo "de Setembro".
        makeTransaction({ type: "INCOME", accountId: "acc-1", amountMinor: 999_999n, date: "2026-10-05" }),
      ],
    });
    const overview = getAnalyticsOverview(dataset, makeFilters());
    expect(overview.availableBalance).toContain("5000"); // "pt-CV".toLocaleString não agrupa < 5 dígitos de forma consistente neste runtime — o valor numérico é o que importa
  });

  it("progresso médio de metas usa o saldo da conta ligada, nunca um número inventado", () => {
    const dataset = makeDataset({
      accounts: [makeAccount({ id: "acc-1" }), makeAccount({ id: "acc-goal", initialBalanceMinor: 0n })],
      goals: [{ id: "goal-1", userId: "user-1", name: "Laptop", description: null, currency: "CVE", targetAmountMinor: 10_000n, targetDate: null, linkedAccountId: "acc-goal", status: "ACTIVE" }],
      transactions: [makeTransaction({ type: "INCOME", accountId: "acc-goal", amountMinor: 5_000n, date: "2026-09-05" })],
    });
    const overview = getAnalyticsOverview(dataset, makeFilters());
    expect(overview.goals).toEqual({ activeCount: 1, averageProgressPercent: 50 });
  });

  it("período de comparação aparece formatado no resultado, e desaparece quando comparisonMode é 'none'", () => {
    const dataset = makeDataset();
    const withComparison = getAnalyticsOverview(dataset, makeFilters());
    expect(withComparison.comparisonPeriod).toEqual({ label: COMPARISON_PERIOD.label, start: COMPARISON_PERIOD.start, end: COMPARISON_PERIOD.end });
    const withoutComparison = getAnalyticsOverview(dataset, makeFilters({ comparisonMode: "none", comparisonPeriod: null }));
    expect(withoutComparison.comparisonPeriod).toBeNull();
  });
});

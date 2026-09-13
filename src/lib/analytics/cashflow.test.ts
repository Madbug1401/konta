import { describe, expect, it } from "vitest";
import { findBucketPeriod, getCashflowAnalysis } from "./cashflow";
import { makeDataset, makeFilters, makeTransaction } from "./test-fixtures";

describe("getCashflowAnalysis", () => {
  it("agrega receitas/despesas/cashflow por bucket (granularidade automática = 'day' para um mês)", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "INCOME", amountMinor: 1000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 400n, date: "2026-09-05" }),
      ],
    });
    const analysis = getCashflowAnalysis(dataset, makeFilters());
    expect(analysis.granularity).toBe("day");
    const bucket = analysis.buckets.find((b) => b.start === "2026-09-05");
    expect(bucket?.incomeMinor).toBe(1000n);
    expect(bucket?.expenseMinor).toBe(400n);
    expect(bucket?.cashflowMinor).toBe(600n);
  });

  it("um bucket sem transações mostra zero — nunca omitido nem inventado", () => {
    const dataset = makeDataset();
    const analysis = getCashflowAnalysis(dataset, makeFilters());
    expect(analysis.buckets.every((b) => b.incomeMinor === 0n && b.expenseMinor === 0n)).toBe(true);
    expect(analysis.buckets).toHaveLength(30); // Setembro tem 30 dias
  });

  it("totais do período comparam com o período de comparação, reutilizando a mesma regra de compareAmounts", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "INCOME", amountMinor: 2000n, date: "2026-09-05" }),
        makeTransaction({ type: "INCOME", amountMinor: 1000n, date: "2026-08-05" }),
      ],
    });
    const analysis = getCashflowAnalysis(dataset, makeFilters());
    expect(analysis.totals.incomeChangePercent).toBe(100);
  });

  it("permite forçar a granularidade (ex: 'month' mesmo num período curto)", () => {
    const dataset = makeDataset();
    const analysis = getCashflowAnalysis(dataset, makeFilters(), "month");
    expect(analysis.granularity).toBe("month");
    expect(analysis.buckets).toHaveLength(1);
  });
});

describe("findBucketPeriod — drill-down 'clicar num período'", () => {
  it("devolve o PeriodRange exato de um bucket pela sua key", () => {
    const dataset = makeDataset();
    const filters = makeFilters();
    const analysis = getCashflowAnalysis(dataset, filters, "month");
    const bucketPeriod = findBucketPeriod(dataset, filters, analysis.buckets[0].key, "month");
    expect(bucketPeriod).toEqual({ start: "2026-09-01", end: "2026-09-30", label: analysis.buckets[0].label });
  });

  it("uma key inexistente devolve null — nunca inventa um período", () => {
    const dataset = makeDataset();
    const filters = makeFilters();
    expect(findBucketPeriod(dataset, filters, "chave-inexistente")).toBeNull();
  });
});

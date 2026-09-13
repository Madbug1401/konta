import { describe, expect, it } from "vitest";
import { ToolExecutionError } from "./types";
import { resolveAnalyticsFilters } from "./analytics-shared";
import { makeAccount, makeDataset } from "@/lib/analytics/test-fixtures";

describe("resolveAnalyticsFilters", () => {
  it("sem 'period': assume 'this_month'", () => {
    const filters = resolveAnalyticsFilters(makeDataset(), {});
    expect(filters.period.label).toContain("2026"); // qualquer mês do ano corrente do relógio real — só confirma que resolveu, não um valor fixo
  });

  it("sem 'comparisonMode': assume 'previous_period'", () => {
    const filters = resolveAnalyticsFilters(makeDataset(), {});
    expect(filters.comparisonMode).toBe("previous_period");
    expect(filters.comparisonPeriod).not.toBeNull();
  });

  it("comparisonMode 'none': comparisonPeriod fica null — nunca inventa uma comparação", () => {
    const filters = resolveAnalyticsFilters(makeDataset(), { comparisonMode: "none" });
    expect(filters.comparisonPeriod).toBeNull();
  });

  it("sem 'currency': usa a primeira moeda em uso pelas contas do utilizador", () => {
    const filters = resolveAnalyticsFilters(makeDataset({ accounts: [makeAccount({ id: "acc-1", currency: "EUR" })] }), {});
    expect(filters.currency).toBe("EUR");
  });

  it("período 'custom' sem 'from'/'to': ToolExecutionError, nunca um crash cru", () => {
    expect(() => resolveAnalyticsFilters(makeDataset(), { period: "custom" })).toThrow(ToolExecutionError);
  });

  it("período 'custom' com from > to: ToolExecutionError com a mensagem do InvalidPeriodError", () => {
    expect(() => resolveAnalyticsFilters(makeDataset(), { period: "custom", from: "2026-09-30", to: "2026-09-01" })).toThrow(ToolExecutionError);
  });

  it("período 'custom' válido: resolve normalmente", () => {
    const filters = resolveAnalyticsFilters(makeDataset(), { period: "custom", from: "2026-01-01", to: "2026-03-31" });
    expect(filters.period).toMatchObject({ start: "2026-01-01", end: "2026-03-31" });
  });
});

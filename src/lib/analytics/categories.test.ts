import { describe, expect, it } from "vitest";
import { getCategoryAnalysis, getCategoryDrilldown, getTopTransactions, resolveCategoryName } from "./categories";
import { makeCategory, makeDataset, makeFilters, makeTransaction } from "./test-fixtures";

describe("getCategoryAnalysis", () => {
  it("agrega por categoria, calcula % das despesas do período e variação vs período anterior", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-food", name: "Alimentação" }), makeCategory({ id: "cat-transport", name: "Transporte" })],
      transactions: [
        makeTransaction({ type: "EXPENSE", categoryId: "cat-food", amountMinor: 3000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-transport", amountMinor: 1000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-food", amountMinor: 2000n, date: "2026-08-05" }),
      ],
    });
    const rows = getCategoryAnalysis(dataset, makeFilters());
    const food = rows.find((r) => r.categoryId === "cat-food")!;
    expect(food.currentMinor).toBe(3000n);
    expect(food.previousMinor).toBe(2000n);
    expect(food.changePercent).toBe(50);
    expect(food.shareOfTotalPercent).toBe(75); // 3000 de 4000 totais
  });

  it("transação sem categoria aparece como 'Sem categoria' — nunca omitida em silêncio", () => {
    const dataset = makeDataset({ transactions: [makeTransaction({ type: "EXPENSE", categoryId: null, amountMinor: 500n, date: "2026-09-05" })] });
    const rows = getCategoryAnalysis(dataset, makeFilters());
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryName).toBe("Sem categoria");
  });

  it("categoria nova este período (sem histórico no anterior): variação vem null quando não há comparação, ou 'up' sem % quando o anterior é zero explícito", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-new", name: "Nova" })],
      transactions: [makeTransaction({ type: "EXPENSE", categoryId: "cat-new", amountMinor: 1000n, date: "2026-09-05" })],
    });
    const rows = getCategoryAnalysis(dataset, makeFilters());
    expect(rows[0].changePercent).toBeNull(); // período anterior = 0 -> nunca uma % enganosa
    expect(rows[0].direction).toBe("up");
  });

  it("suporta análise de receitas (type='INCOME'), nunca mistura com despesas", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-salary", name: "Salário", kind: "INCOME" })],
      transactions: [
        makeTransaction({ type: "INCOME", categoryId: "cat-salary", amountMinor: 50_000n, date: "2026-09-05" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-salary", amountMinor: 999n, date: "2026-09-05" }),
      ],
    });
    const rows = getCategoryAnalysis(dataset, makeFilters(), "INCOME");
    expect(rows).toHaveLength(1);
    expect(rows[0].currentMinor).toBe(50_000n);
  });
});

describe("getTopTransactions", () => {
  it("ordena por valor decrescente e respeita o limite", () => {
    const dataset = makeDataset({
      transactions: [
        makeTransaction({ type: "EXPENSE", amountMinor: 500n, date: "2026-09-01", description: "A" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 5000n, date: "2026-09-02", description: "B" }),
        makeTransaction({ type: "EXPENSE", amountMinor: 2000n, date: "2026-09-03", description: "C" }),
      ],
    });
    const top = getTopTransactions(dataset, makeFilters(), { limit: 2 });
    expect(top.map((t) => t.description)).toEqual(["B", "C"]);
  });

  it("nunca aceita um limite acima de 50 (defesa contra 'trazer tudo')", () => {
    const dataset = makeDataset({ transactions: Array.from({ length: 60 }, (_, i) => makeTransaction({ type: "EXPENSE", amountMinor: BigInt(i + 1), date: "2026-09-01" })) });
    const top = getTopTransactions(dataset, makeFilters(), { limit: 500 });
    expect(top.length).toBeLessThanOrEqual(50);
  });
});

describe("getCategoryDrilldown", () => {
  it("detalha uma categoria: total, % das despesas, variação, média e maiores transações", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-food", name: "Alimentação" })],
      transactions: [
        makeTransaction({ type: "EXPENSE", categoryId: "cat-food", amountMinor: 1000n, date: "2026-09-01", description: "Supermercado" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-food", amountMinor: 3000n, date: "2026-09-02", description: "Restaurante" }),
        makeTransaction({ type: "EXPENSE", categoryId: "cat-food", amountMinor: 2000n, date: "2026-08-01" }),
      ],
    });
    const drilldown = getCategoryDrilldown(dataset, makeFilters(), "cat-food");
    expect(drilldown.totalMinor).toBe(4000n);
    expect(drilldown.transactionCount).toBe(2);
    expect(drilldown.changePercent).toBe(100); // 4000 vs 2000
    expect(drilldown.topTransactions[0].description).toBe("Restaurante");
  });

  it("categoria sem nenhuma transação no período: total zero, nunca uma exceção", () => {
    const dataset = makeDataset({ categories: [makeCategory({ id: "cat-empty", name: "Vazia" })] });
    const drilldown = getCategoryDrilldown(dataset, makeFilters(), "cat-empty");
    expect(drilldown.totalMinor).toBe(0n);
    expect(drilldown.transactionCount).toBe(0);
  });
});

describe("resolveCategoryName", () => {
  it("correspondência exata única: resolve", () => {
    const dataset = makeDataset({ categories: [makeCategory({ id: "cat-1", name: "Alimentação" })] });
    expect(resolveCategoryName(dataset, "alimentação")).toEqual({ status: "resolved", categoryId: "cat-1", categoryName: "Alimentação" });
  });

  it("sem correspondência nenhuma: not_found — nunca inventa um id", () => {
    const dataset = makeDataset({ categories: [makeCategory({ id: "cat-1", name: "Alimentação" })] });
    expect(resolveCategoryName(dataset, "Investimentos Imobiliários")).toEqual({ status: "not_found" });
  });

  it("mais do que uma correspondência parcial, nenhuma exata: ambiguous — nunca escolhe sozinho (secção 15 do pedido)", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-1", name: "Carro - seguro" }), makeCategory({ id: "cat-2", name: "Carro - manutenção" })],
    });
    const result = resolveCategoryName(dataset, "Carro");
    expect(result.status).toBe("ambiguous");
  });

  it("correspondência exata tem prioridade sobre correspondências parciais mais amplas", () => {
    const dataset = makeDataset({
      categories: [makeCategory({ id: "cat-1", name: "Carro" }), makeCategory({ id: "cat-2", name: "Carro - seguro" })],
    });
    const result = resolveCategoryName(dataset, "Carro");
    expect(result).toEqual({ status: "resolved", categoryId: "cat-1", categoryName: "Carro" });
  });
});

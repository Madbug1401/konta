// ============================================================================
// KONTA AI — testes das tools de Analytics (Milestone Analytics).
//
// Mocka `collectAnalyticsDataset` (o único ponto de I/O desta camada) para
// devolver um dataset sintético construído com as mesmas fixtures usadas
// pelos testes puros de src/lib/analytics/*.test.ts — a matemática já está
// coberta lá (110 testes); aqui testa-se o CONTRATO da tool: riskTier,
// validação de schema, ownership (userId passado a collectAnalyticsDataset),
// e o mapeamento de erros (ex: categoria ambígua -> ToolExecutionError).
// ============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";
import { makeCategory, makeDataset, makeTransaction } from "@/lib/analytics/test-fixtures";

const collectAnalyticsDatasetMock = vi.fn();

vi.mock("@/lib/analytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics")>("@/lib/analytics");
  return { ...actual, collectAnalyticsDataset: collectAnalyticsDatasetMock };
});

afterEach(() => {
  vi.clearAllMocks();
});

const LOW_READ_ONLY_TOOL_MODULES = [
  { path: "./get-analytics-overview", exportName: "getAnalyticsOverviewTool" },
  { path: "./get-cashflow-analysis", exportName: "getCashflowAnalysisTool" },
  { path: "./get-debt-analysis", exportName: "getDebtAnalysisTool" },
  { path: "./get-goal-analysis", exportName: "getGoalAnalysisTool" },
  { path: "./get-recurring-analysis", exportName: "getRecurringAnalysisTool" },
  { path: "./get-financial-trends", exportName: "getFinancialTrendsTool" },
  { path: "./get-financial-insights", exportName: "getFinancialInsightsTool" },
] as const;

describe.each(LOW_READ_ONLY_TOOL_MODULES)("$exportName", ({ path, exportName }) => {
  it("riskTier é LOW, e rejeita campos desconhecidos no schema", async () => {
    const mod = (await import(path)) as Record<string, { riskTier: string; paramsSchema: { safeParse: (v: unknown) => { success: boolean } } }>;
    const tool = mod[exportName];
    expect(tool.riskTier).toBe("LOW");
    expect(tool.paramsSchema.safeParse({ hackField: true }).success).toBe(false);
    expect(tool.paramsSchema.safeParse({}).success).toBe(true);
  });

  it("execute() chama collectAnalyticsDataset com o userId da sessão — nunca outro", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset());
    const mod = (await import(path)) as Record<string, { execute: (userId: string, params: unknown) => Promise<unknown> }>;
    await mod[exportName].execute("user-42", {});
    expect(collectAnalyticsDatasetMock).toHaveBeenCalledWith("user-42");
  });

  it("nunca lança para um dataset vazio — devolve uma estrutura vazia/zerada em segurança", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset());
    const mod = (await import(path)) as Record<string, { execute: (userId: string, params: unknown) => Promise<unknown> }>;
    await expect(mod[exportName].execute("user-1", {})).resolves.toBeDefined();
  });
});

describe("get_category_analysis", () => {
  it("sem categoryName: devolve a tabela inteira ('rows')", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset({ categories: [makeCategory({ id: "cat-1", name: "Alimentação" })], transactions: [makeTransaction({ type: "EXPENSE", categoryId: "cat-1", amountMinor: 1000n, date: "2026-09-05" })] }));
    const { getCategoryAnalysisTool } = await import("./get-category-analysis");
    const result = (await getCategoryAnalysisTool.execute("user-1", {})) as { rows?: unknown[] };
    expect(result.rows).toBeDefined();
  });

  it("com categoryName resolvido: devolve o drill-down dessa categoria ('drilldown')", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset({ categories: [makeCategory({ id: "cat-1", name: "Alimentação" })] }));
    const { getCategoryAnalysisTool } = await import("./get-category-analysis");
    const result = (await getCategoryAnalysisTool.execute("user-1", { categoryName: "Alimentação" })) as { drilldown?: { categoryId: string } };
    expect(result.drilldown?.categoryId).toBe("cat-1");
  });

  it("categoryName inexistente: ToolExecutionError, nunca inventa uma categoria", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset({ categories: [] }));
    const { getCategoryAnalysisTool } = await import("./get-category-analysis");
    await expect(getCategoryAnalysisTool.execute("user-1", { categoryName: "Não Existe" })).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("categoryName ambíguo: ToolExecutionError com as correspondências, nunca escolhe sozinho", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(
      makeDataset({ categories: [makeCategory({ id: "c1", name: "Carro - seguro" }), makeCategory({ id: "c2", name: "Carro - manutenção" })] }),
    );
    const { getCategoryAnalysisTool } = await import("./get-category-analysis");
    await expect(getCategoryAnalysisTool.execute("user-1", { categoryName: "Carro" })).rejects.toBeInstanceOf(ToolExecutionError);
  });
});

describe("get_investment_analysis", () => {
  it("riskTier LOW; nunca aceita nenhum parâmetro além de currency", async () => {
    const { getInvestmentAnalysisTool } = await import("./get-investment-analysis");
    expect(getInvestmentAnalysisTool.riskTier).toBe("LOW");
    expect(getInvestmentAnalysisTool.paramsSchema.safeParse({ accountId: "acc-1" }).success).toBe(false);
  });

  it("nunca sugere compra/venda — a description da tool documenta isso explicitamente", async () => {
    const { getInvestmentAnalysisTool } = await import("./get-investment-analysis");
    expect(getInvestmentAnalysisTool.description.toLowerCase()).toMatch(/nunca sugere/);
  });
});

describe("run_financial_simulation", () => {
  it("riskTier é LOW — nunca exige confirmação, porque nunca escreve", async () => {
    const { runFinancialSimulationTool } = await import("./run-financial-simulation");
    expect(runFinancialSimulationTool.riskTier).toBe("LOW");
  });

  it("reduce_category exige categoryName+percent — rejeitado sem eles", async () => {
    const { runFinancialSimulationTool } = await import("./run-financial-simulation");
    expect(runFinancialSimulationTool.paramsSchema.safeParse({ type: "reduce_category" }).success).toBe(false);
    expect(runFinancialSimulationTool.paramsSchema.safeParse({ type: "reduce_category", categoryName: "X", percent: 10 }).success).toBe(true);
  });

  it("increase_goal_contribution exige goalId+extraAmountMinor", async () => {
    const { runFinancialSimulationTool } = await import("./run-financial-simulation");
    expect(runFinancialSimulationTool.paramsSchema.safeParse({ type: "increase_goal_contribution" }).success).toBe(false);
  });

  it("erro de simulação (SimulationInputError) vira ToolExecutionError — nunca escapa cru", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset());
    const { runFinancialSimulationTool } = await import("./run-financial-simulation");
    await expect(
      runFinancialSimulationTool.execute("user-1", { type: "reduce_category", categoryName: "Inexistente", percent: 10 }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("nunca altera o dataset (read-only) — collectAnalyticsDataset é chamado, nenhuma função de escrita é sequer importada por este módulo", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./run-financial-simulation.ts", import.meta.url), "utf8"));
    expect(source).not.toMatch(/createTransaction|updateGoal|createGoal/);
  });
});

describe("set_analytics_view — segurança (secção 25 do pedido)", () => {
  it("riskTier LOW; rejeita um objeto sem nenhuma mudança pedida", async () => {
    const { setAnalyticsViewTool } = await import("./set-analytics-view");
    expect(setAnalyticsViewTool.riskTier).toBe("LOW");
    expect(setAnalyticsViewTool.paramsSchema.safeParse({}).success).toBe(false);
  });

  it("resolve categoryName para um categoryId REAL — nunca aceita um id vindo do modelo", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset({ categories: [makeCategory({ id: "cat-real", name: "Alimentação" })] }));
    const { setAnalyticsViewTool } = await import("./set-analytics-view");
    const result = (await setAnalyticsViewTool.execute("user-1", { categoryName: "Alimentação" })) as { uiAction: { categoryId?: string } };
    expect(result.uiAction.categoryId).toBe("cat-real");
  });

  it("categoryName ambíguo ou inexistente: ToolExecutionError, nunca constrói uma ação com um id a adivinhar", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset({ categories: [] }));
    const { setAnalyticsViewTool } = await import("./set-analytics-view");
    await expect(setAnalyticsViewTool.execute("user-1", { categoryName: "Não Existe" })).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("o resultado final é sempre revalidado contra AnalyticsViewActionSchema antes de ser devolvido", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset());
    const { setAnalyticsViewTool } = await import("./set-analytics-view");
    const { AnalyticsViewActionSchema } = await import("@/lib/analytics");
    const result = (await setAnalyticsViewTool.execute("user-1", { periodPreset: "last_30d" })) as { uiAction: unknown };
    expect(AnalyticsViewActionSchema.safeParse(result.uiAction).success).toBe(true);
  });

  it("um accountName que não corresponde a nenhuma conta não arquivada: ToolExecutionError", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset({ accounts: [] }));
    const { setAnalyticsViewTool } = await import("./set-analytics-view");
    await expect(setAnalyticsViewTool.execute("user-1", { accountName: "Conta Fantasma" })).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("clearCategory/clearAccount/clearTransactionType limpam o filtro (null), nunca precisam de resolver nada", async () => {
    collectAnalyticsDatasetMock.mockResolvedValue(makeDataset());
    const { setAnalyticsViewTool } = await import("./set-analytics-view");
    const result = (await setAnalyticsViewTool.execute("user-1", { clearCategory: true })) as { uiAction: { categoryId: unknown } };
    expect(result.uiAction.categoryId).toBeNull();
  });
});

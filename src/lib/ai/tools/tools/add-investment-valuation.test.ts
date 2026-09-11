import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const addValuationMock = vi.fn();
vi.mock("@/lib/db/investments", () => ({ addValuation: addValuationMock }));

describe("add_investment_valuation tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; valueMinor nunca pode ser negativo", async () => {
    const { addInvestmentValuationTool } = await import("./add-investment-valuation");
    expect(addInvestmentValuationTool.riskTier).toBe("HIGH");
    expect(addInvestmentValuationTool.paramsSchema.safeParse({ accountId: "acc-1", date: "2026-01-01", valueMinor: -1 }).success).toBe(false);
    expect(addInvestmentValuationTool.paramsSchema.safeParse({ accountId: "acc-1", date: "2026-01-01", valueMinor: 0 }).success).toBe(true);
  });

  it("uma conta sem detalhe de investimento (ou de outro utilizador) é rejeitada", async () => {
    addValuationMock.mockResolvedValue(null);
    const { addInvestmentValuationTool } = await import("./add-investment-valuation");

    await expect(
      addInvestmentValuationTool.execute("user-1", { accountId: "acc-de-outro", date: "2026-01-01", valueMinor: 1000 }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("adiciona via addValuation() existente — nunca edita uma avaliação antiga", async () => {
    addValuationMock.mockResolvedValue({ id: "val-1", investmentDetailId: "inv-1", date: "2026-01-01", valueMinor: 1000n });
    const { addInvestmentValuationTool } = await import("./add-investment-valuation");

    const result = await addInvestmentValuationTool.execute("user-1", { accountId: "acc-1", date: "2026-01-01", valueMinor: 1000 });

    expect(addValuationMock).toHaveBeenCalledWith("user-1", "acc-1", { date: "2026-01-01", valueMinor: 1000n });
    expect(result).toEqual({ date: "2026-01-01" });
  });
});

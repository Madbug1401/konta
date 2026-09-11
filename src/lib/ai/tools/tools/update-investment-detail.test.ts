import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const updateInvestmentDetailMock = vi.fn();
vi.mock("@/lib/db/investments", () => ({ updateInvestmentDetail: updateInvestmentDetailMock }));

describe("update_investment_detail tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { updateInvestmentDetailTool } = await import("./update-investment-detail");
    expect(updateInvestmentDetailTool.riskTier).toBe("HIGH");
  });

  it("um detalhe inexistente (ou conta de outro utilizador) é rejeitado", async () => {
    updateInvestmentDetailMock.mockResolvedValue(null);
    const { updateInvestmentDetailTool } = await import("./update-investment-detail");

    await expect(updateInvestmentDetailTool.execute("user-1", { accountId: "acc-de-outro" })).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("atualiza via updateInvestmentDetail() existente", async () => {
    updateInvestmentDetailMock.mockResolvedValue({ id: "inv-1", accountId: "acc-1", investmentType: "Obrigações", expectedReturnRate: null, maturityDate: null });
    const { updateInvestmentDetailTool } = await import("./update-investment-detail");

    const result = await updateInvestmentDetailTool.execute("user-1", { accountId: "acc-1", investmentType: "Obrigações" });

    expect(updateInvestmentDetailMock).toHaveBeenCalledWith("user-1", "acc-1", { investmentType: "Obrigações", expectedReturnRate: undefined, maturityDate: undefined });
    expect(result).toEqual({ investmentType: "Obrigações" });
  });
});

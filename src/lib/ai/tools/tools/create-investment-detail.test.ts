import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const createInvestmentDetailMock = vi.fn();
vi.mock("@/lib/db/investments", () => ({ createInvestmentDetail: createInvestmentDetailMock }));

describe("create_investment_detail tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { createInvestmentDetailTool } = await import("./create-investment-detail");
    expect(createInvestmentDetailTool.riskTier).toBe("HIGH");
  });

  it("uma conta que não é INVESTMENT (ou de outro utilizador) é rejeitada — createInvestmentDetail já verifica isto internamente", async () => {
    createInvestmentDetailMock.mockResolvedValue(null);
    const { createInvestmentDetailTool } = await import("./create-investment-detail");

    await expect(
      createInvestmentDetailTool.execute("user-1", { accountId: "acc-wallet", investmentType: "Ações" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("cria via createInvestmentDetail() existente", async () => {
    createInvestmentDetailMock.mockResolvedValue({ id: "inv-1", accountId: "acc-1", investmentType: "Ações", expectedReturnRate: null, maturityDate: null });
    const { createInvestmentDetailTool } = await import("./create-investment-detail");

    const result = await createInvestmentDetailTool.execute("user-1", { accountId: "acc-1", investmentType: "Ações" });

    expect(createInvestmentDetailMock).toHaveBeenCalledWith("user-1", "acc-1", { investmentType: "Ações", expectedReturnRate: undefined, maturityDate: undefined });
    expect(result).toEqual({ investmentType: "Ações" });
  });
});

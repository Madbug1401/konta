import { afterEach, describe, expect, it, vi } from "vitest";

const listAccountsMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();
const getInvestmentDetailByAccountIdMock = vi.fn();
const listValuationsMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ listAccounts: listAccountsMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));
vi.mock("@/lib/db/investments", () => ({
  getInvestmentDetailByAccountId: getInvestmentDetailByAccountIdMock,
  listValuations: listValuationsMock,
}));

const WALLET = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };
const INVESTMENT_ACCOUNT = { id: "acc-2", userId: "user-1", name: "Bolsa", type: "INVESTMENT" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("get_investments tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é LOW", async () => {
    const { getInvestmentsTool } = await import("./get-investments");
    expect(getInvestmentsTool.riskTier).toBe("LOW");
  });

  it("só considera contas do tipo INVESTMENT, nunca outras", async () => {
    listAccountsMock.mockResolvedValue([WALLET, INVESTMENT_ACCOUNT]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    getInvestmentDetailByAccountIdMock.mockResolvedValue(null);
    listValuationsMock.mockResolvedValue([]);
    const { getInvestmentsTool } = await import("./get-investments");

    const result = await getInvestmentsTool.execute("user-1", {});

    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe("acc-2");
  });

  it("sem avaliação registada, hasValuation é false e currentValue/returnPercent nunca são inventados", async () => {
    listAccountsMock.mockResolvedValue([INVESTMENT_ACCOUNT]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    getInvestmentDetailByAccountIdMock.mockResolvedValue({ id: "inv-1", accountId: "acc-2", investmentType: "Ações", expectedReturnRate: null, maturityDate: null });
    listValuationsMock.mockResolvedValue([]);
    const { getInvestmentsTool } = await import("./get-investments");

    const [investment] = await getInvestmentsTool.execute("user-1", {});

    expect(investment.hasValuation).toBe(false);
    expect(investment.currentValue).toBeNull();
    expect(investment.returnPercent).toBeNull();
  });
});

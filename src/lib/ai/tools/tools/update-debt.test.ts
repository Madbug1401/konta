import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getDebtByIdMock = vi.fn();
const updateDebtMock = vi.fn();
const listDebtsMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();

vi.mock("@/lib/db/debts", () => ({ getDebtById: getDebtByIdMock, updateDebt: updateDebtMock, listDebts: listDebtsMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));

const DEBT = { id: "debt-1", userId: "user-1", creditorName: "João", description: null, originalAmountMinor: 5000n, currency: "CVE", interestRate: null, status: "ACTIVE" as const, startDate: "2026-01-01", finalDueDate: null };

describe("update_debt tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; nunca aceita originalAmountMinor/startDate/installmentCount/frequency", async () => {
    const { updateDebtTool } = await import("./update-debt");
    expect(updateDebtTool.riskTier).toBe("HIGH");
    expect(updateDebtTool.paramsSchema.safeParse({ debtId: "debt-1", originalAmountMinor: 9999 }).success).toBe(false);
    expect(updateDebtTool.paramsSchema.safeParse({ debtId: "debt-1", installmentCount: 3 }).success).toBe(false);
    expect(updateDebtTool.paramsSchema.safeParse({ debtId: "debt-1", creditorName: "Maria" }).success).toBe(true);
  });

  it("uma dívida de outro utilizador nunca é editada", async () => {
    getDebtByIdMock.mockResolvedValue(null);
    const { updateDebtTool } = await import("./update-debt");

    await expect(updateDebtTool.execute("user-1", { debtId: "debt-de-outro" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateDebtMock).not.toHaveBeenCalled();
  });

  it("atualiza via updateDebt() existente", async () => {
    getDebtByIdMock.mockResolvedValue(DEBT);
    updateDebtMock.mockResolvedValue({ ...DEBT, creditorName: "Maria" });
    listDebtsMock.mockResolvedValue([{ ...DEBT, creditorName: "Maria", installments: [] }]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    const { updateDebtTool } = await import("./update-debt");

    const result = await updateDebtTool.execute("user-1", { debtId: "debt-1", creditorName: "Maria" });

    expect(updateDebtMock).toHaveBeenCalledWith("user-1", "debt-1", { creditorName: "Maria", description: undefined, interestRate: undefined });
    expect(result.creditorName).toBe("Maria");
  });
});

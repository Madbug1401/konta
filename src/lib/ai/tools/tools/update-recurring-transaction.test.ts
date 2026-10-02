import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getRecurringTransactionByIdMock = vi.fn();
const updateRecurringTransactionMock = vi.fn();
const getAccountByIdMock = vi.fn();
const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();

vi.mock("@/lib/db/recurring-transactions", () => ({
  getRecurringTransactionById: getRecurringTransactionByIdMock,
  updateRecurringTransaction: updateRecurringTransactionMock,
}));
vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock, createCategory: createCategoryMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

const SERIES = {
  id: "series-1",
  userId: "user-1",
  type: "EXPENSE" as const,
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 1500n,
  currency: "CVE",
  categoryId: null,
  description: "Spotify",
  frequency: "MONTHLY" as const,
  interval: 1,
  startDate: "2026-06-30",
  endDate: null,
  occurrencesTotal: null,
  occurrencesGenerated: 0,
  nextRunDate: "2026-06-30",
  isActive: true,
};

describe("update_recurring_transaction tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { updateRecurringTransactionTool } = await import("./update-recurring-transaction");
    expect(updateRecurringTransactionTool.riskTier).toBe("HIGH");
  });

  it("atualiza description/amountMinor via updateRecurringTransaction", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES);
    updateRecurringTransactionMock.mockResolvedValue({ ...SERIES, description: "Spotify Família" });
    const { updateRecurringTransactionTool } = await import("./update-recurring-transaction");

    const result = await updateRecurringTransactionTool.execute("user-1", {
      recurringTransactionId: "series-1",
      description: "Spotify Família",
      amountMinor: 2000,
    });

    expect(updateRecurringTransactionMock).toHaveBeenCalledWith(
      "user-1",
      "series-1",
      expect.objectContaining({ description: "Spotify Família", amountMinor: 2000n }),
    );
    expect(result).toEqual({ id: "series-1" });
  });

  it("lança ToolExecutionError quando a série não existe/não pertence ao utilizador", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue(null);
    const { updateRecurringTransactionTool } = await import("./update-recurring-transaction");

    await expect(
      updateRecurringTransactionTool.execute("user-1", { recurringTransactionId: "outra-pessoa", description: "X" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("rejeita destinationAccountId numa série que não é TRANSFER", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES); // type: EXPENSE
    const { updateRecurringTransactionTool } = await import("./update-recurring-transaction");

    await expect(
      updateRecurringTransactionTool.execute("user-1", { recurringTransactionId: "series-1", destinationAccountId: "acc-2" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("[Task 2] rejeita mudar para uma conta de destino com moeda diferente da origem", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue({ ...SERIES, type: "TRANSFER", accountId: "acc-1", destinationAccountId: "acc-2" });
    getAccountByIdMock.mockImplementation(async (_u: string, id: string) =>
      id === "acc-1" ? { ...ACCOUNT, id: "acc-1", currency: "CVE" } : { ...ACCOUNT, id: "acc-3", currency: "EUR" },
    );
    const { updateRecurringTransactionTool } = await import("./update-recurring-transaction");

    await expect(
      updateRecurringTransactionTool.execute("user-1", { recurringTransactionId: "series-1", destinationAccountId: "acc-3" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("resolve category por NOME (nunca id), reutilizando resolveCategoryByName", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES);
    listCategoriesMock.mockResolvedValue([]);
    createCategoryMock.mockResolvedValue({ id: "cat-1", name: "Música", kind: "EXPENSE", isSystem: false });
    updateRecurringTransactionMock.mockResolvedValue(SERIES);
    const { updateRecurringTransactionTool } = await import("./update-recurring-transaction");

    await updateRecurringTransactionTool.execute("user-1", { recurringTransactionId: "series-1", category: "Música" });

    expect(updateRecurringTransactionMock).toHaveBeenCalledWith("user-1", "series-1", expect.objectContaining({ categoryId: "cat-1" }));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const createRecurringTransactionMock = vi.fn();
const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/recurring-transactions", () => ({ createRecurringTransaction: createRecurringTransactionMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock, createCategory: createCategoryMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

function validParams(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "EXPENSE" as const,
    accountId: "acc-1",
    amountMinor: 1000,
    description: "Renda",
    frequency: "MONTHLY" as const,
    startDate: "2026-01-01",
    ...overrides,
  };
}

describe("create_recurring_transaction tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; TRANSFER exige destinationAccountId diferente da origem", async () => {
    const { createRecurringTransactionTool } = await import("./create-recurring-transaction");
    expect(createRecurringTransactionTool.riskTier).toBe("HIGH");
    expect(createRecurringTransactionTool.paramsSchema.safeParse(validParams({ type: "TRANSFER" })).success).toBe(false);
    expect(
      createRecurringTransactionTool.paramsSchema.safeParse(validParams({ type: "TRANSFER", destinationAccountId: "acc-1" })).success,
    ).toBe(false); // igual à origem
    expect(
      createRecurringTransactionTool.paramsSchema.safeParse(validParams({ type: "TRANSFER", destinationAccountId: "acc-2" })).success,
    ).toBe(true);
  });

  it("nunca cria contra uma conta arquivada ou de outro utilizador", async () => {
    getAccountByIdMock.mockResolvedValue(null);
    const { createRecurringTransactionTool } = await import("./create-recurring-transaction");

    await expect(createRecurringTransactionTool.execute("user-1", validParams())).rejects.toBeInstanceOf(ToolExecutionError);
    expect(createRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("resolve a categoria por NOME (nunca id), reutilizando resolveCategoryByName", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    listCategoriesMock.mockResolvedValue([]);
    createCategoryMock.mockResolvedValue({ id: "cat-1", name: "Casa", kind: "EXPENSE", isSystem: false });
    createRecurringTransactionMock.mockResolvedValue({ id: "rec-1" });
    const { createRecurringTransactionTool } = await import("./create-recurring-transaction");

    await createRecurringTransactionTool.execute("user-1", validParams({ category: "Casa" }));

    expect(createCategoryMock).toHaveBeenCalledWith({ userId: "user-1", name: "Casa", kind: "EXPENSE" });
    expect(createRecurringTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-1" }));
  });

  it("cria via createRecurringTransaction() existente — nunca materializa nada aqui", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    createRecurringTransactionMock.mockResolvedValue({ id: "rec-1" });
    const { createRecurringTransactionTool } = await import("./create-recurring-transaction");

    const result = await createRecurringTransactionTool.execute("user-1", validParams());

    expect(createRecurringTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", amountMinor: 1000n, frequency: "MONTHLY" }));
    expect(result).toEqual({ id: "rec-1" });
  });
});

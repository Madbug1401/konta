import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const updateAccountMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();
const findUserByIdMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock, updateAccount: updateAccountMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("update_account tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { updateAccountTool } = await import("./update-account");
    expect(updateAccountTool.riskTier).toBe("HIGH");
  });

  it("nunca aceita alterar currency nem initialBalanceMinor", async () => {
    const { updateAccountTool } = await import("./update-account");
    expect(updateAccountTool.paramsSchema.safeParse({ accountId: "acc-1", currency: "EUR" }).success).toBe(false);
    expect(updateAccountTool.paramsSchema.safeParse({ accountId: "acc-1", initialBalanceMinor: 100 }).success).toBe(false);
    expect(updateAccountTool.paramsSchema.safeParse({ accountId: "acc-1", name: "Nova" }).success).toBe(true);
  });

  it("uma conta de outro utilizador (ou inexistente) nunca é editada — rejeita antes de chamar updateAccount", async () => {
    getAccountByIdMock.mockResolvedValue(null);
    const { updateAccountTool } = await import("./update-account");

    await expect(updateAccountTool.execute("user-1", { accountId: "acc-de-outro" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateAccountMock).not.toHaveBeenCalled();
  });

  it("atualiza via updateAccount() existente", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    updateAccountMock.mockResolvedValue({ ...ACCOUNT, name: "Mealheiro" });
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    const { updateAccountTool } = await import("./update-account");

    const result = await updateAccountTool.execute("user-1", { accountId: "acc-1", name: "Mealheiro" });

    expect(updateAccountMock).toHaveBeenCalledWith("user-1", "acc-1", { name: "Mealheiro", type: undefined, color: undefined });
    expect(result.name).toBe("Mealheiro");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const deleteAccountMock = vi.fn();

vi.mock("@/lib/db/accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/accounts")>("@/lib/db/accounts");
  return { ...actual, getAccountById: getAccountByIdMock, deleteAccount: deleteAccountMock };
});

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("delete_account tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { deleteAccountTool } = await import("./delete-account");
    expect(deleteAccountTool.riskTier).toBe("HIGH");
  });

  it("uma conta de outro utilizador (ou inexistente) nunca é eliminada", async () => {
    getAccountByIdMock.mockResolvedValue(null);
    const { deleteAccountTool } = await import("./delete-account");

    await expect(deleteAccountTool.execute("user-1", { accountId: "acc-de-outro" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it("uma conta com histórico (AccountNotEmptyError) é rejeitada com mensagem clara, nunca apagada em cascata", async () => {
    const { AccountNotEmptyError } = await import("@/lib/db/accounts");
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    deleteAccountMock.mockRejectedValue(new AccountNotEmptyError("Esta conta já tem histórico — arquiva-a em vez de apagar."));
    const { deleteAccountTool } = await import("./delete-account");

    await expect(deleteAccountTool.execute("user-1", { accountId: "acc-1" })).rejects.toThrow(/histórico/);
  });

  it("elimina via deleteAccount() existente quando a conta está genuinamente vazia", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    deleteAccountMock.mockResolvedValue(true);
    const { deleteAccountTool } = await import("./delete-account");

    const result = await deleteAccountTool.execute("user-1", { accountId: "acc-1" });

    expect(deleteAccountMock).toHaveBeenCalledWith("user-1", "acc-1");
    expect(result).toEqual({ deleted: true });
  });
});

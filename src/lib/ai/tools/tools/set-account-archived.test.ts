import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const setAccountArchivedMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();
const findUserByIdMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock, setAccountArchived: setAccountArchivedMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("set_account_archived tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; exige accountId e archived (boolean)", async () => {
    const { setAccountArchivedTool } = await import("./set-account-archived");
    expect(setAccountArchivedTool.riskTier).toBe("HIGH");
    expect(setAccountArchivedTool.paramsSchema.safeParse({ accountId: "acc-1" }).success).toBe(false);
    expect(setAccountArchivedTool.paramsSchema.safeParse({ accountId: "acc-1", archived: "true" }).success).toBe(false);
    expect(setAccountArchivedTool.paramsSchema.safeParse({ accountId: "acc-1", archived: true }).success).toBe(true);
  });

  it("uma conta de outro utilizador nunca é arquivada — rejeita antes de chamar setAccountArchived", async () => {
    getAccountByIdMock.mockResolvedValue(null);
    const { setAccountArchivedTool } = await import("./set-account-archived");

    await expect(setAccountArchivedTool.execute("user-1", { accountId: "acc-de-outro", archived: true })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(setAccountArchivedMock).not.toHaveBeenCalled();
  });

  it("arquiva/desarquiva via setAccountArchived() existente", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    setAccountArchivedMock.mockResolvedValue({ ...ACCOUNT, isArchived: true });
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    const { setAccountArchivedTool } = await import("./set-account-archived");

    await setAccountArchivedTool.execute("user-1", { accountId: "acc-1", archived: true });

    expect(setAccountArchivedMock).toHaveBeenCalledWith("user-1", "acc-1", true);
  });

  it("summarize distingue arquivar de desarquivar", async () => {
    const { setAccountArchivedTool } = await import("./set-account-archived");
    expect(setAccountArchivedTool.summarize({ accountId: "acc-1", archived: true }).toLowerCase()).toContain("arquivar");
    expect(setAccountArchivedTool.summarize({ accountId: "acc-1", archived: false }).toLowerCase()).toContain("desarquivar");
  });
});

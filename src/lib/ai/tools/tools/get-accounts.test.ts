import { afterEach, describe, expect, it, vi } from "vitest";

const findUserByIdMock = vi.fn();
const listAccountsMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();

vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));
vi.mock("@/lib/db/accounts", () => ({ listAccounts: listAccountsMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));

const ACCOUNT = {
  id: "acc-1",
  userId: "user-1",
  name: "Carteira",
  type: "WALLET" as const,
  currency: "CVE",
  initialBalanceMinor: 5000n,
  isArchived: false,
  color: null,
};

describe("get_accounts tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("paramsSchema rejeita qualquer campo extra, incluindo userId", async () => {
    const { getAccountsTool } = await import("./get-accounts");
    expect(getAccountsTool.paramsSchema.safeParse({}).success).toBe(true);
    expect(getAccountsTool.paramsSchema.safeParse({ userId: "outro-user" }).success).toBe(false);
  });

  it("devolve um DTO com só id/name/type/currency/balance — nunca passwordHash/email/userId", async () => {
    findUserByIdMock.mockResolvedValue({ id: "user-1", email: "a@b.com", passwordHash: "hash", timezone: "Atlantic/Cape_Verde", defaultCurrency: "CVE" });
    listAccountsMock.mockResolvedValue([ACCOUNT]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getAccountsTool } = await import("./get-accounts");
    const [account] = await getAccountsTool.execute("user-1", {});

    expect(Object.keys(account).sort()).toEqual(["id", "name", "type", "currency", "balance"].sort());
    const serialized = JSON.stringify(account);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("hash");
    expect(serialized).not.toContain("userId");
  });

  it("nunca inclui uma conta arquivada", async () => {
    findUserByIdMock.mockResolvedValue(null);
    listAccountsMock.mockResolvedValue([{ ...ACCOUNT, id: "acc-archived", isArchived: true }]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getAccountsTool } = await import("./get-accounts");
    const accounts = await getAccountsTool.execute("user-1", {});
    expect(accounts).toEqual([]);
  });

  it("passa sempre o userId recebido às funções de domínio — nunca outro", async () => {
    findUserByIdMock.mockResolvedValue(null);
    listAccountsMock.mockResolvedValue([]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getAccountsTool } = await import("./get-accounts");
    await getAccountsTool.execute("user-42", {});

    expect(listAccountsMock).toHaveBeenCalledWith("user-42");
    expect(listAllTransactionsForBalancesMock).toHaveBeenCalledWith("user-42");
    expect(findUserByIdMock).toHaveBeenCalledWith("user-42");
  });
});

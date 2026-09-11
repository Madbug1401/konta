import { afterEach, describe, expect, it, vi } from "vitest";

const createAccountMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();
const findUserByIdMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ createAccount: createAccountMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("create_account tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { createAccountTool } = await import("./create-account");
    expect(createAccountTool.riskTier).toBe("HIGH");
  });

  it("rejeita um tipo/moeda/cor fora das listas curadas, e rejeita campos extra (ex: userId)", async () => {
    const { createAccountTool } = await import("./create-account");
    expect(createAccountTool.paramsSchema.safeParse({ name: "Carteira", type: "WALLET" }).success).toBe(true);
    expect(createAccountTool.paramsSchema.safeParse({ name: "Carteira", type: "BITCOIN_WALLET" }).success).toBe(false);
    expect(createAccountTool.paramsSchema.safeParse({ name: "Carteira", type: "WALLET", currency: "XYZ" }).success).toBe(false);
    expect(createAccountTool.paramsSchema.safeParse({ name: "Carteira", type: "WALLET", userId: "outro" }).success).toBe(false);
  });

  it("cria a conta via createAccount() existente e devolve o saldo já calculado", async () => {
    createAccountMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    const { createAccountTool } = await import("./create-account");

    const result = await createAccountTool.execute("user-1", { name: "Carteira", type: "WALLET" });

    expect(createAccountMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", name: "Carteira", type: "WALLET" }));
    expect(result).toEqual({ id: "acc-1", name: "Carteira", type: "WALLET", currency: "CVE", balance: "0 CVE" });
  });

  it("summarize descreve a conta a criar", async () => {
    const { createAccountTool } = await import("./create-account");
    const summary = createAccountTool.summarize({ name: "Poupança", type: "SAVINGS", currency: "EUR" });
    expect(summary).toContain("Poupança");
    expect(summary).toContain("EUR");
  });
});

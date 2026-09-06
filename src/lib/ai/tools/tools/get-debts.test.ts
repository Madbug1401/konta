import { afterEach, describe, expect, it, vi } from "vitest";

const findUserByIdMock = vi.fn();
const listDebtsMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();

vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));
vi.mock("@/lib/db/debts", () => ({ listDebts: listDebtsMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));

const DEBT = {
  id: "debt-1",
  userId: "user-1",
  creditorName: "João",
  description: null,
  currency: "CVE",
  originalAmountMinor: 5000n,
  interestRate: null,
  status: "ACTIVE" as const,
  startDate: "2026-01-01",
  finalDueDate: null,
  installments: [],
};

describe("get_debts tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("paramsSchema não aceita nenhum campo, incluindo userId", async () => {
    const { getDebtsTool } = await import("./get-debts");
    expect(getDebtsTool.paramsSchema.safeParse({}).success).toBe(true);
    expect(getDebtsTool.paramsSchema.safeParse({ userId: "outro" }).success).toBe(false);
  });

  it("devolve um DTO sem id da dívida nem userId (reutiliza buildDebtSummaries do Milestone 2)", async () => {
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listDebtsMock.mockResolvedValue([DEBT]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getDebtsTool } = await import("./get-debts");
    const [debt] = await getDebtsTool.execute("user-1", {});

    expect(debt.creditorName).toBe("João");
    const serialized = JSON.stringify(debt);
    expect(serialized).not.toContain("\"id\"");
    expect(serialized).not.toContain("userId");
  });

  it("preserva o isolamento por utilizador", async () => {
    findUserByIdMock.mockResolvedValue(null);
    listDebtsMock.mockResolvedValue([]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getDebtsTool } = await import("./get-debts");
    await getDebtsTool.execute("user-99", {});

    expect(listDebtsMock).toHaveBeenCalledWith("user-99");
    expect(listAllTransactionsForBalancesMock).toHaveBeenCalledWith("user-99");
  });
});

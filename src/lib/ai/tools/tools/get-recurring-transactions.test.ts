import { afterEach, describe, expect, it, vi } from "vitest";

const listAccountsMock = vi.fn();
const listCategoriesMock = vi.fn();
const listRecurringTransactionsMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ listAccounts: listAccountsMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock }));
vi.mock("@/lib/db/recurring-transactions", () => ({ listRecurringTransactions: listRecurringTransactionsMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };
const SERIES = { id: "rec-1", userId: "user-1", type: "EXPENSE" as const, accountId: "acc-1", destinationAccountId: null, amountMinor: 1000n, currency: "CVE", categoryId: null, description: "Renda", frequency: "MONTHLY" as const, interval: 1, startDate: "2026-01-01", endDate: null, occurrencesTotal: null, occurrencesGenerated: 0, nextRunDate: "2026-02-01", isActive: true };

describe("get_recurring_transactions tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é LOW; paramsSchema não aceita nenhum campo", async () => {
    const { getRecurringTransactionsTool } = await import("./get-recurring-transactions");
    expect(getRecurringTransactionsTool.riskTier).toBe("LOW");
    expect(getRecurringTransactionsTool.paramsSchema.safeParse({}).success).toBe(true);
    expect(getRecurringTransactionsTool.paramsSchema.safeParse({ userId: "outro" }).success).toBe(false);
  });

  it("devolve id + nome real da conta (resolvido), nunca userId", async () => {
    listRecurringTransactionsMock.mockResolvedValue([SERIES]);
    listAccountsMock.mockResolvedValue([ACCOUNT]);
    listCategoriesMock.mockResolvedValue([]);
    const { getRecurringTransactionsTool } = await import("./get-recurring-transactions");

    const [series] = await getRecurringTransactionsTool.execute("user-1", {});

    expect(series.id).toBe("rec-1");
    expect(series.accountName).toBe("Carteira");
    expect(series.isActive).toBe(true);
    expect(JSON.stringify(series)).not.toContain("userId");
  });
});

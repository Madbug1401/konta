import { afterEach, describe, expect, it, vi } from "vitest";

const listTransactionsMock = vi.fn();
const listCategoriesMock = vi.fn();

vi.mock("@/lib/db/transactions", () => ({ listTransactions: listTransactionsMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock }));

const TRANSACTION = {
  id: "tx-1",
  userId: "user-1",
  type: "EXPENSE" as const,
  status: "COMPLETED" as const,
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 750n,
  currency: "CVE",
  categoryId: "cat-1",
  description: "Almoço",
  date: "2026-09-10",
  debtId: null,
  debtInstallmentId: null,
  goalId: null,
  recurringTransactionId: null,
};

describe("get_transactions tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aceita filtros válidos (from/to/type/search/limit)", async () => {
    const { getTransactionsTool } = await import("./get-transactions");
    const result = getTransactionsTool.paramsSchema.safeParse({ from: "2026-09-01", to: "2026-09-30", type: "EXPENSE", search: "almoço", limit: 10 });
    expect(result.success).toBe(true);
  });

  it("rejeita datas inválidas", async () => {
    const { getTransactionsTool } = await import("./get-transactions");
    expect(getTransactionsTool.paramsSchema.safeParse({ from: "10-09-2026" }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ to: "not-a-date" }).success).toBe(false);
  });

  it("rejeita accountId/categoryId/userId como parâmetros (nenhuma tool devolve esses ids ao modelo)", async () => {
    const { getTransactionsTool } = await import("./get-transactions");
    expect(getTransactionsTool.paramsSchema.safeParse({ accountId: "acc-1" }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ categoryId: "cat-1" }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ userId: "outro" }).success).toBe(false);
  });

  it("limita o limit a um valor seguro (nunca 'carregar tudo')", async () => {
    const { getTransactionsTool } = await import("./get-transactions");
    expect(getTransactionsTool.paramsSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ limit: -5 }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ limit: Infinity }).success).toBe(false);
    expect(getTransactionsTool.paramsSchema.safeParse({ limit: NaN }).success).toBe(false);
  });

  it("aplica um limit por omissão bounded quando nenhum é indicado", async () => {
    listTransactionsMock.mockResolvedValue([]);
    listCategoriesMock.mockResolvedValue([]);
    const { getTransactionsTool } = await import("./get-transactions");

    await getTransactionsTool.execute("user-1", {});

    expect(listTransactionsMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ limit: 20 }));
  });

  it("devolve um DTO com só id/type/amount/description/date/categoryName — nunca userId/accountId/categoryId", async () => {
    listTransactionsMock.mockResolvedValue([TRANSACTION]);
    listCategoriesMock.mockResolvedValue([{ id: "cat-1", name: "Alimentação", kind: "EXPENSE", isSystem: true }]);
    const { getTransactionsTool } = await import("./get-transactions");

    const [transaction] = await getTransactionsTool.execute("user-1", {});

    expect(Object.keys(transaction).sort()).toEqual(["id", "type", "amount", "description", "date", "categoryName"].sort());
    expect(transaction.categoryName).toBe("Alimentação");
    const serialized = JSON.stringify(transaction);
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("accountId");
    expect(serialized).not.toContain("categoryId");
  });

  it("nunca chama listTransactions/listCategories com um userId diferente do recebido", async () => {
    listTransactionsMock.mockResolvedValue([]);
    listCategoriesMock.mockResolvedValue([]);
    const { getTransactionsTool } = await import("./get-transactions");

    await getTransactionsTool.execute("user-77", { search: "renda" });

    expect(listTransactionsMock).toHaveBeenCalledWith("user-77", expect.objectContaining({ search: "renda" }));
    expect(listCategoriesMock).toHaveBeenCalledWith("user-77");
  });
});

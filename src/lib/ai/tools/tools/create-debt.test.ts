import { afterEach, describe, expect, it, vi } from "vitest";

const createDebtWithInstallmentsMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();

vi.mock("@/lib/db/debts", () => ({ createDebtWithInstallments: createDebtWithInstallmentsMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));

const DEBT = {
  id: "debt-1",
  userId: "user-1",
  creditorName: "João",
  description: null,
  originalAmountMinor: 5000n,
  currency: "CVE",
  interestRate: null,
  status: "ACTIVE" as const,
  startDate: "2026-01-01",
  finalDueDate: "2026-06-01",
  installments: [{ id: "inst-1", debtId: "debt-1", sequence: 1, dueDate: "2026-02-01", amountMinor: 1000n, status: "PENDING" as const }],
};

describe("create_debt tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; rejeita campos extra (ex: finalDueDate, userId)", async () => {
    const { createDebtTool } = await import("./create-debt");
    expect(createDebtTool.riskTier).toBe("HIGH");
    const valid = { creditorName: "João", originalAmountMinor: 5000, startDate: "2026-01-01", installmentCount: 5 };
    expect(createDebtTool.paramsSchema.safeParse(valid).success).toBe(true);
    expect(createDebtTool.paramsSchema.safeParse({ ...valid, finalDueDate: "2026-12-01" }).success).toBe(false);
    expect(createDebtTool.paramsSchema.safeParse({ ...valid, userId: "outro" }).success).toBe(false);
  });

  it("cria a dívida e o plano de parcelas via createDebtWithInstallments() existente — nunca uma segunda lógica de plano", async () => {
    createDebtWithInstallmentsMock.mockResolvedValue(DEBT);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);
    const { createDebtTool } = await import("./create-debt");

    const result = await createDebtTool.execute("user-1", {
      creditorName: "João",
      originalAmountMinor: 5000,
      startDate: "2026-01-01",
      installmentCount: 5,
    });

    expect(createDebtWithInstallmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", creditorName: "João", originalAmountMinor: 5000n, installmentCount: 5 }),
    );
    expect(result.id).toBe("debt-1");
    expect(result.installments).toHaveLength(1);
  });

  it("summarize inclui credor, valor e número de parcelas", async () => {
    const { createDebtTool } = await import("./create-debt");
    const summary = createDebtTool.summarize({ creditorName: "João", originalAmountMinor: 5000, startDate: "2026-01-01", installmentCount: 5 });
    expect(summary).toContain("João");
    expect(summary).toContain("5000");
    expect(summary).toContain("5 parcela");
  });
});

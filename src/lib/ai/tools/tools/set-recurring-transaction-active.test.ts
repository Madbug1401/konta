import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getRecurringTransactionByIdMock = vi.fn();
const setRecurringTransactionActiveMock = vi.fn();

vi.mock("@/lib/db/recurring-transactions", () => ({
  getRecurringTransactionById: getRecurringTransactionByIdMock,
  setRecurringTransactionActive: setRecurringTransactionActiveMock,
}));

const SERIES = { id: "rec-1", userId: "user-1", type: "EXPENSE" as const, accountId: "acc-1", destinationAccountId: null, amountMinor: 1000n, currency: "CVE", categoryId: null, description: "Renda", frequency: "MONTHLY" as const, interval: 1, startDate: "2026-01-01", endDate: null, occurrencesTotal: null, occurrencesGenerated: 0, nextRunDate: "2026-01-01", isActive: true };

describe("set_recurring_transaction_active tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; exige isActive boolean", async () => {
    const { setRecurringTransactionActiveTool } = await import("./set-recurring-transaction-active");
    expect(setRecurringTransactionActiveTool.riskTier).toBe("HIGH");
    expect(setRecurringTransactionActiveTool.paramsSchema.safeParse({ recurringTransactionId: "rec-1", isActive: false }).success).toBe(true);
    expect(setRecurringTransactionActiveTool.paramsSchema.safeParse({ recurringTransactionId: "rec-1" }).success).toBe(false);
  });

  it("uma série de outro utilizador nunca é pausada/retomada", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue(null);
    const { setRecurringTransactionActiveTool } = await import("./set-recurring-transaction-active");

    await expect(
      setRecurringTransactionActiveTool.execute("user-1", { recurringTransactionId: "rec-de-outro", isActive: false }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(setRecurringTransactionActiveMock).not.toHaveBeenCalled();
  });

  it("pausa/retoma via setRecurringTransactionActive() existente", async () => {
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES);
    setRecurringTransactionActiveMock.mockResolvedValue({ ...SERIES, isActive: false });
    const { setRecurringTransactionActiveTool } = await import("./set-recurring-transaction-active");

    const result = await setRecurringTransactionActiveTool.execute("user-1", { recurringTransactionId: "rec-1", isActive: false });

    expect(setRecurringTransactionActiveMock).toHaveBeenCalledWith("user-1", "rec-1", false);
    expect(result).toEqual({ isActive: false });
  });

  it("summarize distingue pausar de retomar", async () => {
    const { setRecurringTransactionActiveTool } = await import("./set-recurring-transaction-active");
    expect(setRecurringTransactionActiveTool.summarize({ recurringTransactionId: "rec-1", isActive: false }).toLowerCase()).toContain("pausar");
    expect(setRecurringTransactionActiveTool.summarize({ recurringTransactionId: "rec-1", isActive: true }).toLowerCase()).toContain("retomar");
  });
});

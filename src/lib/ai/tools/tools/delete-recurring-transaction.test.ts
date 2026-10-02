import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const deleteRecurringTransactionMock = vi.fn();

vi.mock("@/lib/db/recurring-transactions", () => ({ deleteRecurringTransaction: deleteRecurringTransactionMock }));

describe("delete_recurring_transaction tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { deleteRecurringTransactionTool } = await import("./delete-recurring-transaction");
    expect(deleteRecurringTransactionTool.riskTier).toBe("HIGH");
  });

  it("elimina via deleteRecurringTransaction e devolve deleted:true", async () => {
    deleteRecurringTransactionMock.mockResolvedValue(true);
    const { deleteRecurringTransactionTool } = await import("./delete-recurring-transaction");

    const result = await deleteRecurringTransactionTool.execute("user-1", { recurringTransactionId: "series-1" });

    expect(deleteRecurringTransactionMock).toHaveBeenCalledWith("user-1", "series-1");
    expect(result).toEqual({ deleted: true });
  });

  it("lança ToolExecutionError quando a série não existe/não pertence ao utilizador — nunca finge sucesso", async () => {
    deleteRecurringTransactionMock.mockResolvedValue(false);
    const { deleteRecurringTransactionTool } = await import("./delete-recurring-transaction");

    await expect(deleteRecurringTransactionTool.execute("user-1", { recurringTransactionId: "outra-pessoa" })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
  });

  it("rejeita parâmetros extra e recurringTransactionId vazio", async () => {
    const { deleteRecurringTransactionTool } = await import("./delete-recurring-transaction");
    expect(deleteRecurringTransactionTool.paramsSchema.safeParse({ recurringTransactionId: "series-1", extra: "x" }).success).toBe(false);
    expect(deleteRecurringTransactionTool.paramsSchema.safeParse({ recurringTransactionId: "" }).success).toBe(false);
  });
});

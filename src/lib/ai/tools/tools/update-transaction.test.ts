import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getCategoryByIdMock = vi.fn();
const updateTransactionMock = vi.fn();

vi.mock("@/lib/db/categories", () => ({ getCategoryById: getCategoryByIdMock }));
vi.mock("@/lib/db/transactions", () => ({ updateTransaction: updateTransactionMock }));

const UPDATED = {
  id: "tx-1",
  userId: "user-1",
  type: "EXPENSE" as const,
  status: "COMPLETED" as const,
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 900n,
  currency: "CVE",
  categoryId: null,
  description: "Almoço (atualizado)",
  date: "2026-09-15",
  debtId: null,
  debtInstallmentId: null,
  goalId: null,
  recurringTransactionId: null,
};

describe("update_transaction tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { updateTransactionTool } = await import("./update-transaction");
    expect(updateTransactionTool.riskTier).toBe("HIGH");
  });

  it("exige id — sem ele, params inválidos", async () => {
    const { updateTransactionTool } = await import("./update-transaction");
    expect(updateTransactionTool.paramsSchema.safeParse({ description: "x" }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", description: "x" }).success).toBe(true);
  });

  it(".strict() rejeita campos extra, incluindo userId/accountId", async () => {
    const { updateTransactionTool } = await import("./update-transaction");
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", userId: "outro" }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", accountId: "acc-1" }).success).toBe(false);
  });

  it("rejeita amountMinor inválido (NaN/Infinity/zero/negativo) e datas inválidas", async () => {
    const { updateTransactionTool } = await import("./update-transaction");
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", amountMinor: NaN }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", amountMinor: Infinity }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", amountMinor: 0 }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", date: "2026/09/15" }).success).toBe(false);
  });

  it("ownership: rejeita uma categoryId que não pertence ao utilizador", async () => {
    getCategoryByIdMock.mockResolvedValue(null);
    const { updateTransactionTool } = await import("./update-transaction");

    await expect(
      updateTransactionTool.execute("user-1", { id: "tx-1", categoryId: "cat-de-outro" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateTransactionMock).not.toHaveBeenCalled();
  });

  it("não é possível atualizar uma transação de outro utilizador — updateTransaction devolve null e a tool falha em segurança", async () => {
    updateTransactionMock.mockResolvedValue(null); // updateTransaction já filtra por userId internamente
    const { updateTransactionTool } = await import("./update-transaction");

    await expect(updateTransactionTool.execute("user-1", { id: "tx-de-outro-user", description: "hack" })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
  });

  it("com tudo válido, atualiza e devolve um DTO seguro, sempre com o userId recebido", async () => {
    updateTransactionMock.mockResolvedValue(UPDATED);
    const { updateTransactionTool } = await import("./update-transaction");

    const result = await updateTransactionTool.execute("user-1", { id: "tx-1", amountMinor: 900, description: "Almoço (atualizado)" });

    expect(updateTransactionMock).toHaveBeenCalledWith("user-1", "tx-1", expect.objectContaining({ amountMinor: 900n }));
    expect(result.id).toBe("tx-1");
    expect(JSON.stringify(result)).not.toContain("userId");
  });
});

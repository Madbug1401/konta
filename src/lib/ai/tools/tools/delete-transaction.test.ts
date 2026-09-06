import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const deleteTransactionMock = vi.fn();
vi.mock("@/lib/db/transactions", () => ({ deleteTransaction: deleteTransactionMock }));

describe("delete_transaction tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { deleteTransactionTool } = await import("./delete-transaction");
    expect(deleteTransactionTool.riskTier).toBe("HIGH");
  });

  it("exige id, rejeita campos extra (incluindo userId e um hipotético 'hardDelete: true')", async () => {
    const { deleteTransactionTool } = await import("./delete-transaction");
    expect(deleteTransactionTool.paramsSchema.safeParse({}).success).toBe(false);
    expect(deleteTransactionTool.paramsSchema.safeParse({ id: "tx-1" }).success).toBe(true);
    expect(deleteTransactionTool.paramsSchema.safeParse({ id: "tx-1", userId: "outro" }).success).toBe(false);
    expect(deleteTransactionTool.paramsSchema.safeParse({ id: "tx-1", hardDelete: true }).success).toBe(false);
  });

  it("usa exatamente deleteTransaction() existente — nunca uma query nova, nunca um 'modo' de eliminação escolhido pelo modelo", async () => {
    deleteTransactionMock.mockResolvedValue(true);
    const { deleteTransactionTool } = await import("./delete-transaction");

    const result = await deleteTransactionTool.execute("user-1", { id: "tx-1" });

    expect(deleteTransactionMock).toHaveBeenCalledWith("user-1", "tx-1");
    expect(deleteTransactionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: true });
  });

  it("não é possível apagar uma transação de outro utilizador — deleteTransaction devolve false e a tool falha em segurança", async () => {
    deleteTransactionMock.mockResolvedValue(false); // deleteTransaction já filtra por userId internamente
    const { deleteTransactionTool } = await import("./delete-transaction");

    await expect(deleteTransactionTool.execute("user-1", { id: "tx-de-outro-user" })).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("summarize avisa que a ação é irreversível, sem depender de nenhum dado da transação", async () => {
    const { deleteTransactionTool } = await import("./delete-transaction");
    const summary = deleteTransactionTool.summarize({ id: "tx-1" });
    expect(summary.toLowerCase()).toContain("não pode ser desfeita");
  });
});

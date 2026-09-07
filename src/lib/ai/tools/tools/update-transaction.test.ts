import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const updateTransactionMock = vi.fn();
const getTransactionByIdMock = vi.fn();
const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();

vi.mock("@/lib/db/transactions", () => ({ updateTransaction: updateTransactionMock, getTransactionById: getTransactionByIdMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock, createCategory: createCategoryMock }));

const EXISTING = {
  id: "tx-1",
  userId: "user-1",
  type: "EXPENSE" as const,
  status: "COMPLETED" as const,
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 750n,
  currency: "CVE",
  categoryId: null,
  description: "Almoço",
  date: "2026-09-15",
  debtId: null,
  debtInstallmentId: null,
  goalId: null,
  recurringTransactionId: null,
};

const UPDATED = { ...EXISTING, amountMinor: 900n, description: "Almoço (atualizado)" };

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

  it(".strict() rejeita campos extra, incluindo userId/accountId/categoryId (categoryId já não existe — foi substituído por category)", async () => {
    const { updateTransactionTool } = await import("./update-transaction");
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", userId: "outro" }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", accountId: "acc-1" }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", categoryId: "cat-1" }).success).toBe(false);
  });

  it("rejeita amountMinor inválido (NaN/Infinity/zero/negativo) e datas inválidas", async () => {
    const { updateTransactionTool } = await import("./update-transaction");
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", amountMinor: NaN }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", amountMinor: Infinity }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", amountMinor: 0 }).success).toBe(false);
    expect(updateTransactionTool.paramsSchema.safeParse({ id: "tx-1", date: "2026/09/15" }).success).toBe(false);
  });

  it("transação não encontrada (ou de outro utilizador) — getTransactionById devolve null e a tool falha em segurança, sem chamar updateTransaction", async () => {
    getTransactionByIdMock.mockResolvedValue(null);
    const { updateTransactionTool } = await import("./update-transaction");

    await expect(updateTransactionTool.execute("user-1", { id: "tx-de-outro-user", description: "hack" })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(updateTransactionMock).not.toHaveBeenCalled();
  });

  it("não é possível atualizar uma transação de outro utilizador — updateTransaction devolve null e a tool falha em segurança", async () => {
    getTransactionByIdMock.mockResolvedValue(EXISTING);
    updateTransactionMock.mockResolvedValue(null); // updateTransaction já filtra por userId internamente
    const { updateTransactionTool } = await import("./update-transaction");

    await expect(updateTransactionTool.execute("user-1", { id: "tx-1", description: "hack" })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
  });

  it("com tudo válido, atualiza e devolve um DTO seguro, sempre com o userId recebido", async () => {
    getTransactionByIdMock.mockResolvedValue(EXISTING);
    updateTransactionMock.mockResolvedValue(UPDATED);
    const { updateTransactionTool } = await import("./update-transaction");

    const result = await updateTransactionTool.execute("user-1", { id: "tx-1", amountMinor: 900, description: "Almoço (atualizado)" });

    expect(updateTransactionMock).toHaveBeenCalledWith("user-1", "tx-1", expect.objectContaining({ amountMinor: 900n }));
    expect(result.id).toBe("tx-1");
    expect(JSON.stringify(result)).not.toContain("userId");
  });

  // [Correção — mesmo bug de create-transaction.ts, 07/09/2026] `categoryId`
  // nunca foi um valor que o modelo pudesse legitimamente ter. Substituído
  // por `category` (nome), resolvido aqui contra as categorias reais do
  // utilizador, usando o `type` já existente da transação (nunca alterável
  // por este schema) para saber que `kind` procurar.
  it("category: resolve para uma categoria existente do mesmo kind da transação (EXPENSE), sem distinguir maiúsculas/minúsculas", async () => {
    getTransactionByIdMock.mockResolvedValue(EXISTING); // type: EXPENSE
    listCategoriesMock.mockResolvedValue([{ id: "cat-weed", name: "Weed", kind: "EXPENSE", isSystem: false }]);
    updateTransactionMock.mockResolvedValue({ ...UPDATED, categoryId: "cat-weed" });
    const { updateTransactionTool } = await import("./update-transaction");

    const result = await updateTransactionTool.execute("user-1", { id: "tx-1", category: "weed" });

    expect(createCategoryMock).not.toHaveBeenCalled();
    expect(updateTransactionMock).toHaveBeenCalledWith("user-1", "tx-1", expect.objectContaining({ categoryId: "cat-weed" }));
    expect(result.categoryName).toBe("Weed");
  });

  it("category: cria uma categoria nova quando nenhuma existente corresponde", async () => {
    getTransactionByIdMock.mockResolvedValue(EXISTING);
    listCategoriesMock.mockResolvedValue([]);
    createCategoryMock.mockResolvedValue({ id: "cat-new", name: "Lazer", kind: "EXPENSE", isSystem: false });
    updateTransactionMock.mockResolvedValue({ ...UPDATED, categoryId: "cat-new" });
    const { updateTransactionTool } = await import("./update-transaction");

    await updateTransactionTool.execute("user-1", { id: "tx-1", category: "Lazer" });

    expect(createCategoryMock).toHaveBeenCalledWith({ userId: "user-1", name: "Lazer", kind: "EXPENSE" });
  });

  it("category: nunca é resolvida numa TRANSFER existente — ignorada", async () => {
    getTransactionByIdMock.mockResolvedValue({ ...EXISTING, type: "TRANSFER" });
    updateTransactionMock.mockResolvedValue({ ...UPDATED, type: "TRANSFER" });
    const { updateTransactionTool } = await import("./update-transaction");

    await updateTransactionTool.execute("user-1", { id: "tx-1", category: "Weed" });

    expect(listCategoriesMock).not.toHaveBeenCalled();
    expect(createCategoryMock).not.toHaveBeenCalled();
  });

  it("sem `category` no pedido, categoryId não é tocado (undefined — updateTransaction mantém o valor atual)", async () => {
    getTransactionByIdMock.mockResolvedValue(EXISTING);
    updateTransactionMock.mockResolvedValue(UPDATED);
    const { updateTransactionTool } = await import("./update-transaction");

    await updateTransactionTool.execute("user-1", { id: "tx-1", description: "só a descrição" });

    expect(listCategoriesMock).not.toHaveBeenCalled();
    expect(updateTransactionMock).toHaveBeenCalledWith("user-1", "tx-1", expect.objectContaining({ categoryId: undefined }));
  });
});

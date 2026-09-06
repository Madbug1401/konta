import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { CreateTransactionSchema } from "@/app/api/transactions/route";
import { ToolExecutionError } from "../types";

type CreateTransactionParams = z.infer<typeof CreateTransactionSchema>;

const getAccountByIdMock = vi.fn();
const getCategoryByIdMock = vi.fn();
const getGoalByIdMock = vi.fn();
const createTransactionMock = vi.fn();
const findUserByIdMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/categories", () => ({ getCategoryById: getCategoryByIdMock }));
vi.mock("@/lib/db/goals", () => ({ getGoalById: getGoalByIdMock }));
vi.mock("@/lib/db/transactions", () => ({ createTransaction: createTransactionMock }));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

const CREATED = {
  id: "tx-new",
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

function validParams(overrides: Partial<CreateTransactionParams> = {}): CreateTransactionParams {
  return { type: "EXPENSE", accountId: "acc-1", amountMinor: 750, description: "Almoço", ...overrides };
}

describe("create_transaction tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    expect(createTransactionTool.riskTier).toBe("HIGH");
  });

  it("paramsSchema não tem campo userId — o modelo não tem como fornecer um", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    const result = createTransactionTool.paramsSchema.safeParse({ ...validParams(), userId: "outro-user" });
    // O campo extra é ignorado pelo schema (reutilizado literalmente da rota
    // HTTP, que também não usa .strict()) — mas nunca é lido por execute().
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("userId");
  });

  it("rejeita amountMinor inválido: NaN, Infinity, zero, negativo", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    expect(createTransactionTool.paramsSchema.safeParse(validParams({ amountMinor: NaN })).success).toBe(false);
    expect(createTransactionTool.paramsSchema.safeParse(validParams({ amountMinor: Infinity })).success).toBe(false);
    expect(createTransactionTool.paramsSchema.safeParse(validParams({ amountMinor: 0 })).success).toBe(false);
    expect(createTransactionTool.paramsSchema.safeParse(validParams({ amountMinor: -100 })).success).toBe(false);
  });

  it("rejeita datas inválidas", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    expect(createTransactionTool.paramsSchema.safeParse(validParams({ date: "15-09-2026" })).success).toBe(false);
  });

  it("rejeita TRANSFER sem destinationAccountId, e accountId===destinationAccountId", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    expect(createTransactionTool.paramsSchema.safeParse(validParams({ type: "TRANSFER" })).success).toBe(false);
    expect(
      createTransactionTool.paramsSchema.safeParse(validParams({ type: "TRANSFER", destinationAccountId: "acc-1" })).success,
    ).toBe(false);
  });

  it("ownership: rejeita uma accountId que não pertence ao utilizador (getAccountById devolve null)", async () => {
    getAccountByIdMock.mockResolvedValue(null);
    const { createTransactionTool } = await import("./create-transaction");

    await expect(createTransactionTool.execute("user-1", validParams())).rejects.toBeInstanceOf(ToolExecutionError);
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("rejeita escrever numa conta arquivada", async () => {
    getAccountByIdMock.mockResolvedValue({ ...ACCOUNT, isArchived: true });
    const { createTransactionTool } = await import("./create-transaction");

    await expect(createTransactionTool.execute("user-1", validParams())).rejects.toBeInstanceOf(ToolExecutionError);
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("ownership: rejeita uma categoryId que não pertence ao utilizador", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    getCategoryByIdMock.mockResolvedValue(null);
    const { createTransactionTool } = await import("./create-transaction");

    await expect(createTransactionTool.execute("user-1", validParams({ categoryId: "cat-de-outro" }))).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("ownership: rejeita uma goalId que não pertence ao utilizador", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    getGoalByIdMock.mockResolvedValue(null);
    const { createTransactionTool } = await import("./create-transaction");

    await expect(createTransactionTool.execute("user-1", validParams({ goalId: "goal-de-outro" }))).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("com tudo válido, cria a transação e devolve um DTO seguro (com id, sem userId/accountId)", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    createTransactionMock.mockResolvedValue(CREATED);
    const { createTransactionTool } = await import("./create-transaction");

    const result = await createTransactionTool.execute("user-1", validParams());

    expect(result.id).toBe("tx-new");
    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", currency: "CVE" }));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("accountId");
  });

  it("summarize descreve a ação sem inventar uma moeda", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    const summary = createTransactionTool.summarize(validParams({ amountMinor: 500, description: "Táxi" }));
    expect(summary).toContain("500");
    expect(summary).toContain("Táxi");
    expect(summary).not.toMatch(/CVE|EUR|USD/);
  });
});

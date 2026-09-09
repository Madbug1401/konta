import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const getGoalByIdMock = vi.fn();
const createTransactionMock = vi.fn();
const findUserByIdMock = vi.fn();
const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/goals", () => ({ getGoalById: getGoalByIdMock }));
vi.mock("@/lib/db/transactions", () => ({ createTransaction: createTransactionMock }));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock, createCategory: createCategoryMock }));

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

// Forma exata dos parâmetros aceites por esta tool (ver create-transaction.ts
// — schema próprio, não o CreateTransactionSchema da rota HTTP, porque
// `categoryId` foi substituído por `category`, um nome em texto livre).
interface ToolParams {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  accountId: string;
  destinationAccountId?: string;
  amountMinor: number;
  category?: string;
  description: string;
  date?: string;
  goalId?: string;
  accountName?: string;
}

function validParams(overrides: Partial<ToolParams> = {}): ToolParams {
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

  it("paramsSchema não tem campo userId/riskTier/confirmed — .strict() rejeita-os (nunca lidos por execute())", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    const result = createTransactionTool.paramsSchema.safeParse({
      ...validParams(),
      userId: "outro-user",
      riskTier: "LOW",
      confirmed: true,
    });
    expect(result.success).toBe(false);
  });

  it("mesmo que o modelo injete userId/riskTier/confirmed no input, createTransaction() é chamado com o userId real da sessão, e a tool continua HIGH", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    createTransactionMock.mockResolvedValue(CREATED);
    const { createTransactionTool } = await import("./create-transaction");

    await createTransactionTool.execute("user-real", validParams());

    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-real" }));
    expect(createTransactionTool.riskTier).toBe("HIGH"); // riskTier é sempre estático, nunca lido de params
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

  // [Correção — bug reportado em uso real, 07/09/2026] Antes desta correção,
  // esta tool aceitava `categoryId` (um id que o modelo nunca podia ter
  // legitimamente — ver comentário em ../shared.ts::resolveCategoryByName) e
  // toda transação criada pela IA ficava sempre sem categoria. Agora aceita
  // `category` (nome em texto), resolvido para uma categoria real.
  it("category: reutiliza uma categoria existente do utilizador, sem distinguir maiúsculas/minúsculas", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listCategoriesMock.mockResolvedValue([{ id: "cat-weed", name: "Weed", kind: "EXPENSE", isSystem: false }]);
    createTransactionMock.mockResolvedValue({ ...CREATED, categoryId: "cat-weed" });
    const { createTransactionTool } = await import("./create-transaction");

    const result = await createTransactionTool.execute("user-1", validParams({ category: "weed" }));

    expect(createCategoryMock).not.toHaveBeenCalled();
    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-weed" }));
    expect(result.categoryName).toBe("Weed");
  });

  it("category: cria uma categoria nova quando nenhuma existente corresponde ao nome — mesma ação que CategoryQuickCreate já dá a um humano", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listCategoriesMock.mockResolvedValue([]);
    createCategoryMock.mockResolvedValue({ id: "cat-new", name: "Streaming", kind: "EXPENSE", isSystem: false });
    createTransactionMock.mockResolvedValue({ ...CREATED, categoryId: "cat-new" });
    const { createTransactionTool } = await import("./create-transaction");

    await createTransactionTool.execute("user-1", validParams({ category: "Streaming" }));

    expect(createCategoryMock).toHaveBeenCalledWith({ userId: "user-1", name: "Streaming", kind: "EXPENSE" });
    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-new" }));
  });

  it("category: nunca é resolvida numa TRANSFER — ignorada, mesma regra da rota HTTP", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    createTransactionMock.mockResolvedValue({ ...CREATED, type: "TRANSFER", categoryId: null });
    const { createTransactionTool } = await import("./create-transaction");

    await createTransactionTool.execute(
      "user-1",
      validParams({ type: "TRANSFER", destinationAccountId: "acc-2", category: "Weed" }),
    );

    expect(listCategoriesMock).not.toHaveBeenCalled();
    expect(createCategoryMock).not.toHaveBeenCalled();
    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: null }));
  });

  it("summarize descreve a ação sem inventar uma moeda, e inclui a categoria quando dada", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    const summary = createTransactionTool.summarize(validParams({ amountMinor: 500, description: "Táxi", category: "Transporte" }));
    expect(summary).toContain("500");
    expect(summary).toContain("Táxi");
    expect(summary).toContain("Transporte");
    expect(summary).not.toMatch(/CVE|EUR|USD/);
  });

  // [Milestone 5b] accountName é só cosmético — usado pelo texto de
  // confirmação quando propose_transactions já resolveu o nome real da
  // conta; nunca influencia em que conta a transação é criada (isso é
  // sempre accountId, verificado por ownership em execute()).
  it("summarize inclui o nome da conta quando accountName é dado", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    const summary = createTransactionTool.summarize(validParams({ accountName: "Carteira" }));
    expect(summary).toContain('em "Carteira"');
  });

  it("summarize omite a conta quando accountName não é dado — nunca inventa um nome", async () => {
    const { createTransactionTool } = await import("./create-transaction");
    const summary = createTransactionTool.summarize(validParams());
    expect(summary).not.toContain(" em \"");
  });

  it("accountName nunca é lido por execute() — só accountId decide onde a transação é criada", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    createTransactionMock.mockResolvedValue(CREATED);
    const { createTransactionTool } = await import("./create-transaction");

    await createTransactionTool.execute("user-1", validParams({ accountName: "Um Nome Qualquer Inventado" }));

    expect(getAccountByIdMock).toHaveBeenCalledWith("user-1", "acc-1");
    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-1" }));
  });
});

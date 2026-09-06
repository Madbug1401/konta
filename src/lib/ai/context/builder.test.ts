import { afterEach, describe, expect, it, vi } from "vitest";

const findUserByIdMock = vi.fn();
const listAccountsMock = vi.fn();
const listCategoriesMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();
const listTransactionsMock = vi.fn();
const listDebtsMock = vi.fn();
const listGoalsMock = vi.fn();
const getInvestmentDetailByAccountIdMock = vi.fn();
const listValuationsMock = vi.fn();

vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));
vi.mock("@/lib/db/accounts", () => ({ listAccounts: listAccountsMock }));
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock }));
vi.mock("@/lib/db/transactions", () => ({
  listAllTransactionsForBalances: listAllTransactionsForBalancesMock,
  listTransactions: listTransactionsMock,
}));
vi.mock("@/lib/db/debts", () => ({ listDebts: listDebtsMock }));
vi.mock("@/lib/db/goals", () => ({ listGoals: listGoalsMock }));
vi.mock("@/lib/db/investments", () => ({
  getInvestmentDetailByAccountId: getInvestmentDetailByAccountIdMock,
  listValuations: listValuationsMock,
}));

const NOW = new Date("2026-09-15T12:00:00Z");

const USER = { id: "user-1", email: "user1@konta.cv", passwordHash: "hash", name: null, timezone: "Atlantic/Cape_Verde", locale: "pt-CV", defaultCurrency: "CVE" };

const ACCOUNT = {
  id: "acc-1",
  userId: "user-1",
  name: "Carteira",
  type: "WALLET" as const,
  currency: "CVE",
  initialBalanceMinor: 5000n,
  isArchived: false,
  color: null,
};

const TRANSACTION = {
  id: "tx-1",
  userId: "user-1",
  type: "INCOME" as const,
  status: "COMPLETED" as const,
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 1000n,
  currency: "CVE",
  categoryId: null,
  description: "Salário",
  date: "2026-09-05",
  debtId: null,
  debtInstallmentId: null,
  goalId: null,
  recurringTransactionId: null,
};

function setDefaultMocks() {
  findUserByIdMock.mockResolvedValue(USER);
  listAccountsMock.mockResolvedValue([ACCOUNT]);
  listCategoriesMock.mockResolvedValue([]);
  listAllTransactionsForBalancesMock.mockResolvedValue([TRANSACTION]);
  listTransactionsMock.mockResolvedValue([TRANSACTION]);
  listDebtsMock.mockResolvedValue([]);
  listGoalsMock.mockResolvedValue([]);
  getInvestmentDetailByAccountIdMock.mockResolvedValue(null);
  listValuationsMock.mockResolvedValue([]);
}

describe("buildAiContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("com dados mínimos/vazios, produz um contexto válido em vez de rebentar", async () => {
    findUserByIdMock.mockResolvedValue(null);
    listAccountsMock.mockResolvedValue([]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { buildAiContext } = await import("./builder");
    const context = await buildAiContext("user-1", { mode: "light" }, NOW);

    expect(context.mode).toBe("light");
    expect(context.generatedAt).toBe("2026-09-15");
    expect(context.summaries).toHaveLength(1); // cai na moeda de omissão (CVE)
    expect(context.accounts).toEqual([]);
  });

  it("modo light contém só summaries/accounts — nunca transactions/debts/goals/investments/categoryComparison", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");

    const context = await buildAiContext("user-1", { mode: "light" }, NOW);

    expect(context.summaries).toBeDefined();
    expect(context.accounts).toBeDefined();
    expect(context.transactions).toBeUndefined();
    expect(context.debts).toBeUndefined();
    expect(context.goals).toBeUndefined();
    expect(context.investments).toBeUndefined();
    expect(context.categoryComparison).toBeUndefined();
    // Light nunca precisa de dívidas/metas/categorias — não deve sequer chamá-las.
    expect(listDebtsMock).not.toHaveBeenCalled();
    expect(listGoalsMock).not.toHaveBeenCalled();
    expect(listCategoriesMock).not.toHaveBeenCalled();
  });

  it("modo full contém summaries/accounts/categoryComparison/debts/goals — nunca transactions/investments", async () => {
    setDefaultMocks();
    listDebtsMock.mockResolvedValue([
      {
        id: "debt-1",
        userId: "user-1",
        creditorName: "João",
        description: null,
        currency: "CVE",
        originalAmountMinor: 5000n,
        interestRate: null,
        status: "ACTIVE",
        startDate: "2026-01-01",
        finalDueDate: null,
        installments: [],
      },
    ]);
    listGoalsMock.mockResolvedValue([
      { id: "goal-1", userId: "user-1", name: "Meta", description: null, currency: "CVE", targetAmountMinor: 1000n, targetDate: null, linkedAccountId: null, status: "ACTIVE" },
    ]);

    const { buildAiContext } = await import("./builder");
    const context = await buildAiContext("user-1", { mode: "full" }, NOW);

    expect(context.summaries).toBeDefined();
    expect(context.accounts).toBeDefined();
    expect(context.categoryComparison).toBeDefined();
    expect(context.debts).toHaveLength(1);
    expect(context.goals).toHaveLength(1);
    expect(context.transactions).toBeUndefined();
    expect(context.investments).toBeUndefined();
  });

  it("full exclui dívidas já pagas e metas não-ativas do resumo automático", async () => {
    setDefaultMocks();
    listDebtsMock.mockResolvedValue([
      { id: "d1", userId: "user-1", creditorName: "Paga", description: null, currency: "CVE", originalAmountMinor: 1000n, interestRate: null, status: "PAID_OFF", startDate: "2026-01-01", finalDueDate: null, installments: [] },
    ]);
    listGoalsMock.mockResolvedValue([
      { id: "g1", userId: "user-1", name: "Abandonada", description: null, currency: "CVE", targetAmountMinor: 1000n, targetDate: null, linkedAccountId: null, status: "ABANDONED" },
    ]);

    const { buildAiContext } = await import("./builder");
    const context = await buildAiContext("user-1", { mode: "full" }, NOW);

    expect(context.debts).toEqual([]);
    expect(context.goals).toEqual([]);
  });

  it("directed com domains=['accounts'] só popula summaries/accounts, e nunca chama listDebts/listGoals/listTransactions", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");

    const context = await buildAiContext("user-1", { mode: "directed", domains: ["accounts"] }, NOW);

    expect(context.summaries).toBeDefined();
    expect(context.accounts).toBeDefined();
    expect(context.transactions).toBeUndefined();
    expect(context.debts).toBeUndefined();
    expect(context.goals).toBeUndefined();
    expect(context.investments).toBeUndefined();
    expect(listDebtsMock).not.toHaveBeenCalled();
    expect(listGoalsMock).not.toHaveBeenCalled();
    expect(listTransactionsMock).not.toHaveBeenCalled();
  });

  it("directed com domains=['transactions'] nunca chama listAccounts/listAllTransactionsForBalances/listDebts/listGoals", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");

    const context = await buildAiContext("user-1", { mode: "directed", domains: ["transactions"] }, NOW);

    expect(context.transactions).toBeDefined();
    expect(context.summaries).toBeUndefined();
    expect(context.accounts).toBeUndefined();
    expect(listAccountsMock).not.toHaveBeenCalled();
    expect(listAllTransactionsForBalancesMock).not.toHaveBeenCalled();
    expect(listDebtsMock).not.toHaveBeenCalled();
    expect(listGoalsMock).not.toHaveBeenCalled();
  });

  it("directed com domains=['debts'] passa por todos os estados (pedido explícito, sem filtro automático)", async () => {
    setDefaultMocks();
    listDebtsMock.mockResolvedValue([
      { id: "d1", userId: "user-1", creditorName: "Paga", description: null, currency: "CVE", originalAmountMinor: 1000n, interestRate: null, status: "PAID_OFF", startDate: "2026-01-01", finalDueDate: null, installments: [] },
    ]);

    const { buildAiContext } = await import("./builder");
    const context = await buildAiContext("user-1", { mode: "directed", domains: ["debts"] }, NOW);

    expect(context.debts).toHaveLength(1);
    expect(context.debts?.[0].status).toBe("PAID_OFF");
  });

  it("passa os filtros de transação diretamente para listTransactions", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");

    await buildAiContext(
      "user-1",
      { mode: "directed", domains: ["transactions"], transactionFilters: { from: "2026-09-01", to: "2026-09-05", type: "EXPENSE" } },
      NOW,
    );

    expect(listTransactionsMock).toHaveBeenCalledWith("user-1", { from: "2026-09-01", to: "2026-09-05", type: "EXPENSE" });
  });

  it("rejeita um domínio directed desconhecido sem tocar na base de dados", async () => {
    setDefaultMocks();
    const { buildAiContext, UnsupportedContextDomainError } = await import("./builder").then(async (builder) => ({
      buildAiContext: builder.buildAiContext,
      UnsupportedContextDomainError: (await import("./types")).UnsupportedContextDomainError,
    }));

    await expect(
      buildAiContext("user-1", { mode: "directed", domains: ["passwords" as never] }, NOW),
    ).rejects.toBeInstanceOf(UnsupportedContextDomainError);
    expect(findUserByIdMock).not.toHaveBeenCalled();
    expect(listAccountsMock).not.toHaveBeenCalled();
  });

  it("rejeita uma lista de domínios vazia", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");
    const { UnsupportedContextDomainError } = await import("./types");

    await expect(buildAiContext("user-1", { mode: "directed", domains: [] }, NOW)).rejects.toBeInstanceOf(
      UnsupportedContextDomainError,
    );
  });

  it("preserva o isolamento por utilizador: cada chamada usa sempre o userId recebido, nunca outro", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");

    await buildAiContext("user-42", { mode: "light" }, NOW);

    expect(findUserByIdMock).toHaveBeenCalledWith("user-42");
    expect(listAccountsMock).toHaveBeenCalledWith("user-42");
    expect(listAllTransactionsForBalancesMock).toHaveBeenCalledWith("user-42");
  });

  it("nunca expõe passwordHash/email/ids internos em nenhum campo do contexto gerado", async () => {
    setDefaultMocks();
    listDebtsMock.mockResolvedValue([
      { id: "debt-1", userId: "user-1", creditorName: "João", description: null, currency: "CVE", originalAmountMinor: 5000n, interestRate: null, status: "ACTIVE", startDate: "2026-01-01", finalDueDate: null, installments: [] },
    ]);
    listGoalsMock.mockResolvedValue([
      { id: "goal-1", userId: "user-1", name: "Meta", description: null, currency: "CVE", targetAmountMinor: 1000n, targetDate: null, linkedAccountId: "acc-1", status: "ACTIVE" },
    ]);

    const { buildAiContext } = await import("./builder");
    const context = await buildAiContext("user-1", { mode: "full" }, NOW);

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("hash");
    expect(serialized).not.toContain(USER.email);
    expect(serialized).not.toContain("acc-1");
    expect(serialized).not.toContain("debt-1");
    expect(serialized).not.toContain("goal-1");
    expect(serialized).not.toContain("\"userId\"");
    expect(serialized).not.toContain("\"id\"");
  });

  it("é determinístico: a mesma entrada produz sempre a mesma saída", async () => {
    setDefaultMocks();
    const { buildAiContext } = await import("./builder");

    const a = await buildAiContext("user-1", { mode: "light" }, NOW);
    const b = await buildAiContext("user-1", { mode: "light" }, NOW);

    expect(a).toEqual(b);
  });
});

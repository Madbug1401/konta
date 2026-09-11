// ============================================================================
// KONTA AI — Milestone 6: testes de integração ao nível do Executor/Registry
// reais (nunca mockados) — provam que a expansão de 8 para 27 tools continua
// a passar pelo MESMO Tool Registry → Permission Layer → Executor, sem
// nenhum atalho novo. A orquestração em si (LOW+HIGH, grouped confirmation,
// cancelamento) já está coberta genericamente por
// src/lib/ai/chat/orchestrator.test.ts com tools mockadas — o que falta
// provar aqui é que as tools REAIS desta milestone se comportam da mesma
// forma dentro do Executor real.
// ============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "./executor";
import { listTools } from "./registry";

// Mocka toda a camada de dados usada pelas tools novas — cada mock rejeita
// se for chamado, para provar que uma tool HIGH nunca toca a base de dados
// antes de uma confirmação existir (ver executor.ts: `confirmation_required`
// é devolvido ANTES de `execute()` ser sequer invocado).
// Declaração de função (hoisted) — nunca `const`/arrow, porque `vi.mock` é
// içado para o topo do módulo, antes de qualquer `const` ser inicializado.
function throwIfCalled(): never {
  throw new Error("Nunca deveria ser chamado antes de uma confirmação — a Permission Layer falhou.");
}

vi.mock("@/lib/db/accounts", () => ({
  createAccount: throwIfCalled,
  updateAccount: throwIfCalled,
  setAccountArchived: throwIfCalled,
  deleteAccount: throwIfCalled,
  getAccountById: throwIfCalled,
  listAccounts: throwIfCalled,
}));
vi.mock("@/lib/db/debts", () => ({
  createDebtWithInstallments: throwIfCalled,
  updateDebt: throwIfCalled,
  markDebtDefaulted: throwIfCalled,
  payInstallment: throwIfCalled,
  getDebtById: throwIfCalled,
  listDebts: throwIfCalled,
}));
vi.mock("@/lib/db/goals", () => ({
  createGoal: throwIfCalled,
  updateGoal: throwIfCalled,
  updateGoalStatus: throwIfCalled,
  getGoalById: throwIfCalled,
  listGoals: throwIfCalled,
}));
vi.mock("@/lib/db/recurring-transactions", () => ({
  createRecurringTransaction: throwIfCalled,
  setRecurringTransactionActive: throwIfCalled,
  getRecurringTransactionById: throwIfCalled,
  listRecurringTransactions: throwIfCalled,
}));
vi.mock("@/lib/db/investments", () => ({
  createInvestmentDetail: throwIfCalled,
  updateInvestmentDetail: throwIfCalled,
  addValuation: throwIfCalled,
  getInvestmentDetailByAccountId: throwIfCalled,
  listValuations: throwIfCalled,
}));
vi.mock("@/lib/db/categories", () => ({ listCategories: throwIfCalled, createCategory: throwIfCalled, getCategoryById: throwIfCalled }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: throwIfCalled, listTransactions: throwIfCalled }));
vi.mock("@/lib/db/users", () => ({ findUserById: throwIfCalled }));

// Um valor mínimo válido por tool HIGH nova — só o suficiente para passar o
// paramsSchema (a Permission Layer decide antes de qualquer verificação de
// ownership tocar a base de dados mockada acima).
const MINIMAL_VALID_PARAMS: Record<string, unknown> = {
  create_account: { name: "Conta", type: "WALLET" },
  update_account: { accountId: "acc-1" },
  set_account_archived: { accountId: "acc-1", archived: true },
  delete_account: { accountId: "acc-1" },
  create_debt: { creditorName: "João", originalAmountMinor: 5000, startDate: "2026-01-01", installmentCount: 1 },
  update_debt: { debtId: "debt-1" },
  pay_debt_installment: { debtId: "debt-1", installmentId: "inst-1", accountId: "acc-1" },
  mark_debt_defaulted: { debtId: "debt-1" },
  create_goal: { name: "Meta", targetAmountMinor: 1000, linkedAccountId: "acc-1" },
  update_goal: { goalId: "goal-1" },
  update_goal_status: { goalId: "goal-1", status: "ACHIEVED" },
  create_recurring_transaction: { type: "EXPENSE", accountId: "acc-1", amountMinor: 1000, description: "x", frequency: "MONTHLY", startDate: "2026-01-01" },
  set_recurring_transaction_active: { recurringTransactionId: "rec-1", isActive: false },
  create_investment_detail: { accountId: "acc-1", investmentType: "Ações" },
  update_investment_detail: { accountId: "acc-1" },
  add_investment_valuation: { accountId: "acc-1", date: "2026-01-01", valueMinor: 1000 },
};

describe("Milestone 6 — Permission Layer real cobre todas as tools HIGH novas", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const newHighTools = listTools().filter((t) => t.riskTier === "HIGH" && t.name in MINIMAL_VALID_PARAMS);

  it("encontrou as 16 novas tools HIGH esperadas (nenhuma ficou de fora do teste)", () => {
    expect(newHighTools).toHaveLength(16);
  });

  it.each(newHighTools.map((t) => t.name))(
    "%s: exige confirmation_required via o Executor real — nunca executa direto, nunca toca a base de dados mockada",
    async (name) => {
      const result = await executeTool(name, "user-1", MINIMAL_VALID_PARAMS[name]);
      expect(result.status).toBe("confirmation_required");
    },
  );

  it("nenhuma tool nova é CRITICAL (rejeitada sem sequer propor)", () => {
    for (const tool of listTools()) {
      if (tool.name in MINIMAL_VALID_PARAMS) expect(tool.riskTier).not.toBe("CRITICAL");
    }
  });
});

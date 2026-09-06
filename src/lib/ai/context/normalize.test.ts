import { describe, expect, it } from "vitest";
import type { AccountRecord, GoalRecord, TransactionRecord } from "@/lib/financial-engine";
import type { CategoryRow } from "@/lib/db/categories";
import type { DebtWithInstallments } from "@/lib/db/debts";
import type { InvestmentAccountData } from "./collect";
import {
  buildAccountSummaries,
  buildCategoryComparison,
  buildCurrencySummaries,
  buildDebtSummaries,
  buildGoalSummaries,
  buildInvestmentSummaries,
  buildTransactionSummaries,
} from "./normalize";

const TODAY = "2026-09-15";
const MONTH_BOUNDS = { start: "2026-09-01", end: "2026-09-30" };
const PREVIOUS_MONTH_BOUNDS = { start: "2026-08-01", end: "2026-08-31" };
const LOOKBACK_START = "2026-06-17";

function account(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: "acc-1",
    userId: "user-1",
    name: "Carteira",
    type: "WALLET",
    currency: "CVE",
    initialBalanceMinor: 0n,
    isArchived: false,
    color: null,
    ...overrides,
  };
}

function transaction(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: "tx-1",
    userId: "user-1",
    type: "INCOME",
    status: "COMPLETED",
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
    ...overrides,
  };
}

describe("buildCurrencySummaries", () => {
  it("contém só os campos aprovados, com valores monetários já formatados", () => {
    const accounts = [account({ initialBalanceMinor: 5000n })];
    const transactions = [transaction({ type: "INCOME", amountMinor: 1000n, date: "2026-09-05" })];

    const [summary] = buildCurrencySummaries(accounts, transactions, "CVE", TODAY, MONTH_BOUNDS);

    expect(Object.keys(summary).sort()).toEqual(
      ["currency", "availableBalance", "netWorth", "monthlyIncome", "monthlyExpense", "monthlyCashflow", "savingsRatePercent"].sort(),
    );
    expect(summary.currency).toBe("CVE");
    expect(summary.netWorth).toContain("CVE");
    expect(typeof summary.netWorth).toBe("string");
    expect(summary.savingsRatePercent).toBe(100);
  });

  it("sem contas, cai na moeda de omissão do utilizador (nunca uma lista vazia sem sentido)", () => {
    const summaries = buildCurrencySummaries([], [], "EUR", TODAY, MONTH_BOUNDS);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].currency).toBe("EUR");
  });

  it("é determinístico para os mesmos dados de entrada", () => {
    const accounts = [account({ initialBalanceMinor: 5000n })];
    const transactions = [transaction()];
    const a = buildCurrencySummaries(accounts, transactions, "CVE", TODAY, MONTH_BOUNDS);
    const b = buildCurrencySummaries(accounts, transactions, "CVE", TODAY, MONTH_BOUNDS);
    expect(a).toEqual(b);
  });
});

describe("buildAccountSummaries", () => {
  it("contém só name/type/currency/balance — nunca id, userId, initialBalanceMinor ou color", () => {
    const [summary] = buildAccountSummaries([account()], [], TODAY);

    expect(Object.keys(summary).sort()).toEqual(["name", "type", "currency", "balance"].sort());
    expect(summary).not.toHaveProperty("id");
    expect(summary).not.toHaveProperty("userId");
    expect(summary).not.toHaveProperty("initialBalanceMinor");
  });

  it("nunca inclui uma conta arquivada", () => {
    const summaries = buildAccountSummaries([account({ id: "acc-archived", isArchived: true })], [], TODAY);
    expect(summaries).toHaveLength(0);
  });

  it("não serializa o AccountRecord em bruto (o DTO não é um superset do record)", () => {
    const rawAccount = account();
    const [summary] = buildAccountSummaries([rawAccount], [], TODAY);
    // O DTO tem menos campos que o record de origem — nunca `{ ...account }`.
    expect(Object.keys(summary).length).toBeLessThan(Object.keys(rawAccount).length);
  });
});

describe("buildTransactionSummaries", () => {
  const categories: CategoryRow[] = [{ id: "cat-1", name: "Alimentação", kind: "EXPENSE", isSystem: true }];

  it("contém só os campos aprovados, resolve o nome da categoria e nunca expõe ids internos", () => {
    const [summary] = buildTransactionSummaries(
      [transaction({ type: "EXPENSE", categoryId: "cat-1", description: "Almoço", amountMinor: 750n })],
      categories,
    );

    expect(Object.keys(summary).sort()).toEqual(["type", "amount", "description", "date", "categoryName"].sort());
    expect(summary.categoryName).toBe("Alimentação");
    expect(summary).not.toHaveProperty("id");
    expect(summary).not.toHaveProperty("accountId");
    expect(summary).not.toHaveProperty("categoryId");
    expect(summary).not.toHaveProperty("userId");
  });

  it("categoria null (ex: TRANSFER) vira categoryName null, nunca omitido nem inventado", () => {
    const [summary] = buildTransactionSummaries([transaction({ type: "TRANSFER", categoryId: null })], categories);
    expect(summary.categoryName).toBeNull();
  });
});

describe("buildCategoryComparison", () => {
  const categories: CategoryRow[] = [{ id: "cat-1", name: "Alimentação", kind: "EXPENSE", isSystem: true }];

  it("compara mês atual com o anterior, por moeda, com nomes de categoria resolvidos", () => {
    const transactions = [
      transaction({ id: "t1", type: "EXPENSE", categoryId: "cat-1", amountMinor: 500n, date: "2026-09-10" }),
      transaction({ id: "t2", type: "EXPENSE", categoryId: "cat-1", amountMinor: 300n, date: "2026-08-10" }),
    ];

    const [comparison] = buildCategoryComparison([account()], transactions, categories, "CVE", MONTH_BOUNDS, PREVIOUS_MONTH_BOUNDS);

    expect(Object.keys(comparison).sort()).toEqual(["currency", "currentMonth", "previousMonth"].sort());
    expect(comparison.currentMonth).toEqual([{ categoryName: "Alimentação", amount: expect.stringContaining("CVE") }]);
    expect(comparison.previousMonth).toEqual([{ categoryName: "Alimentação", amount: expect.stringContaining("CVE") }]);
  });
});

describe("buildDebtSummaries", () => {
  function debt(overrides: Partial<DebtWithInstallments> = {}): DebtWithInstallments {
    return {
      id: "debt-1",
      userId: "user-1",
      creditorName: "João",
      description: null,
      currency: "CVE",
      originalAmountMinor: 10000n,
      interestRate: null,
      status: "ACTIVE",
      startDate: "2026-01-01",
      finalDueDate: null,
      installments: [
        { id: "inst-1", debtId: "debt-1", sequence: 1, dueDate: "2026-09-20", amountMinor: 1000n, status: "PENDING" },
        { id: "inst-2", debtId: "debt-1", sequence: 2, dueDate: "2026-08-01", amountMinor: 1000n, status: "PENDING" },
      ],
      ...overrides,
    };
  }

  it("contém só os campos aprovados — nunca id da dívida nem id de parcela", () => {
    const [summary] = buildDebtSummaries([debt()], [], TODAY);

    expect(Object.keys(summary).sort()).toEqual(
      ["creditorName", "currency", "status", "remaining", "upcomingInstallments", "overdueInstallments"].sort(),
    );
    expect(summary.creditorName).toBe("João");
    expect(summary).not.toHaveProperty("id");
    expect(summary).not.toHaveProperty("userId");
    for (const installment of [...summary.upcomingInstallments, ...summary.overdueInstallments]) {
      expect(Object.keys(installment).sort()).toEqual(["dueDate", "amount", "status"].sort());
      expect(installment).not.toHaveProperty("id");
      expect(installment).not.toHaveProperty("debtId");
    }
  });

  it("separa corretamente parcelas a vencer de parcelas em atraso", () => {
    const [summary] = buildDebtSummaries([debt()], [], TODAY);
    expect(summary.upcomingInstallments).toHaveLength(1);
    expect(summary.upcomingInstallments[0].dueDate).toBe("2026-09-20");
    expect(summary.overdueInstallments).toHaveLength(1);
    expect(summary.overdueInstallments[0].dueDate).toBe("2026-08-01");
  });
});

describe("buildGoalSummaries", () => {
  function goal(overrides: Partial<GoalRecord> = {}): GoalRecord {
    return {
      id: "goal-1",
      userId: "user-1",
      name: "Computador",
      description: null,
      currency: "CVE",
      targetAmountMinor: 120000n,
      targetDate: "2027-03-01",
      linkedAccountId: "acc-savings",
      status: "ACTIVE",
      ...overrides,
    };
  }

  it("contém só os campos aprovados — nunca id da meta nem linkedAccountId", () => {
    const savings = account({ id: "acc-savings", name: "Poupança", initialBalanceMinor: 20000n });
    const [summary] = buildGoalSummaries([goal()], [savings], [], TODAY, LOOKBACK_START, 90);

    expect(Object.keys(summary).sort()).toEqual(
      [
        "name",
        "currency",
        "status",
        "targetAmount",
        "targetDate",
        "currentAmount",
        "progressPercent",
        "estimatedCompletionDate",
        "onTrack",
      ].sort(),
    );
    expect(summary).not.toHaveProperty("id");
    expect(summary).not.toHaveProperty("linkedAccountId");
    expect(summary).not.toHaveProperty("userId");
  });

  it("sem conta ligada, o progresso atual é zero em vez de rebentar", () => {
    const [summary] = buildGoalSummaries([goal({ linkedAccountId: null })], [], [], TODAY, LOOKBACK_START, 90);
    expect(summary.currentAmount).toContain("0");
  });
});

describe("buildInvestmentSummaries", () => {
  function investmentAccountData(): InvestmentAccountData {
    return {
      account: account({ id: "acc-inv", type: "INVESTMENT", name: "Fundo Ações" }),
      detail: { id: "detail-1", accountId: "acc-inv", investmentType: "Ações", expectedReturnRate: 5, maturityDate: null },
      valuations: [{ id: "val-1", investmentDetailId: "detail-1", date: "2026-09-01", valueMinor: 33000n }],
    };
  }

  it("contém só os campos aprovados — nunca id da conta nem id do detalhe de investimento", () => {
    const transactions = [
      transaction({ type: "TRANSFER", destinationAccountId: "acc-inv", amountMinor: 30000n, date: "2026-01-01" }),
    ];
    const [summary] = buildInvestmentSummaries([investmentAccountData()], transactions);

    expect(Object.keys(summary).sort()).toEqual(
      ["accountName", "investmentType", "currency", "capitalContributed", "hasValuation", "currentValue", "returnPercent", "asOfDate"].sort(),
    );
    expect(summary).not.toHaveProperty("id");
    expect(summary).not.toHaveProperty("accountId");
    expect(summary.hasValuation).toBe(true);
  });

  it("sem avaliação registada, nunca inventa um retorno", () => {
    const data = investmentAccountData();
    data.valuations = [];
    const [summary] = buildInvestmentSummaries([data], []);
    expect(summary.hasValuation).toBe(false);
    expect(summary.currentValue).toBeNull();
    expect(summary.returnPercent).toBeNull();
  });
});

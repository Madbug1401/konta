import { describe, expect, it } from "vitest";
import { getCashflow, getCategoryBreakdown, getExpenseTotal, getIncomeTotal, getSavingsRate } from "./cashflow";
import type { TransactionRecord } from "./types";

function tx(overrides: Partial<TransactionRecord> & Pick<TransactionRecord, "id" | "type" | "amountMinor">): TransactionRecord {
  return {
    userId: "u1",
    status: "COMPLETED",
    accountId: "acc_bank",
    destinationAccountId: null,
    currency: "CVE",
    categoryId: null,
    description: "",
    date: "2026-01-01",
    debtId: null,
    debtInstallmentId: null,
    goalId: null,
    recurringTransactionId: null,
    ...overrides,
  };
}

describe("getIncomeTotal / getExpenseTotal / getCashflow / getSavingsRate: filtro por moeda", () => {
  // [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] Mesma
  // motivação de balance.test.ts: uma transação em CVE e outra em EUR nunca
  // podem ser somadas como se fossem a mesma unidade.
  const cveIncome = tx({ id: "t1", type: "INCOME", amountMinor: 100_000n, currency: "CVE" });
  const cveExpense = tx({ id: "t2", type: "EXPENSE", amountMinor: 30_000n, currency: "CVE" });
  const eurIncome = tx({ id: "t3", type: "INCOME", amountMinor: 2_000n, currency: "EUR" });
  const eurExpense = tx({ id: "t4", type: "EXPENSE", amountMinor: 500n, currency: "EUR" });
  const all = [cveIncome, cveExpense, eurIncome, eurExpense];

  it("sem `currency`, continua a somar tudo (comportamento anterior preservado)", () => {
    expect(getIncomeTotal(all)).toBe(102_000n);
    expect(getExpenseTotal(all)).toBe(30_500n);
    expect(getCashflow(all)).toBe(71_500n);
  });

  it("com `currency`, isola cada moeda", () => {
    expect(getIncomeTotal(all, undefined, "CVE")).toBe(100_000n);
    expect(getIncomeTotal(all, undefined, "EUR")).toBe(2_000n);
    expect(getExpenseTotal(all, undefined, "CVE")).toBe(30_000n);
    expect(getExpenseTotal(all, undefined, "EUR")).toBe(500n);
    expect(getCashflow(all, undefined, "CVE")).toBe(70_000n);
    expect(getCashflow(all, undefined, "EUR")).toBe(1_500n);
  });

  it("taxa de poupança é calculada só com os valores da própria moeda", () => {
    // CVE: (100000 - 30000) / 100000 = 70%
    expect(getSavingsRate(all, undefined, "CVE")).toBeCloseTo(70, 5);
    // EUR: (2000 - 500) / 2000 = 75%
    expect(getSavingsRate(all, undefined, "EUR")).toBeCloseTo(75, 5);
  });

  it("sem receita naquela moeda, retorna null (não 0 nem Infinity)", () => {
    const onlyExpense = tx({ id: "t5", type: "EXPENSE", amountMinor: 1_000n, currency: "USD" });
    expect(getSavingsRate([onlyExpense], undefined, "USD")).toBeNull();
  });
});

describe("getCategoryBreakdown: filtro por moeda", () => {
  it("não mistura despesas de moedas diferentes na mesma categoria", () => {
    const cve = tx({ id: "t1", type: "EXPENSE", amountMinor: 5_000n, currency: "CVE", categoryId: "cat_comida" });
    const eur = tx({ id: "t2", type: "EXPENSE", amountMinor: 40n, currency: "EUR", categoryId: "cat_comida" });
    const breakdown = getCategoryBreakdown([cve, eur], "EXPENSE", undefined, "EUR");
    expect(breakdown).toEqual([{ categoryId: "cat_comida", totalMinor: 40n }]);
  });
});

import { describe, expect, it } from "vitest";
import { getAccountBalance, getAvailableBalance, getNetWorth } from "./balance";
import type { AccountRecord, TransactionRecord } from "./types";

const bank: AccountRecord = {
  id: "acc_bank",
  userId: "u1",
  name: "Banco",
  type: "BANK",
  currency: "CVE",
  initialBalanceMinor: 10_000n,
  isArchived: false,
};
const savings: AccountRecord = {
  id: "acc_savings",
  userId: "u1",
  name: "Poupança",
  type: "SAVINGS",
  currency: "CVE",
  initialBalanceMinor: 0n,
  isArchived: false,
};

function income(id: string, accountId: string, amount: bigint, date: string): TransactionRecord {
  return {
    id,
    userId: "u1",
    type: "INCOME",
    status: "COMPLETED",
    accountId,
    destinationAccountId: null,
    amountMinor: amount,
    currency: "CVE",
    categoryId: null,
    description: "Salário",
    date,
    debtId: null,
    debtInstallmentId: null,
    goalId: null,
    recurringTransactionId: null,
  };
}

function expense(id: string, accountId: string, amount: bigint, date: string): TransactionRecord {
  return { ...income(id, accountId, amount, date), type: "EXPENSE", description: "Compras" };
}

function transfer(id: string, from: string, to: string, amount: bigint, date: string): TransactionRecord {
  return {
    ...income(id, from, amount, date),
    type: "TRANSFER",
    destinationAccountId: to,
    description: "Transferência",
  };
}

describe("getAccountBalance", () => {
  it("soma o saldo inicial + entradas - saídas", () => {
    const txs = [income("t1", "acc_bank", 5_000n, "2026-01-01"), expense("t2", "acc_bank", 2_000n, "2026-01-05")];
    expect(getAccountBalance(bank, txs)).toBe(13_000n); // 10000 + 5000 - 2000
  });

  it("uma transferência não é tratada como despesa: reduz a origem e aumenta o destino", () => {
    const txs = [transfer("t1", "acc_bank", "acc_savings", 3_000n, "2026-01-01")];
    expect(getAccountBalance(bank, txs)).toBe(7_000n); // 10000 - 3000
    expect(getAccountBalance(savings, txs)).toBe(3_000n); // 0 + 3000
  });

  it("ignora transações PENDING ao calcular o saldo (só COMPLETED afeta o saldo)", () => {
    const pendingExpense: TransactionRecord = { ...expense("t1", "acc_bank", 2_000n, "2026-01-01"), status: "PENDING" };
    expect(getAccountBalance(bank, [pendingExpense])).toBe(10_000n);
  });

  it("respeita asOfDate, ignorando transações futuras", () => {
    const txs = [income("t1", "acc_bank", 5_000n, "2026-03-01")];
    expect(getAccountBalance(bank, txs, "2026-02-01")).toBe(10_000n);
    expect(getAccountBalance(bank, txs, "2026-03-01")).toBe(15_000n);
  });
});

describe("getNetWorth / getAvailableBalance", () => {
  it("soma todas as contas não arquivadas para o património total", () => {
    const txs = [transfer("t1", "acc_bank", "acc_savings", 3_000n, "2026-01-01")];
    // bank: 7000, savings: 3000 -> total continua 10000, a transferência não cria nem destrói dinheiro
    expect(getNetWorth([bank, savings], txs)).toBe(10_000n);
  });

  it("saldo disponível ignora contas de poupança/investimento", () => {
    const txs = [transfer("t1", "acc_bank", "acc_savings", 3_000n, "2026-01-01")];
    expect(getAvailableBalance([bank, savings], txs)).toBe(7_000n);
  });
});

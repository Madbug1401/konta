// ============================================================================
// Testes de regressão dos 5 bugs identificados na Auditoria_Gestor_Financeiro.
//
// Cada teste abaixo reproduz o cenário exato descrito na auditoria e prova
// que o novo modelo/Financial Engine já não permite o comportamento errado —
// não por um "patch" pontual, mas porque o desenho de dados elimina a
// ambiguidade que causava o bug.
// ============================================================================

import { describe, expect, it } from "vitest";
import { getAccountBalance } from "./balance";
import { splitIntoInstallments, installmentsMatchTotal } from "./money";
import { getTodayInTimezone } from "./datetime";
import { computeInvestmentPerformance } from "./investments";
import { getOccurrencesOfSeries } from "./recurring";
import type { AccountRecord, TransactionRecord } from "./types";

describe("Bug 1 — Cofre de Emergência a somar valores absolutos", () => {
  it("um levantamento (TRANSFER de saída) reduz o saldo do cofre, nunca aumenta", () => {
    const emergencyFund: AccountRecord = {
      id: "acc_emergency",
      userId: "u1",
      name: "Cofre de Emergência",
      type: "EMERGENCY_FUND",
      currency: "CVE",
      initialBalanceMinor: 0n,
      isArchived: false,
      color: null,
    };
    const transactions: TransactionRecord[] = [
      // Depósito de 50.000 CVE no cofre (transferência do banco para o cofre)
      mkTransfer("tx1", "acc_bank", "acc_emergency", 50_000n, "2026-01-01"),
      // Levantamento de 20.000 CVE do cofre (transferência do cofre para o banco)
      mkTransfer("tx2", "acc_emergency", "acc_bank", 20_000n, "2026-02-01"),
    ];

    const balance = getAccountBalance(emergencyFund, transactions);

    // No protótipo antigo, o levantamento era somado como valor absoluto e o
    // saldo apresentado subia para 70.000 em vez de descer para 30.000.
    expect(balance).toBe(30_000n);
    expect(balance).not.toBe(70_000n);
  });
});

describe("Bug 2 — Validação de parcelas com igualdade de floats", () => {
  it("1000 CVE em 3 parcelas soma exatamente 1000, sem comparação de floats", () => {
    const installments = splitIntoInstallments(1000n, 3);

    expect(installments.reduce((a, b) => a + b, 0n)).toBe(1000n);
    expect(installmentsMatchTotal(installments, 1000n)).toBe(true);

    // No protótipo antigo: 333.33 * 3 = 999.99 !== 1000 -> plano válido era
    // rejeitado. Aqui as parcelas nascem já corretas (333, 333, 334).
    expect(installments).toEqual([333n, 333n, 334n]);
  });

  it("100 CVE em 7 parcelas continua a somar exatamente 100", () => {
    const installments = splitIntoInstallments(100n, 7);
    expect(installments.reduce((a, b) => a + b, 0n)).toBe(100n);
  });
});

describe("Bug 3 — 'Hoje' calculado em UTC em vez do timezone do utilizador", () => {
  it("às 23:30 locais em Cabo Verde (UTC-1), 'hoje' ainda é o dia local, não o dia seguinte em UTC", () => {
    // 2026-08-25T23:30:00 em Atlantic/Cape_Verde (UTC-1) == 2026-08-26T00:30:00Z
    const nowUtc = new Date("2026-08-26T00:30:00.000Z");

    const localToday = getTodayInTimezone("Atlantic/Cape_Verde", nowUtc);
    const naiveUtcToday = nowUtc.toISOString().slice(0, 10); // o cálculo antigo, incorreto

    expect(localToday).toBe("2026-08-25");
    expect(naiveUtcToday).toBe("2026-08-26");
    expect(localToday).not.toBe(naiveUtcToday);
  });
});

describe("Bug 4 — Crescimento de investimento confundido com rentabilidade real", () => {
  it("sem avaliação registada, não inventa uma taxa de retorno", () => {
    const performance = computeInvestmentPerformance(
      "acc_invest",
      [mkTransfer("tx1", "acc_bank", "acc_invest", 100_000n, "2026-01-01")],
      [],
    );
    expect(performance.capitalContributedMinor).toBe(100_000n);
    expect(performance.hasValuation).toBe(false);
    expect(performance.returnPercent).toBeNull();
  });

  it("capital aportado e valor atual são sempre dois números distintos, nunca um a fingir de outro", () => {
    const performance = computeInvestmentPerformance(
      "acc_invest",
      [mkTransfer("tx1", "acc_bank", "acc_invest", 100_000n, "2026-01-01")],
      [{ id: "v1", investmentDetailId: "inv1", date: "2026-06-01", valueMinor: 108_000n }],
    );
    expect(performance.capitalContributedMinor).toBe(100_000n);
    expect(performance.currentValueMinor).toBe(108_000n);
    expect(performance.gainLossMinor).toBe(8_000n);
    expect(performance.returnPercent).toBeCloseTo(8, 5);
  });
});

describe("Bug 5 — Remoção de série recorrente por título/valor em vez de identificador próprio", () => {
  it("duas séries com o mesmo título e tipo continuam distintas e removíveis independentemente", () => {
    const transactions: TransactionRecord[] = [
      mkExpense("tx1", "acc_bank", 1_000n, "2026-01-01", "series_netflix"),
      mkExpense("tx2", "acc_bank", 1_000n, "2026-02-01", "series_netflix"),
      // Segunda série, mesmo título ("Subscrição") e mesmo valor — cenário
      // exato que confundia o código antigo (match por título+valor).
      mkExpense("tx3", "acc_bank", 1_000n, "2026-01-15", "series_spotify"),
      mkExpense("tx4", "acc_bank", 1_000n, "2026-02-15", "series_spotify"),
    ];

    const netflixOccurrences = getOccurrencesOfSeries(transactions, "series_netflix");
    const spotifyOccurrences = getOccurrencesOfSeries(transactions, "series_spotify");

    expect(netflixOccurrences.map((t) => t.id)).toEqual(["tx1", "tx2"]);
    expect(spotifyOccurrences.map((t) => t.id)).toEqual(["tx3", "tx4"]);
  });
});

// ---- helpers ----

function mkTransfer(
  id: string,
  accountId: string,
  destinationAccountId: string,
  amountMinor: bigint,
  date: string,
): TransactionRecord {
  return {
    id,
    userId: "u1",
    type: "TRANSFER",
    status: "COMPLETED",
    accountId,
    destinationAccountId,
    amountMinor,
    currency: "CVE",
    categoryId: null,
    description: "transfer",
    date,
    debtId: null,
    debtInstallmentId: null,
    goalId: null,
    recurringTransactionId: null,
  };
}

function mkExpense(
  id: string,
  accountId: string,
  amountMinor: bigint,
  date: string,
  recurringTransactionId: string | null = null,
): TransactionRecord {
  return {
    id,
    userId: "u1",
    type: "EXPENSE",
    status: "COMPLETED",
    accountId,
    destinationAccountId: null,
    amountMinor,
    currency: "CVE",
    categoryId: null,
    description: "Subscrição",
    date,
    debtId: null,
    debtInstallmentId: null,
    goalId: null,
    recurringTransactionId,
  };
}

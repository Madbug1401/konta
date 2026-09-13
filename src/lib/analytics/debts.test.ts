import { describe, expect, it } from "vitest";
import { getDebtAnalysis } from "./debts";
import { makeDataset, makeDebt, makeFilters, makeInstallment, makeTransaction } from "./test-fixtures";

describe("getDebtAnalysis", () => {
  it("sem dívidas: tudo zero, debtServiceRatioPercent null (sem receita nem parcelas)", () => {
    const analysis = getDebtAnalysis(makeDataset(), makeFilters());
    expect(analysis.activeCount).toBe(0);
    expect(analysis.debtServiceRatioPercent).toBeNull();
  });

  it("agrega total original/restante/pago de múltiplas dívidas, reutilizando getDebtRemaining", () => {
    const debt1 = makeDebt({ id: "debt-1", originalAmountMinor: 10_000n }, []);
    const debt2 = makeDebt({ id: "debt-2", originalAmountMinor: 5_000n }, []);
    const dataset = makeDataset({
      debts: [debt1, debt2],
      transactions: [makeTransaction({ type: "EXPENSE", amountMinor: 3_000n, debtId: "debt-1", date: "2026-09-05" })],
    });
    const analysis = getDebtAnalysis(dataset, makeFilters());
    const strip = (s: string) => s.replace(/[^\d]/g, "");
    expect(strip(analysis.totalOriginal)).toBe("15000");
    expect(strip(analysis.totalRemaining)).toBe("12000"); // 15000 - 3000 pago
    expect(strip(analysis.totalPaid)).toBe("3000");
  });

  it("conta parcelas com vencimento DENTRO do período, nunca todas as parcelas futuras", () => {
    const debt = makeDebt({ id: "debt-1" }, [
      makeInstallment({ id: "i1", debtId: "debt-1", dueDate: "2026-09-10", amountMinor: 1000n }),
      makeInstallment({ id: "i2", debtId: "debt-1", dueDate: "2026-12-10", amountMinor: 1000n }), // fora do período (Setembro)
    ]);
    const dataset = makeDataset({ debts: [debt] });
    const analysis = getDebtAnalysis(dataset, makeFilters());
    expect(analysis.installmentsDueInPeriod).toContain("1000");
  });

  it("debtServiceRatioPercent = parcelas do período / receita do período — nunca dividido por zero", () => {
    const debt = makeDebt({ id: "debt-1" }, [makeInstallment({ id: "i1", debtId: "debt-1", dueDate: "2026-09-10", amountMinor: 3000n })]);
    const dataset = makeDataset({
      debts: [debt],
      transactions: [makeTransaction({ type: "INCOME", amountMinor: 10_000n, date: "2026-09-01" })],
    });
    const analysis = getDebtAnalysis(dataset, makeFilters());
    expect(analysis.debtServiceRatioPercent).toBe(30);
  });

  it("progressPercent de uma dívida sem nenhum pagamento é 0; totalmente paga é 100", () => {
    const debt = makeDebt({ id: "debt-1", originalAmountMinor: 1000n }, []);
    const dataset = makeDataset({ debts: [debt] });
    const withoutPayment = getDebtAnalysis(dataset, makeFilters());
    expect(withoutPayment.debts[0].progressPercent).toBe(0);

    const paidDataset = makeDataset({
      debts: [debt],
      transactions: [makeTransaction({ type: "EXPENSE", amountMinor: 1000n, debtId: "debt-1", date: "2026-09-05" })],
    });
    const paid = getDebtAnalysis(paidDataset, makeFilters());
    expect(paid.debts[0].progressPercent).toBe(100);
  });

  it("nunca mistura dívidas de moedas diferentes", () => {
    const debt = makeDebt({ id: "debt-eur", currency: "EUR", originalAmountMinor: 999_999n }, []);
    const dataset = makeDataset({ debts: [debt] });
    const analysis = getDebtAnalysis(dataset, makeFilters({ currency: "CVE" }));
    expect(analysis.debts).toHaveLength(0);
  });
});

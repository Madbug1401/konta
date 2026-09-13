import { describe, expect, it } from "vitest";
import { getInvestmentAnalysis } from "./investments";
import { makeAccount, makeDataset, makeTransaction } from "./test-fixtures";

describe("getInvestmentAnalysis", () => {
  it("sem contas de investimento: lista vazia, totalCurrentValue null (nunca zero disfarçado)", () => {
    const analysis = getInvestmentAnalysis(makeDataset(), { currency: "CVE" });
    expect(analysis.accounts).toEqual([]);
    expect(analysis.totalCurrentValue).toBeNull();
  });

  it("sem avaliação registada: hasValuation false, currentValue null — nunca inventa um valor atual", () => {
    const account = makeAccount({ id: "acc-inv", type: "INVESTMENT" });
    const dataset = makeDataset({
      accounts: [account],
      investmentAccounts: [{ account, detail: null, valuations: [] }],
    });
    const analysis = getInvestmentAnalysis(dataset, { currency: "CVE" });
    expect(analysis.accounts[0].hasValuation).toBe(false);
    expect(analysis.accounts[0].currentValue).toBeNull();
    expect(analysis.totalCurrentValue).toBeNull();
  });

  it("capital investido = soma de TRANSFER de entrada na conta de investimento — reutiliza computeInvestmentPerformance", () => {
    const account = makeAccount({ id: "acc-inv", type: "INVESTMENT" });
    const dataset = makeDataset({
      accounts: [account, makeAccount({ id: "acc-wallet" })],
      investmentAccounts: [{ account, detail: null, valuations: [] }],
      transactions: [makeTransaction({ type: "TRANSFER", accountId: "acc-wallet", destinationAccountId: "acc-inv", amountMinor: 20_000n, date: "2026-01-01" })],
    });
    const analysis = getInvestmentAnalysis(dataset, { currency: "CVE" });
    expect(analysis.accounts[0].capitalContributed.replace(/[^\d]/g, "")).toBe("20000");
  });

  it("nunca mistura contas de investimento de moedas diferentes", () => {
    const eurAccount = makeAccount({ id: "acc-eur", type: "INVESTMENT", currency: "EUR" });
    const dataset = makeDataset({
      accounts: [eurAccount],
      investmentAccounts: [{ account: eurAccount, detail: null, valuations: [] }],
    });
    const analysis = getInvestmentAnalysis(dataset, { currency: "CVE" });
    expect(analysis.accounts).toHaveLength(0);
  });

  it("totalCurrentValue só soma quando TODAS as contas têm avaliação — nunca uma soma parcial disfarçada de total", () => {
    const acc1 = makeAccount({ id: "acc-1", type: "INVESTMENT" });
    const acc2 = makeAccount({ id: "acc-2", type: "INVESTMENT" });
    const dataset = makeDataset({
      accounts: [acc1, acc2],
      investmentAccounts: [
        { account: acc1, detail: { id: "d1", accountId: "acc-1", investmentType: "Ações", expectedReturnRate: null, maturityDate: null }, valuations: [{ id: "v1", investmentDetailId: "d1", date: "2026-09-01", valueMinor: 25_000n }] },
        { account: acc2, detail: null, valuations: [] },
      ],
    });
    const analysis = getInvestmentAnalysis(dataset, { currency: "CVE" });
    expect(analysis.totalCurrentValue).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { AiContext } from "@/lib/ai/context";
import { renderContextForPrompt } from "./context-presentation";

describe("renderContextForPrompt", () => {
  it("contexto vazio (sem contas/transações) produz texto válido, nunca vazio", () => {
    const context: AiContext = { mode: "light", generatedAt: "2026-09-15" };
    const text = renderContextForPrompt(context);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Sem dados financeiros registados");
  });

  it("é determinístico para o mesmo AiContext", () => {
    const context: AiContext = {
      mode: "light",
      generatedAt: "2026-09-15",
      summaries: [
        { currency: "CVE", availableBalance: "25 000 CVE", netWorth: "30 000 CVE", monthlyIncome: "30 000 CVE", monthlyExpense: "5 000 CVE", monthlyCashflow: "25 000 CVE", savingsRatePercent: 83.3 },
      ],
    };
    expect(renderContextForPrompt(context)).toBe(renderContextForPrompt(context));
  });

  it("inclui só o que o AiContext já contém — nunca inventa uma secção para um campo ausente", () => {
    const context: AiContext = {
      mode: "directed",
      generatedAt: "2026-09-15",
      accounts: [{ name: "Carteira", type: "WALLET", currency: "CVE", balance: "5 000 CVE" }],
    };
    const text = renderContextForPrompt(context);
    expect(text).toContain("Carteira");
    expect(text).not.toContain("Dívida");
    expect(text).not.toContain("Meta");
  });

  it("nunca inclui um id ou userId — o AiContext de entrada já não os tem, e esta camada não os inventa", () => {
    const context: AiContext = {
      mode: "full",
      generatedAt: "2026-09-15",
      debts: [
        {
          creditorName: "João",
          currency: "CVE",
          status: "ACTIVE",
          remaining: "5 000 CVE",
          upcomingInstallments: [{ dueDate: "2026-09-20", amount: "1 000 CVE", status: "PENDING" }],
          overdueInstallments: [],
        },
      ],
    };
    const text = renderContextForPrompt(context);
    expect(text).not.toMatch(/\buserId\b/);
    expect(text).not.toMatch(/"id":/);
  });
});

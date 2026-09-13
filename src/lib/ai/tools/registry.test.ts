import { describe, expect, it } from "vitest";
import { getTool, listTools } from "./registry";

const EXPECTED_TOOL_RISK: Record<string, "LOW" | "HIGH"> = {
  // Milestone 3-5b
  get_accounts: "LOW",
  get_transactions: "LOW",
  create_transaction: "HIGH",
  update_transaction: "HIGH",
  delete_transaction: "HIGH",
  get_debts: "LOW",
  get_goals: "LOW",
  propose_transactions: "LOW",
  // Milestone 6 — cobertura completa (ver docs/architecture/OVERVIEW.md)
  get_categories: "LOW",
  get_recurring_transactions: "LOW",
  get_investments: "LOW",
  create_account: "HIGH",
  update_account: "HIGH",
  set_account_archived: "HIGH",
  delete_account: "HIGH",
  create_debt: "HIGH",
  update_debt: "HIGH",
  pay_debt_installment: "HIGH",
  mark_debt_defaulted: "HIGH",
  create_goal: "HIGH",
  update_goal: "HIGH",
  update_goal_status: "HIGH",
  create_recurring_transaction: "HIGH",
  set_recurring_transaction_active: "HIGH",
  create_investment_detail: "HIGH",
  update_investment_detail: "HIGH",
  add_investment_valuation: "HIGH",
  // Milestone Analytics — cobertura de análise financeira (ver
  // docs/architecture/OVERVIEW.md, secção "Konta Analytics"). Todas LOW,
  // READ-ONLY: nunca escrevem, nunca exigem confirmação.
  get_analytics_overview: "LOW",
  get_cashflow_analysis: "LOW",
  get_category_analysis: "LOW",
  get_debt_analysis: "LOW",
  get_goal_analysis: "LOW",
  get_recurring_analysis: "LOW",
  get_investment_analysis: "LOW",
  get_financial_trends: "LOW",
  get_financial_insights: "LOW",
  run_financial_simulation: "LOW",
  set_analytics_view: "LOW",
};
const EXPECTED_TOOL_NAMES = Object.keys(EXPECTED_TOOL_RISK);

describe("Tool Registry", () => {
  it("regista exatamente as tools esperadas (Milestone 3-6) — nenhuma a mais, nenhuma a menos", () => {
    const names = listTools()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("todos os nomes são únicos", () => {
    const names = listTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(EXPECTED_TOOL_NAMES)("getTool('%s') devolve a tool correta", (name) => {
    const tool = getTool(name);
    expect(tool).toBeDefined();
    expect(tool?.name).toBe(name);
  });

  it("getTool devolve undefined para uma tool inexistente — nunca lança, nunca inventa uma tool", () => {
    expect(getTool("reset_database")).toBeUndefined();
    expect(getTool("")).toBeUndefined();
    expect(getTool("GET_ACCOUNTS")).toBeUndefined(); // sensível a maiúsculas — não faz correspondência aproximada
  });

  it("cada tool tem riskTier de um dos 4 valores válidos", () => {
    for (const tool of listTools()) {
      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(tool.riskTier);
    }
  });

  it("os risk tiers correspondem exatamente à política V1 do design (leituras LOW, escritas HIGH)", () => {
    const riskByName = Object.fromEntries(listTools().map((t) => [t.name, t.riskTier]));
    expect(riskByName).toEqual(EXPECTED_TOOL_RISK);
  });

  it("listTools() não é a referência interna mutável (uma cópia — alterar o resultado não afeta o Registry)", () => {
    const first = listTools();
    first.pop();
    expect(listTools()).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  // [Milestone 6 — auditoria de segurança] Nenhuma operação encontrada exige
  // CRITICAL: as duas ações irreversíveis novas (mark_debt_defaulted,
  // update_goal_status) já têm um guard equivalente no próprio SQL (só
  // ACTIVE pode transitar) e delete_account só aceita uma conta genuinamente
  // vazia (AccountNotEmptyError) — nenhuma tem menos proteção do que a UI
  // manual já tinha. Ver M6 Final Report, secção Security.
  it("nenhuma tool exposta no Registry tem risk CRITICAL (nenhuma operação auditada exigiu esse nível)", () => {
    expect(listTools().some((t) => t.riskTier === "CRITICAL")).toBe(false);
  });
});

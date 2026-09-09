import { describe, expect, it } from "vitest";
import { getTool, listTools } from "./registry";

const EXPECTED_TOOL_NAMES = [
  "get_accounts",
  "get_transactions",
  "create_transaction",
  "update_transaction",
  "delete_transaction",
  "get_debts",
  "get_goals",
  "propose_transactions",
];

describe("Tool Registry", () => {
  it("regista exatamente as 8 tools (V1 + propose_transactions do Milestone 5b) — nenhuma a mais, nenhuma a menos", () => {
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
    expect(getTool("delete_account")).toBeUndefined();
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
    expect(riskByName).toEqual({
      get_accounts: "LOW",
      get_transactions: "LOW",
      get_debts: "LOW",
      get_goals: "LOW",
      propose_transactions: "LOW",
      create_transaction: "HIGH",
      update_transaction: "HIGH",
      delete_transaction: "HIGH",
    });
  });

  it("listTools() não é a referência interna mutável (uma cópia — alterar o resultado não afeta o Registry)", () => {
    const first = listTools();
    first.pop();
    expect(listTools()).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it("nenhuma tool exposta no Registry tem risk CRITICAL (nenhuma tool desta V1 deve sequer existir nesse nível)", () => {
    expect(listTools().some((t) => t.riskTier === "CRITICAL")).toBe(false);
  });
});

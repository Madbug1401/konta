import { describe, expect, it } from "vitest";
import { getAnthropicToolDefinitions } from "./anthropic-adapter";
import { listTools } from "./registry";

describe("getAnthropicToolDefinitions", () => {
  it("devolve exatamente uma definição por tool do Registry, na mesma quantidade", () => {
    const definitions = getAnthropicToolDefinitions();
    expect(definitions).toHaveLength(listTools().length);
  });

  it("cada definição tem só name/description/inputSchema — nunca execute/riskTier/summarize", () => {
    for (const definition of getAnthropicToolDefinitions()) {
      expect(Object.keys(definition).sort()).toEqual(["name", "description", "inputSchema"].sort());
      expect(definition).not.toHaveProperty("execute");
      expect(definition).not.toHaveProperty("riskTier");
      expect(definition).not.toHaveProperty("summarize");
    }
  });

  it("inputSchema é um JSON Schema real (não um ZodType) — nunca serializa a instância do Zod", () => {
    const definitions = getAnthropicToolDefinitions();
    const getAccounts = definitions.find((d) => d.name === "get_accounts");
    expect(getAccounts?.inputSchema).toMatchObject({ type: "object" });
    expect(typeof getAccounts?.inputSchema.parse).toBe("undefined"); // não é o schema Zod em si
  });

  it("o inputSchema de create_transaction reflete os campos obrigatórios reais do schema reutilizado", () => {
    const definitions = getAnthropicToolDefinitions();
    const createTransaction = definitions.find((d) => d.name === "create_transaction");
    expect(createTransaction?.inputSchema.required).toEqual(
      expect.arrayContaining(["type", "accountId", "amountMinor", "description"]),
    );
  });

  it("nomes e descrições correspondem exatamente ao Registry", () => {
    const definitions = getAnthropicToolDefinitions();
    const registryTools = listTools();
    for (const tool of registryTools) {
      const definition = definitions.find((d) => d.name === tool.name);
      expect(definition?.description).toBe(tool.description);
    }
  });
});

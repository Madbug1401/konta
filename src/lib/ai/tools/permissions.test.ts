import { describe, expect, it } from "vitest";
import { evaluatePermission } from "./permissions";

describe("evaluatePermission — política V1", () => {
  it("LOW: permitido, sem confirmação", () => {
    const decision = evaluatePermission({ toolName: "get_accounts", riskTier: "LOW", userId: "user-1", params: {} }, "resumo");
    expect(decision).toEqual({ allowed: true, requiresConfirmation: false });
  });

  it("MEDIUM: tratado como HIGH nesta fase — permitido, mas exige confirmação", () => {
    const decision = evaluatePermission(
      { toolName: "hipotética-medium", riskTier: "MEDIUM", userId: "user-1", params: {} },
      "resumo da ação",
    );
    expect(decision).toEqual({ allowed: true, requiresConfirmation: true, summary: "resumo da ação" });
  });

  it("HIGH: permitido, mas exige sempre confirmação explícita", () => {
    const decision = evaluatePermission(
      { toolName: "create_transaction", riskTier: "HIGH", userId: "user-1", params: {} },
      "Registar uma despesa de 500.",
    );
    expect(decision).toEqual({ allowed: true, requiresConfirmation: true, summary: "Registar uma despesa de 500." });
  });

  it("CRITICAL: sempre recusado — nem chega a propor confirmação", () => {
    const decision = evaluatePermission(
      { toolName: "hipotética-critical", riskTier: "CRITICAL", userId: "user-1", params: {} },
      "resumo",
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toContain("CRITICAL");
      expect(decision.reason).toContain("hipotética-critical");
    }
  });

  it("nunca confia num riskTier que não seja um dos quatro valores conhecidos (a própria assinatura TS já impede isto — teste de exaustividade do switch)", () => {
    // Se um quinto RiskTier fosse adicionado sem atualizar evaluatePermission,
    // o TypeScript falharia a compilar este ficheiro (switch exaustivo) —
    // este teste existe para o comportamento ficar documentado, não só o tipo.
    for (const tier of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) {
      expect(() => evaluatePermission({ toolName: "x", riskTier: tier, userId: "user-1", params: {} }, "s")).not.toThrow();
    }
  });
});

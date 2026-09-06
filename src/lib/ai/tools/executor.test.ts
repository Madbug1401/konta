import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiTool } from "./types";
import { ToolExecutionError } from "./types";

const getToolMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock("./registry", () => ({ getTool: getToolMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

function fakeTool(overrides: Partial<AiTool<{ value?: string }, unknown>> = {}): AiTool<unknown, unknown> {
  return {
    name: "fake_tool",
    description: "tool de teste",
    paramsSchema: z.object({ value: z.string().optional() }).strict(),
    riskTier: "LOW",
    summarize: () => "resumo de teste",
    execute: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as AiTool<unknown, unknown>;
}

describe("executeTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tool inexistente: devolve not_found e nunca chama execute de nada", async () => {
    getToolMock.mockReturnValue(undefined);
    const { executeTool } = await import("./executor");

    const result = await executeTool("tool_que_nao_existe", "user-1", {});

    expect(result).toEqual({ status: "not_found", toolName: "tool_que_nao_existe" });
  });

  it("params inválidos: devolve invalid_params e nunca chama execute", async () => {
    const execute = vi.fn();
    getToolMock.mockReturnValue(fakeTool({ execute }));
    const { executeTool } = await import("./executor");

    const result = await executeTool("fake_tool", "user-1", { value: 123 }); // devia ser string

    expect(result.status).toBe("invalid_params");
    expect(execute).not.toHaveBeenCalled();
  });

  it("LOW: executa diretamente, sem exigir confirmação", async () => {
    const execute = vi.fn().mockResolvedValue({ data: 42 });
    getToolMock.mockReturnValue(fakeTool({ riskTier: "LOW", execute }));
    const { executeTool } = await import("./executor");

    const result = await executeTool("fake_tool", "user-1", { value: "x" });

    expect(result).toEqual({ status: "executed", toolName: "fake_tool", riskTier: "LOW", result: { data: 42 } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("HIGH: devolve confirmation_required e NUNCA chama execute antes de confirmação", async () => {
    const execute = vi.fn();
    getToolMock.mockReturnValue(fakeTool({ riskTier: "HIGH", summarize: () => "Vou fazer algo importante.", execute }));
    const { executeTool } = await import("./executor");

    const result = await executeTool("fake_tool", "user-1", { value: "x" });

    expect(result).toEqual({
      status: "confirmation_required",
      toolName: "fake_tool",
      riskTier: "HIGH",
      summary: "Vou fazer algo importante.",
      params: { value: "x" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("CRITICAL: nunca executa — devolve rejected imediatamente, nunca confirmation_required", async () => {
    const execute = vi.fn();
    getToolMock.mockReturnValue(fakeTool({ riskTier: "CRITICAL", execute }));
    const { executeTool } = await import("./executor");

    const result = await executeTool("fake_tool", "user-1", { value: "x" });

    expect(result.status).toBe("rejected");
    expect(execute).not.toHaveBeenCalled();
  });

  it("userId é sempre passado explicitamente a execute, nunca lido dos params", async () => {
    const execute = vi.fn().mockResolvedValue({});
    getToolMock.mockReturnValue(fakeTool({ riskTier: "LOW", execute }));
    const { executeTool } = await import("./executor");

    await executeTool("fake_tool", "user-real", { value: "x" });

    expect(execute).toHaveBeenCalledWith("user-real", { value: "x" });
  });

  it("ToolExecutionError lançado por execute vira execution_failed com a mensagem segura da própria tool", async () => {
    const execute = vi.fn().mockRejectedValue(new ToolExecutionError("Conta não encontrada."));
    getToolMock.mockReturnValue(fakeTool({ riskTier: "LOW", execute }));
    const { executeTool } = await import("./executor");

    const result = await executeTool("fake_tool", "user-1", { value: "x" });

    expect(result).toEqual({ status: "execution_failed", toolName: "fake_tool", error: "Conta não encontrada." });
  });

  it("um erro inesperado (não ToolExecutionError) nunca expõe detalhes técnicos — regista no log, devolve mensagem genérica", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    getToolMock.mockReturnValue(fakeTool({ riskTier: "LOW", execute }));
    const { executeTool } = await import("./executor");

    const result = await executeTool("fake_tool", "user-1", { value: "x" });

    expect(result.status).toBe("execution_failed");
    if (result.status === "execution_failed") {
      expect(result.error).not.toContain("10.0.0.5");
      expect(result.error).not.toContain("ECONNREFUSED");
    }
    expect(logErrorMock).toHaveBeenCalledWith("ai.tools.execute", expect.any(Error), { toolName: "fake_tool", userId: "user-1" });
  });
});

describe("executeConfirmedTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tool inexistente: devolve not_found e nunca executa", async () => {
    getToolMock.mockReturnValue(undefined);
    const { executeConfirmedTool } = await import("./executor");

    const result = await executeConfirmedTool("tool_que_nao_existe", "user-1", {});

    expect(result).toEqual({ status: "not_found", toolName: "tool_que_nao_existe" });
  });

  it("HIGH: executa diretamente com os params já validados, sem voltar a pedir confirmação", async () => {
    const execute = vi.fn().mockResolvedValue({ done: true });
    getToolMock.mockReturnValue(fakeTool({ riskTier: "HIGH", execute }));
    const { executeConfirmedTool } = await import("./executor");

    const result = await executeConfirmedTool("fake_tool", "user-1", { value: "x" });

    expect(result).toEqual({ status: "executed", toolName: "fake_tool", riskTier: "HIGH", result: { done: true } });
    expect(execute).toHaveBeenCalledWith("user-1", { value: "x" });
  });

  it("revalida os params contra o paramsSchema atual antes de executar", async () => {
    const execute = vi.fn();
    getToolMock.mockReturnValue(fakeTool({ riskTier: "HIGH", execute }));
    const { executeConfirmedTool } = await import("./executor");

    const result = await executeConfirmedTool("fake_tool", "user-1", { value: 123 }); // devia ser string

    expect(result.status).toBe("invalid_params");
    expect(execute).not.toHaveBeenCalled();
  });

  it("CRITICAL: mesmo via executeConfirmedTool, nunca executa — defesa em profundidade, não confia só em quem chama", async () => {
    const execute = vi.fn();
    getToolMock.mockReturnValue(fakeTool({ riskTier: "CRITICAL", execute }));
    const { executeConfirmedTool } = await import("./executor");

    const result = await executeConfirmedTool("fake_tool", "user-1", { value: "x" });

    expect(result.status).toBe("rejected");
    expect(execute).not.toHaveBeenCalled();
  });
});

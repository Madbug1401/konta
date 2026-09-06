import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

class MockAPIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

// Simula só a forma do SDK de que src/lib/ai/gateway.ts depende: a classe
// por omissão instanciável (com `.messages.create`) e a classe de erro
// estática `Anthropic.APIError`, usada em `instanceof`. Nunca chama a API
// real da Anthropic.
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: createMock };
    static APIError = MockAPIError;
  }
  return { default: MockAnthropic };
});

const ORIGINAL_ENV = process.env.ANTHROPIC_API_KEY;

describe("sendChatTurn", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const { _resetAiClientForTests } = await import("./gateway");
    _resetAiClientForTests();
    if (ORIGINAL_ENV === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV;
  });

  it("lança AiConfigError e nunca chama o SDK quando ANTHROPIC_API_KEY não está definido", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { AiConfigError, sendChatTurn } = await import("./gateway");

    await expect(sendChatTurn({ system: "s", messages: [{ role: "user", content: "Olá" }] })).rejects.toBeInstanceOf(AiConfigError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("texto simples: devolve stopReason end_turn e o bloco de texto", async () => {
    createMock.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Olá! Como posso ajudar?" }],
    });
    const { sendChatTurn } = await import("./gateway");

    const result = await sendChatTurn({ system: "s", messages: [{ role: "user", content: "Olá" }] });

    expect(result).toEqual({ stopReason: "end_turn", content: [{ type: "text", text: "Olá! Como posso ajudar?" }] });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-5", system: "s", messages: [{ role: "user", content: "Olá" }] }),
    );
  });

  it("tool call: devolve stopReason tool_use e o bloco tool_use com id/name/input", async () => {
    createMock.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "Vou verificar." },
        { type: "tool_use", id: "toolu_1", name: "get_accounts", input: {} },
      ],
    });
    const { sendChatTurn } = await import("./gateway");

    const result = await sendChatTurn({
      system: "s",
      messages: [{ role: "user", content: "Quanto tenho?" }],
      tools: [{ name: "get_accounts", description: "lista contas", inputSchema: { type: "object", properties: {} } }],
    });

    expect(result.stopReason).toBe("tool_use");
    expect(result.content).toEqual([
      { type: "text", text: "Vou verificar." },
      { type: "tool_use", id: "toolu_1", name: "get_accounts", input: {} },
    ]);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ name: "get_accounts", description: "lista contas", input_schema: { type: "object", properties: {} } }],
      }),
    );
  });

  it("tool result: aceita um bloco tool_result no histórico de mensagens enviado à Anthropic", async () => {
    createMock.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Tens 25000 CVE." }] });
    const { sendChatTurn } = await import("./gateway");

    await sendChatTurn({
      system: "s",
      messages: [
        { role: "user", content: "Quanto tenho?" },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "get_accounts", input: {} }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_1", content: "[]" }] },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "Quanto tenho?" },
          { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "get_accounts", input: {} }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "[]", is_error: undefined }] },
        ],
      }),
    );
  });

  it("lança AiProviderError quando a Anthropic falha (ex: rate limit, 5xx)", async () => {
    createMock.mockRejectedValueOnce(new MockAPIError("rate limited", 429));
    const { AiProviderError, sendChatTurn } = await import("./gateway");

    await expect(sendChatTurn({ system: "s", messages: [{ role: "user", content: "Olá" }] })).rejects.toBeInstanceOf(AiProviderError);
  });

  it("lança AiProviderError quando a resposta não tem nenhum bloco e o stopReason não é tool_use (malformada/vazia)", async () => {
    createMock.mockResolvedValueOnce({ stop_reason: "end_turn", content: [] });
    const { AiProviderError, sendChatTurn } = await import("./gateway");

    await expect(sendChatTurn({ system: "s", messages: [{ role: "user", content: "Olá" }] })).rejects.toBeInstanceOf(AiProviderError);
  });

  it("uma resposta tool_use sem nenhum texto NÃO é tratada como vazia — só tool_use já é suficiente", async () => {
    createMock.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "toolu_1", name: "get_accounts", input: {} }],
    });
    const { sendChatTurn } = await import("./gateway");

    const result = await sendChatTurn({ system: "s", messages: [{ role: "user", content: "Olá" }] });
    expect(result.stopReason).toBe("tool_use");
  });
});

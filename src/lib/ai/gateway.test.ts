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

describe("sendChatMessage", () => {
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
    const { AiConfigError, sendChatMessage } = await import("./gateway");

    await expect(sendChatMessage("Olá")).rejects.toBeInstanceOf(AiConfigError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("devolve o texto da resposta quando o Claude responde com sucesso", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Olá! Como posso ajudar?" }],
    });
    const { sendChatMessage } = await import("./gateway");

    const reply = await sendChatMessage("Olá");

    expect(reply).toBe("Olá! Como posso ajudar?");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "Olá" }],
      }),
    );
  });

  it("lança AiProviderError quando a Anthropic falha (ex: rate limit, 5xx)", async () => {
    createMock.mockRejectedValueOnce(new MockAPIError("rate limited", 429));
    const { AiProviderError, sendChatMessage } = await import("./gateway");

    await expect(sendChatMessage("Olá")).rejects.toBeInstanceOf(AiProviderError);
  });

  it("lança AiProviderError quando a resposta não tem nenhum bloco de texto (malformada/vazia)", async () => {
    createMock.mockResolvedValueOnce({ content: [] });
    const { AiProviderError, sendChatMessage } = await import("./gateway");

    await expect(sendChatMessage("Olá")).rejects.toBeInstanceOf(AiProviderError);
  });

  it("lança AiProviderError quando o único bloco de texto está vazio", async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "   " }] });
    const { AiProviderError, sendChatMessage } = await import("./gateway");

    await expect(sendChatMessage("Olá")).rejects.toBeInstanceOf(AiProviderError);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const filesUploadMock = vi.fn();
const toFileMock = vi.fn(async (data: unknown, name?: string, options?: { type?: string }) => ({ data, name, type: options?.type }));

class MockAPIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

// Simula só a forma do SDK de que src/lib/ai/gateway.ts depende: a classe
// por omissão instanciável (com `.messages.create`/`.files.upload`), a
// classe de erro estática `Anthropic.APIError`, usada em `instanceof`, e o
// helper `toFile` (Milestone 5a). Nunca chama a API real da Anthropic.
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: createMock };
    files = { upload: filesUploadMock };
    static APIError = MockAPIError;
  }
  return { default: MockAnthropic, toFile: toFileMock };
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

  // [Milestone 5a — Multimodal] Blocos de imagem/documento nunca são
  // produzidos pelo Claude — só enviados a ele; estes testes confirmam que
  // `toAnthropicContent` traduz cada forma de fonte (`file`/`base64`/`text`)
  // exatamente para a forma que o SDK espera.
  it("bloco de imagem com fonte 'file' (Files API): traduz para { type: 'file', file_id }", async () => {
    createMock.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    const { sendChatTurn } = await import("./gateway");

    await sendChatTurn({
      system: "s",
      messages: [{ role: "user", content: [{ type: "image", source: { kind: "file", fileId: "file_abc" } }] }],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: [{ type: "image", source: { type: "file", file_id: "file_abc" } }] }],
      }),
    );
  });

  it("bloco de imagem com fonte 'base64': traduz media_type/data tal e qual", async () => {
    createMock.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    const { sendChatTurn } = await import("./gateway");

    await sendChatTurn({
      system: "s",
      messages: [{ role: "user", content: [{ type: "image", source: { kind: "base64", mediaType: "image/png", data: "QUJD" } }] }],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } }] }],
      }),
    );
  });

  it("bloco de documento com fonte 'text' (TXT/CSV): traduz para { type: 'text', media_type: 'text/plain', data }", async () => {
    createMock.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    const { sendChatTurn } = await import("./gateway");

    await sendChatTurn({
      system: "s",
      messages: [{ role: "user", content: [{ type: "document", source: { kind: "text", data: "a,b,c" }, title: "dados.csv" }] }],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [{ type: "document", source: { type: "text", media_type: "text/plain", data: "a,b,c" }, title: "dados.csv" }],
          },
        ],
      }),
    );
  });

  it("bloco de documento com fonte 'file' (PDF via Files API): traduz para { type: 'file', file_id }", async () => {
    createMock.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    const { sendChatTurn } = await import("./gateway");

    await sendChatTurn({
      system: "s",
      messages: [{ role: "user", content: [{ type: "document", source: { kind: "file", fileId: "file_pdf1" } }] }],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: [{ type: "document", source: { type: "file", file_id: "file_pdf1" }, title: null }] }],
      }),
    );
  });
});

describe("uploadFileToAnthropic", () => {
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

  it("devolve o id do ficheiro carregado, passando expiresInSeconds tal e qual à Files API", async () => {
    filesUploadMock.mockResolvedValueOnce({ id: "file_novo" });
    const { uploadFileToAnthropic } = await import("./gateway");

    const bytes = new Uint8Array([1, 2, 3]);
    const fileId = await uploadFileToAnthropic(bytes, "recibo.jpg", "image/jpeg", 3600);

    expect(fileId).toBe("file_novo");
    expect(toFileMock).toHaveBeenCalledWith(bytes, "recibo.jpg", { type: "image/jpeg" });
    expect(filesUploadMock).toHaveBeenCalledWith(expect.objectContaining({ expires_in_seconds: 3600 }));
  });

  it("lança AiProviderError quando a Files API falha (nunca deixa o erro do SDK escapar tal e qual)", async () => {
    filesUploadMock.mockRejectedValueOnce(new MockAPIError("payload too large", 413));
    const { AiProviderError, uploadFileToAnthropic } = await import("./gateway");

    await expect(uploadFileToAnthropic(new Uint8Array([1]), "x.png", "image/png", 3600)).rejects.toBeInstanceOf(AiProviderError);
  });
});

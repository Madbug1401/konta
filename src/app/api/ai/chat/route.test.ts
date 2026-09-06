import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionUserMock = vi.fn();
const sendChatMessageMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));

// Mantém as classes de erro REAIS (AiConfigError/AiProviderError) — a rota
// faz `instanceof` sobre elas, por isso só substituímos `sendChatMessage`,
// nunca o módulo inteiro. Nunca chama a API real da Anthropic (sendChatMessage
// está sempre mockado).
vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/gateway")>("@/lib/ai/gateway");
  return { ...actual, sendChatMessage: sendChatMessageMock };
});

const SESSION = { userId: "user-1", email: "user1@konta.cv" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/chat", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejeita um pedido sem sessão com 401, sem chamar o gateway", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Olá" }));

    expect(response.status).toBe(401);
    expect(sendChatMessageMock).not.toHaveBeenCalled();
  });

  it("rejeita um corpo inválido (mensagem em falta) com 400, sem chamar o gateway", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);

    const { POST } = await import("./route");
    const response = await POST(postRequest({}));

    expect(response.status).toBe(400);
    expect(sendChatMessageMock).not.toHaveBeenCalled();
  });

  it("rejeita uma mensagem vazia com 400", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "   " }));

    expect(response.status).toBe(400);
    expect(sendChatMessageMock).not.toHaveBeenCalled();
  });

  it("devolve 200 com a resposta do Claude quando tudo corre bem", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    sendChatMessageMock.mockResolvedValue("Olá! Como posso ajudar?");

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Olá" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "Olá! Como posso ajudar?" });
    expect(sendChatMessageMock).toHaveBeenCalledWith("Olá");
  });

  it("nunca aceita/usa um userId vindo do corpo do pedido — vem sempre da sessão", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    sendChatMessageMock.mockResolvedValue("ok");

    const { POST } = await import("./route");
    await POST(postRequest({ message: "Olá", userId: "outro-utilizador" }));

    // sendChatMessage só recebe o texto — nunca um segundo argumento com
    // userId vindo do corpo do pedido.
    expect(sendChatMessageMock).toHaveBeenCalledWith("Olá");
    expect(sendChatMessageMock.mock.calls[0]).toHaveLength(1);
  });

  it("devolve 503 (sem detalhes) quando a configuração está em falta (AiConfigError)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { AiConfigError } = await vi.importActual<typeof import("@/lib/ai/gateway")>("@/lib/ai/gateway");
    sendChatMessageMock.mockRejectedValue(new AiConfigError("ANTHROPIC_API_KEY não está definido."));

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Olá" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("ANTHROPIC_API_KEY");
  });

  it("devolve 502 (sem detalhes internos) quando a Anthropic falha (AiProviderError)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { AiProviderError } = await vi.importActual<typeof import("@/lib/ai/gateway")>("@/lib/ai/gateway");
    sendChatMessageMock.mockRejectedValue(new AiProviderError("Erro ao comunicar com a Anthropic (429): rate limited"));

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Olá" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("429");
    expect(JSON.stringify(body)).not.toContain("rate limited");
  });

  it("nunca regista o texto da mensagem do utilizador nos logs de erro", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { AiProviderError } = await vi.importActual<typeof import("@/lib/ai/gateway")>("@/lib/ai/gateway");
    sendChatMessageMock.mockRejectedValue(new AiProviderError("falhou"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    await POST(postRequest({ message: "informação financeira sensível do utilizador" }));

    const loggedText = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(loggedText).not.toContain("informação financeira sensível");
    consoleErrorSpy.mockRestore();
  });
});

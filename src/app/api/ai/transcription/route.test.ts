import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/rate-limit";

const getSessionUserMock = vi.fn();
const isAiEnabledMock = vi.fn().mockResolvedValue(true);
const transcribeAudioMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/users", () => ({ isAiEnabled: isAiEnabledMock }));
vi.mock("@/lib/ai/transcription", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/transcription")>("@/lib/ai/transcription");
  return { ...actual, transcribeAudio: transcribeAudioMock };
});

const SESSION = { userId: "user-1", email: "user1@konta.cv" };
const WEBM_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);

function postRequest(bytes: Uint8Array<ArrayBuffer>, filename = "gravacao.webm"): Request {
  const form = new FormData();
  form.set("file", new File([bytes], filename));
  return new Request("http://localhost/api/ai/transcription", { method: "POST", body: form });
}

describe("POST /api/ai/transcription", () => {
  afterEach(() => {
    vi.clearAllMocks();
    isAiEnabledMock.mockResolvedValue(true);
    _resetRateLimitState();
  });

  it("rejeita um pedido sem sessão com 401, nunca chama o provider", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));

    expect(response.status).toBe(401);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("bloqueia com 403 quando o acesso ao Konta AI está desativado", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    isAiEnabledMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));

    expect(response.status).toBe(403);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("rejeita um pedido sem ficheiro com 400", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/ai/transcription", { method: "POST", body: new FormData() }));

    expect(response.status).toBe(400);
  });

  it("áudio com formato/conteúdo inválido é rejeitado com 400, nunca chega ao provider", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const response = await POST(postRequest(new Uint8Array([1, 2, 3, 4]) as Uint8Array<ArrayBuffer>));

    expect(response.status).toBe(400);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("upload válido: devolve 200 com o texto transcrito", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    transcribeAudioMock.mockResolvedValue({ text: "Gastei 2500 na Shell.", provider: "groq", durationSeconds: 4 });
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ text: "Gastei 2500 na Shell." });
    expect(transcribeAudioMock).toHaveBeenCalledWith(expect.any(Uint8Array), "audio/webm");
  });

  it("transcrição vazia (silêncio/ruído): devolve 422 com mensagem amigável, nunca um texto vazio como sucesso", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    transcribeAudioMock.mockResolvedValue({ text: "   ", provider: "groq" });
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));

    expect(response.status).toBe(422);
  });

  it("áudio mais longo do que o limite (duração real devolvida pelo provider): rejeitado mesmo já transcrito", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    transcribeAudioMock.mockResolvedValue({ text: "um áudio muito longo...", provider: "groq", durationSeconds: 999 });
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));

    expect(response.status).toBe(400);
  });

  it("falha do provider: devolve 502 sem expor o erro técnico", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { TranscriptionProviderError } = await import("@/lib/ai/transcription");
    transcribeAudioMock.mockRejectedValue(new TranscriptionProviderError("upstream connection reset by peer at 10.0.4.2"));
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("10.0.4.2");
  });

  it("provider não configurado (sem API key): devolve 503, nunca expõe a variável de ambiente em falta", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { TranscriptionConfigError } = await import("@/lib/ai/transcription");
    transcribeAudioMock.mockRejectedValue(new TranscriptionConfigError("SPEECH_TO_TEXT_API_KEY não está definido."));
    const { POST } = await import("./route");

    const response = await POST(postRequest(WEBM_BYTES));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("SPEECH_TO_TEXT_API_KEY");
  });

  it("bloqueia depois do limite de pedidos por utilizador, com Retry-After", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    transcribeAudioMock.mockResolvedValue({ text: "ok", provider: "groq" });
    const { POST } = await import("./route");

    for (let i = 0; i < 20; i++) {
      const response = await POST(postRequest(WEBM_BYTES));
      expect(response.status).toBe(200);
    }
    const blocked = await POST(postRequest(WEBM_BYTES));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("o limite é contado por utilizador — outro utilizador não é afetado", async () => {
    transcribeAudioMock.mockResolvedValue({ text: "ok", provider: "groq" });
    const { POST } = await import("./route");

    getSessionUserMock.mockResolvedValue(SESSION);
    for (let i = 0; i < 20; i++) await POST(postRequest(WEBM_BYTES));

    getSessionUserMock.mockResolvedValue({ userId: "user-2", email: "user2@konta.cv" });
    const response = await POST(postRequest(WEBM_BYTES));

    expect(response.status).toBe(200);
  });
});

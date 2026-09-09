import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptionConfigError, TranscriptionProviderError } from "./types";

const fetchMock = vi.fn();
const ORIGINAL_ENV = process.env.SPEECH_TO_TEXT_API_KEY;

describe("groqSpeechToTextProvider", () => {
  beforeEach(() => {
    process.env.SPEECH_TO_TEXT_API_KEY = "gsk_test_key";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    if (ORIGINAL_ENV === undefined) delete process.env.SPEECH_TO_TEXT_API_KEY;
    else process.env.SPEECH_TO_TEXT_API_KEY = ORIGINAL_ENV;
  });

  it("lança TranscriptionConfigError e nunca chama a Groq quando SPEECH_TO_TEXT_API_KEY não está definido", async () => {
    delete process.env.SPEECH_TO_TEXT_API_KEY;
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    await expect(groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(TranscriptionConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("transcrição com sucesso: devolve texto, idioma e duração, e envia Authorization/model/language corretos", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ text: "Gastei 2500 na Shell.", language: "portuguese", duration: 3.2 }) });
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    const result = await groqSpeechToTextProvider.transcribe(new Uint8Array([1, 2, 3]), "audio/webm");

    expect(result).toEqual({ text: "Gastei 2500 na Shell.", language: "portuguese", durationSeconds: 3.2, provider: "groq" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer gsk_test_key");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("pt");
  });

  it("resposta sem 'duration'/'language': devolve na mesma, sem inventar valores", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ text: "Olá" }) });
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    const result = await groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm");

    expect(result.language).toBeUndefined();
    expect(result.durationSeconds).toBeUndefined();
  });

  it("resposta não-2xx: lança TranscriptionProviderError sem nunca expor o corpo da resposta do provider", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 413, json: async () => ({ error: { message: "detalhe interno sensível da Groq" } }) });
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    try {
      await groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm");
      expect.unreachable("devia ter lançado TranscriptionProviderError");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptionProviderError);
      expect((error as Error).message).not.toContain("detalhe interno sensível");
    }
  });

  it("JSON malformado na resposta: lança TranscriptionProviderError, nunca deixa a exceção do parser escapar", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    await expect(groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(TranscriptionProviderError);
  });

  it("resposta sem campo 'text' (formato inesperado do provider): lança TranscriptionProviderError", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ language: "pt" }) });
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    await expect(groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(TranscriptionProviderError);
  });

  it("timeout (AbortError): lança TranscriptionProviderError com mensagem amigável, nunca a exceção crua", async () => {
    fetchMock.mockImplementation(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    await expect(groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(TranscriptionProviderError);
  });

  it("falha de rede genérica: lança TranscriptionProviderError, nunca a exceção crua do fetch", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: getaddrinfo ENOTFOUND"));
    const { groqSpeechToTextProvider } = await import("./groq-provider");

    await expect(groqSpeechToTextProvider.transcribe(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(TranscriptionProviderError);
  });
});

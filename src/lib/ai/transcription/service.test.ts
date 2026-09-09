import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transcribeMock = vi.fn();

vi.mock("./groq-provider", () => ({ groqSpeechToTextProvider: { name: "groq", transcribe: transcribeMock } }));

const ORIGINAL_ENV = process.env.SPEECH_TO_TEXT_PROVIDER;

describe("transcribeAudio (seleção de provider)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    if (ORIGINAL_ENV === undefined) delete process.env.SPEECH_TO_TEXT_PROVIDER;
    else process.env.SPEECH_TO_TEXT_PROVIDER = ORIGINAL_ENV;
  });

  beforeEach(() => {
    delete process.env.SPEECH_TO_TEXT_PROVIDER;
  });

  it("usa a Groq por omissão, sem SPEECH_TO_TEXT_PROVIDER definido", async () => {
    transcribeMock.mockResolvedValue({ text: "ok", provider: "groq" });
    const { transcribeAudio } = await import("./service");

    const result = await transcribeAudio(new Uint8Array([1]), "audio/webm");

    expect(transcribeMock).toHaveBeenCalledWith(new Uint8Array([1]), "audio/webm");
    expect(result.provider).toBe("groq");
  });

  it("usa a Groq quando SPEECH_TO_TEXT_PROVIDER='groq' explicitamente", async () => {
    process.env.SPEECH_TO_TEXT_PROVIDER = "groq";
    transcribeMock.mockResolvedValue({ text: "ok", provider: "groq" });
    const { transcribeAudio } = await import("./service");

    await transcribeAudio(new Uint8Array([1]), "audio/webm");

    expect(transcribeMock).toHaveBeenCalled();
  });

  it("lança TranscriptionConfigError para um provider desconhecido, nunca chama nenhum provider", async () => {
    process.env.SPEECH_TO_TEXT_PROVIDER = "algum-provider-inexistente";
    const { transcribeAudio } = await import("./service");
    const { TranscriptionConfigError } = await import("./types");

    await expect(transcribeAudio(new Uint8Array([1]), "audio/webm")).rejects.toBeInstanceOf(TranscriptionConfigError);
    expect(transcribeMock).not.toHaveBeenCalled();
  });
});

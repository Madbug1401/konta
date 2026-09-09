// ============================================================================
// KONTA AI — Transcription: provider Groq (Whisper large-v3-turbo).
//
// [DECISÃO — Milestone 5c] Groq, não OpenAI Whisper: endpoint compatível com
// o formato OpenAI (mesmo contrato de multipart), mas com tier gratuito
// generoso e latência muito baixa — alinhado com a filosofia "zero-cost
// beta" já seguida no resto do projeto (Render + Neon free tier, ver
// docs/architecture/DECISIONS.md). Decisão tomada com o utilizador antes de
// implementar esta tool. Só `fetch` — nenhum SDK novo.
//
// Único ficheiro autorizado a falar com a API da Groq — mesma disciplina de
// isolamento de src/lib/ai/gateway.ts para a Anthropic. `service.ts` é quem
// decide QUAL provider usar; este ficheiro só sabe transcrever.
// ============================================================================

import { TranscriptionConfigError, TranscriptionProviderError, type SpeechToTextProvider, type TranscriptionResult } from "./types";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
// Áudio desta V1 é sempre curto (máx. 2 minutos, ver validate.ts) — 20s de
// folga sobre isso é generoso; nunca deixar um pedido pendurado
// indefinidamente se a Groq estiver lenta/indisponível.
const REQUEST_TIMEOUT_MS = 20_000;

interface GroqVerboseJsonResponse {
  text?: string;
  language?: string;
  duration?: number;
}

function filenameForMimeType(mimeType: string): string {
  return mimeType === "audio/mp4" ? "audio.mp4" : "audio.webm";
}

export const groqSpeechToTextProvider: SpeechToTextProvider = {
  name: "groq",

  async transcribe(bytes: Uint8Array, mimeType: string): Promise<TranscriptionResult> {
    const apiKey = process.env.SPEECH_TO_TEXT_API_KEY;
    if (!apiKey) {
      throw new TranscriptionConfigError("SPEECH_TO_TEXT_API_KEY não está definido. Define a chave da Groq em .env antes de usar voz no Konta AI.");
    }

    const form = new FormData();
    // [Nunca bytes soltos] `Blob` embrulha os bytes já validados (ver
    // validate.ts) — nunca os bytes em bruto do pedido original do cliente
    // sem terem passado pela validação de conteúdo primeiro.
    form.set("file", new Blob([bytes as unknown as BlobPart], { type: mimeType }), filenameForMimeType(mimeType));
    form.set("model", GROQ_MODEL);
    form.set("response_format", "verbose_json");
    // [Qualidade em português — secção 3/10 do pedido] O Konta é uma app
    // portuguesa/cabo-verdiana por omissão — dar a dica de idioma ajuda a
    // precisão do Whisper para nomes/números falados em português, sem
    // impedir o utilizador de falar noutra língua (o Whisper continua a
    // tentar transcrever corretamente mesmo com a dica errada).
    form.set("language", "pt");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TranscriptionProviderError("O serviço de transcrição demorou demasiado tempo a responder.");
      }
      throw new TranscriptionProviderError("Não foi possível contactar o serviço de transcrição.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Nunca propaga o corpo da resposta (pode conter detalhes internos do
      // provider) — só o status, que já é seguro de mostrar/registar.
      throw new TranscriptionProviderError(`O serviço de transcrição recusou o pedido (${response.status}).`);
    }

    let data: GroqVerboseJsonResponse;
    try {
      data = (await response.json()) as GroqVerboseJsonResponse;
    } catch {
      throw new TranscriptionProviderError("O serviço de transcrição devolveu uma resposta inválida.");
    }

    if (typeof data.text !== "string") {
      throw new TranscriptionProviderError("O serviço de transcrição devolveu uma resposta inválida.");
    }

    return {
      text: data.text,
      language: typeof data.language === "string" ? data.language : undefined,
      durationSeconds: typeof data.duration === "number" ? data.duration : undefined,
      provider: "groq",
    };
  },
};

// ============================================================================
// KONTA AI — Transcription: seleção de provider (Milestone 5c).
//
// Único ponto que decide QUAL provider usar — nunca espalhado pela
// aplicação. Hoje só a Groq está implementada; `SPEECH_TO_TEXT_PROVIDER`
// existe já preparado para o dia em que houver uma segunda opção, sem
// precisar de tocar em mais nenhum ficheiro (rota de API, hook do
// microfone, etc. só conhecem `transcribeAudio`, nunca um provider
// concreto).
// ============================================================================

import { groqSpeechToTextProvider } from "./groq-provider";
import { TranscriptionConfigError, type SpeechToTextProvider, type TranscriptionResult } from "./types";

function getProvider(): SpeechToTextProvider {
  const name = process.env.SPEECH_TO_TEXT_PROVIDER?.trim().toLowerCase() || "groq";
  if (name === "groq") return groqSpeechToTextProvider;
  throw new TranscriptionConfigError(`Provider de transcrição desconhecido: "${name}".`);
}

export async function transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<TranscriptionResult> {
  const provider = getProvider();
  return provider.transcribe(bytes, mimeType);
}

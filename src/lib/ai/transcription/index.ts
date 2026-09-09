// Superfície pública do módulo de Transcrição — só isto deve ser importado
// por fora de src/lib/ai/transcription/. Mesmo padrão de
// src/lib/ai/attachments/index.ts e src/lib/ai/context/index.ts.
export { transcribeAudio } from "./service";
export { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, validateAudioUpload, type AudioKind, type ValidatedAudio } from "./validate";
export {
  AudioValidationError,
  TranscriptionConfigError,
  TranscriptionProviderError,
  type SpeechToTextProvider,
  type TranscriptionResult,
} from "./types";

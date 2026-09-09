// ============================================================================
// KONTA AI — Transcription: contrato de tipos (Milestone 5c — Voice Input).
//
// Mesmo princípio de isolamento de src/lib/ai/gateway.ts (o único ponto de
// acesso à Anthropic): este módulo é o ÚNICO ponto de acesso a um provider de
// Speech-to-Text. Nenhum outro ficheiro (rota de API, componentes, hooks)
// deve chamar um provider de transcrição diretamente.
//
// [DECISÃO — âmbito] Voz é só uma FORMA DE INPUT — o resultado é sempre
// texto simples, entregue ao mesmo pipeline de chat que já existe
// (POST /api/ai/chat, sendMessage). Nunca cria um "agente de voz", nunca um
// segundo Financial Engine, nunca uma tool específica de voz. Ver
// docs/architecture/OVERVIEW.md, secção "Konta AI Multimodal".
// ============================================================================

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationSeconds?: number;
  confidence?: number;
  provider: string;
}

/**
 * Contrato que qualquer provider de Speech-to-Text tem de cumprir — trocar
 * de provider (ex: Groq → outro) nunca deve exigir alterar a rota de API,
 * o ChatPanel, o AssistantProvider, o orquestrador, ou qualquer tool.
 */
export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(bytes: Uint8Array, mimeType: string): Promise<TranscriptionResult>;
}

export class TranscriptionConfigError extends Error {
  constructor(message = "O serviço de transcrição não está configurado.") {
    super(message);
    this.name = "TranscriptionConfigError";
  }
}

export class TranscriptionProviderError extends Error {
  constructor(message = "Não foi possível transcrever o áudio.") {
    super(message);
    this.name = "TranscriptionProviderError";
  }
}

/** Erro de validação do próprio ficheiro de áudio (nunca do provider) — sempre seguro para mostrar ao cliente. */
export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioValidationError";
  }
}

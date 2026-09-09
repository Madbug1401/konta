// ============================================================================
// KONTA AI — Transcription: validação de áudio (Milestone 5c).
//
// Mesma filosofia do Milestone 5a (src/lib/ai/attachments/validate.ts):
// nunca confiar no MIME/extensão declarados pelo cliente — só a assinatura
// binária real do ficheiro decide o formato. Só os dois formatos que os
// browsers realmente produzem via MediaRecorder são suportados nesta V1
// (WebM/Opus no Chrome/Edge/Firefox/Android, MP4/AAC no Safari/iPhone) —
// nunca "aceitar os 10 formatos que o provider aceita" só porque é possível.
// ============================================================================

import { AudioValidationError } from "./types";

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // ~15 MB — folga generosa para 2 minutos de voz comprimida.
export const MAX_AUDIO_SECONDS = 120; // 2 minutos — limite de custo/duração (secção 5/12 do pedido).

export type AudioKind = "webm" | "mp4";

interface DetectedAudio {
  kind: AudioKind;
  mimeType: string;
}

/**
 * WebM/Matroska começa sempre pelo cabeçalho EBML (`1A 45 DF A3`) — usado
 * pelo Chrome/Edge/Firefox/Android via `MediaRecorder`. MP4/M4A tem a
 * assinatura `ftyp` no offset 4 — usado pelo Safari/iPhone, que não suporta
 * WebM. Nenhum outro formato é aceite nesta V1.
 */
function sniffAudioKind(bytes: Uint8Array): DetectedAudio | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: "webm", mimeType: "audio/webm" };
  }
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { kind: "mp4", mimeType: "audio/mp4" };
  }
  return null;
}

export interface ValidatedAudio {
  kind: AudioKind;
  mimeType: string;
}

export function validateAudioUpload(bytes: Uint8Array): ValidatedAudio {
  if (bytes.length === 0) {
    throw new AudioValidationError("Áudio vazio.");
  }
  if (bytes.length > MAX_AUDIO_BYTES) {
    throw new AudioValidationError("Áudio demasiado grande (máximo 15 MB, cerca de 2 minutos).");
  }

  const detected = sniffAudioKind(bytes);
  if (!detected) {
    throw new AudioValidationError("Formato de áudio não suportado.");
  }
  return detected;
}

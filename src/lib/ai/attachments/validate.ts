// ============================================================================
// KONTA AI — Attachments: validação (Milestone 5a).
//
// [Segurança — secção 8/9/10 do pedido] Nunca confiar no MIME/extensão
// declarados pelo cliente — só o próprio conteúdo do ficheiro (assinatura
// binária) decide o que ele realmente é. Um ficheiro que declare
// "image/png" mas comece com os bytes de um PDF é rejeitado como PNG
// inválido, nunca aceite "porque o cliente disse que sim".
//
// Limites como constantes explícitas (nunca env vars soltas — pedido
// explícito de não introduzir configuração sem necessidade real): mudar um
// limite é uma decisão de código, revista em PR, não uma variável que
// alguém pode esquecer de definir em produção.
// ============================================================================

import type { AiAttachmentKind } from "./types";
import { AttachmentError } from "./types";

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — acima disto a Anthropic já degrada/rejeita.
export const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_PDF_PAGES = 30; // limite de custo/processamento — pedido explícito.
export const MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB — TXT/CSV entram inline no prompt, nunca "o ficheiro todo" sem limite.
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB (folga generosa para ~2min de áudio comprimido)
export const MAX_AUDIO_SECONDS = 120; // 2 minutos — limite de custo de transcrição (Milestone 5c).

interface DetectedType {
  kind: AiAttachmentKind;
  mimeType: string;
}

/**
 * Assinaturas binárias mínimas necessárias para distinguir os formatos
 * suportados — nunca uma dependência nova só para isto (ex: `file-type`):
 * o conjunto de formatos aceites é pequeno e fixo, e cada assinatura é
 * poucos bytes fixos no início do ficheiro.
 */
function sniffBinaryKind(bytes: Uint8Array): DetectedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "image", mimeType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { kind: "image", mimeType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { kind: "image", mimeType: "image/webp" };
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { kind: "image", mimeType: "image/gif" };
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return { kind: "pdf", mimeType: "application/pdf" };
  }
  return null;
}

/**
 * TXT/CSV não têm assinatura binária — a heurística é "parece texto":
 * decodifica em UTF-8 sem erro e não contém bytes nulos (indício forte de
 * conteúdo binário disfarçado de `.txt`/`.csv`).
 */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export interface ValidatedFile {
  kind: AiAttachmentKind;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Valida um ficheiro recebido por upload — tamanho primeiro (barato), depois
 * o conteúdo real (assinatura binária ou heurística de texto). `declaredKind`
 * vem do formulário do cliente (ex: "audio" para uma gravação) só para casos
 * em que o conteúdo não tem assinatura própria (áudio); nunca é usado para
 * decidir o tipo de imagem/PDF/texto — esses são sempre decididos pelo
 * conteúdo.
 */
export function validateUploadedFile(bytes: Uint8Array, declaredKind: string | null): ValidatedFile {
  if (bytes.length === 0) {
    throw new AttachmentError("Ficheiro vazio.");
  }

  const binaryMatch = sniffBinaryKind(bytes);
  if (binaryMatch) {
    const limit = binaryMatch.kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
    if (bytes.length > limit) {
      throw new AttachmentError(
        binaryMatch.kind === "image" ? "Imagem demasiado grande (máximo 8 MB)." : "PDF demasiado grande (máximo 15 MB).",
      );
    }
    return { kind: binaryMatch.kind, mimeType: binaryMatch.mimeType, bytes };
  }

  if (declaredKind === "audio") {
    if (bytes.length > MAX_AUDIO_BYTES) {
      throw new AttachmentError("Áudio demasiado grande (máximo 20 MB).");
    }
    return { kind: "audio", mimeType: "audio/webm", bytes };
  }

  if (looksLikeText(bytes)) {
    if (bytes.length > MAX_TEXT_BYTES) {
      throw new AttachmentError("Ficheiro de texto demasiado grande (máximo 2 MB).");
    }
    const kind: AiAttachmentKind = declaredKind === "csv" ? "csv" : "text";
    return { kind, mimeType: kind === "csv" ? "text/csv" : "text/plain", bytes };
  }

  throw new AttachmentError("Tipo de ficheiro não suportado.");
}

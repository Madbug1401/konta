// ============================================================================
// KONTA AI — Attachments: contrato de tipos (Milestone 5a).
//
// Ver docs/architecture/OVERVIEW.md, secção "Konta AI Multimodal", e o plano
// aprovado para esta funcionalidade. Um `AiAttachment` é sempre o resultado
// JÁ VALIDADO e JÁ PROCESSADO de um upload — nunca bytes em bruto a
// atravessar a arquitetura. Nenhum campo `any`.
//
// [Decisão] Duas formas de conteúdo resolvido, nunca as duas ao mesmo tempo:
// - `fileId` — para imagem/PDF, uma referência à Anthropic Files API (nunca
//   os bytes guardados no nosso servidor além do tempo de upload).
// - `text` — para TXT/CSV (e, no Milestone 5c, a transcrição de áudio): o
//   conteúdo já é texto, nunca precisa de upload a lado nenhum.
// ============================================================================

export const AI_ATTACHMENT_KINDS = ["image", "pdf", "text", "csv", "audio"] as const;
export type AiAttachmentKind = (typeof AI_ATTACHMENT_KINDS)[number];

export type AiAttachmentContent =
  | { form: "file"; fileId: string; mimeType: string }
  | { form: "text"; text: string };

/**
 * Representação interna normalizada de um attachment já aceite — nunca
 * exposta ao cliente tal e qual (a rota de upload devolve só um subconjunto
 * seguro, ver route.ts). `userId` é o que torna `getAttachment` ownership-
 * scoped (mesmo padrão de confirmation-store.ts).
 */
export interface AiAttachment {
  id: string;
  userId: string;
  kind: AiAttachmentKind;
  filename: string;
  sizeBytes: number;
  content: AiAttachmentContent;
  createdAt: number;
  expiresAt: number;
}

/** Forma mínima e segura devolvida ao cliente após um upload — nunca `fileId`/`text`. */
export interface AiAttachmentSummary {
  attachmentId: string;
  kind: AiAttachmentKind;
  filename: string;
  sizeBytes: number;
}

export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentError";
  }
}

// ============================================================================
// KONTA AI — Multimodal Input Context (Milestone 5a).
//
// Separado de propósito do Financial Context Builder (src/lib/ai/context/) —
// ver docs/architecture/OVERVIEW.md, secção "Konta AI Multimodal": o
// Context Builder continua responsável só por contas/transações/dívidas/
// metas; este ficheiro só resolve os attachments de UMA mensagem para os
// blocos que o Gateway sabe enviar ao Claude. O Orchestrator combina os
// dois, cada um na sua mensagem.
//
// [Segurança — prompt injection via ficheiro] O conteúdo de um attachment
// de texto (TXT/CSV) nunca entra livre no prompt — fica envolvido em
// delimitadores explícitos, para o Claude ter um sinal estrutural de que
// aquilo é DADO do utilizador a analisar, nunca uma instrução do sistema
// (reforça a regra já explícita na Personality Layer, ver personality.ts).
// ============================================================================

import { getAttachment, AttachmentError, type AiAttachment } from "@/lib/ai/attachments";
import type { ChatDocumentBlock, ChatImageBlock } from "@/lib/ai/gateway";

function wrapUntrustedText(text: string): string {
  return `<dados_de_ficheiro_do_utilizador>\n${text}\n</dados_de_ficheiro_do_utilizador>`;
}

function attachmentToBlock(attachment: AiAttachment): ChatImageBlock | ChatDocumentBlock | null {
  if (attachment.kind === "image") {
    if (attachment.content.form !== "file") throw new AttachmentError("Anexo de imagem inválido.");
    return { type: "image", source: { kind: "file", fileId: attachment.content.fileId } };
  }
  if (attachment.kind === "pdf") {
    if (attachment.content.form !== "file") throw new AttachmentError("Anexo de PDF inválido.");
    return { type: "document", source: { kind: "file", fileId: attachment.content.fileId }, title: attachment.filename };
  }
  if (attachment.kind === "text" || attachment.kind === "csv") {
    if (attachment.content.form !== "text") throw new AttachmentError("Anexo de texto inválido.");
    return { type: "document", source: { kind: "text", data: wrapUntrustedText(attachment.content.text) }, title: attachment.filename };
  }
  // "audio" nunca vira um bloco — a transcrição (Milestone 5c) entra como
  // texto simples na própria mensagem, ver resolveAttachmentsForMessage.
  return null;
}

export interface ResolvedAttachments {
  blocks: (ChatImageBlock | ChatDocumentBlock)[];
  transcribedTexts: string[];
}

/**
 * Resolve os `attachmentIds` de UMA mensagem (ownership-scoped por
 * `userId`) para blocos prontos a anexar ao Gateway. Lança `AttachmentError`
 * (nunca uma exceção genérica) se algum id não existir, tiver expirado, ou
 * pertencer a outro utilizador — sempre a mesma mensagem genérica, nunca
 * distinguível de fora (mesmo princípio anti-enumeração do resto da app).
 */
export function resolveAttachmentsForMessage(userId: string, attachmentIds: string[]): ResolvedAttachments {
  const blocks: (ChatImageBlock | ChatDocumentBlock)[] = [];
  const transcribedTexts: string[] = [];

  for (const id of attachmentIds) {
    const attachment = getAttachment(id, userId);
    if (!attachment) {
      throw new AttachmentError("Um dos anexos não foi encontrado ou já expirou. Tenta enviar de novo.");
    }
    if (attachment.kind === "audio") {
      if (attachment.content.form !== "text") throw new AttachmentError("Anexo de áudio inválido.");
      transcribedTexts.push(attachment.content.text);
      continue;
    }
    const block = attachmentToBlock(attachment);
    if (block) blocks.push(block);
  }

  return { blocks, transcribedTexts };
}

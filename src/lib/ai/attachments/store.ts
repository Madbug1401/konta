// ============================================================================
// KONTA AI — Attachment Store (Milestone 5a).
//
// Mesmo padrão de src/lib/ai/tools/confirmation-store.ts: `Map` em memória,
// nunca persistido no Postgres — a conversa do Konta AI já é 100% efémera
// (perdida a um refresh, ver AssistantProvider), por isso um attachment não
// deve viver mais tempo do que ela. TTL curto, limpeza periódica, acesso
// sempre ownership-scoped (userId errado devolve o mesmo "not found"
// genérico de um id inexistente — nunca confirma que um attachment pertence
// a outra pessoa).
// ============================================================================

import { randomBytes } from "node:crypto";
import type { AiAttachment, AiAttachmentContent, AiAttachmentKind } from "./types";

const ATTACHMENT_TTL_MS = 30 * 60 * 1000; // 30 minutos — tempo de sobra para uma conversa real, nunca "para sempre".
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Prazo de expiração pedido à Anthropic Files API ao carregar uma
 * imagem/PDF (ver gateway.ts::uploadFileToAnthropic) — 3600s é o MÍNIMO
 * aceite pela própria API (não escolhido por nós). É maior que
 * `ATTACHMENT_TTL_MS` de propósito: o que decide se um attachment ainda
 * pode ser usado é sempre este store (mais restritivo), nunca o prazo do
 * lado da Anthropic — este último é só uma rede de segurança extra para o
 * ficheiro não ficar acessível indefinidamente do lado deles também.
 */
export const ANTHROPIC_FILE_EXPIRES_IN_SECONDS = 3600;

const store = new Map<string, AiAttachment>();
let lastCleanup = 0;

function cleanupExpired(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [id, attachment] of store) {
    if (attachment.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export interface CreateAttachmentInput {
  userId: string;
  kind: AiAttachmentKind;
  filename: string;
  sizeBytes: number;
  content: AiAttachmentContent;
}

export function createAttachment(input: CreateAttachmentInput, now: number = Date.now()): AiAttachment {
  cleanupExpired(now);
  const attachment: AiAttachment = {
    id: randomBytes(16).toString("base64url"),
    userId: input.userId,
    kind: input.kind,
    filename: input.filename,
    sizeBytes: input.sizeBytes,
    content: input.content,
    createdAt: now,
    expiresAt: now + ATTACHMENT_TTL_MS,
  };
  store.set(attachment.id, attachment);
  return attachment;
}

/** Ownership-scoped: `userId` errado ou id inexistente/expirado devolvem sempre `undefined` — nunca distinguível de fora. */
export function getAttachment(id: string, userId: string, now: number = Date.now()): AiAttachment | undefined {
  const attachment = store.get(id);
  if (!attachment) return undefined;
  if (attachment.userId !== userId) return undefined;
  if (attachment.expiresAt <= now) {
    store.delete(id);
    return undefined;
  }
  return attachment;
}

/** Só para os testes: limpa todo o estado entre casos de teste. */
export function _resetAttachmentStoreForTests(): void {
  store.clear();
  lastCleanup = 0;
}

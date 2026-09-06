// ============================================================================
// KONTA AI — Confirmation Store (Milestone 4).
//
// Corrige a limitação identificada no relatório do Milestone 3:
// `executeTool(..., { confirmed: true })` confiava num boolean enviado pelo
// chamador e reenviava os `params` — nada impedia (ao nível desta camada)
// que os parâmetros mudassem entre a proposta e a confirmação.
//
// [DECISÃO] Token opaco + estado 100% server-side, em vez de um token
// assinado (JWT-like). Um token assinado prova autenticidade sem o servidor
// guardar estado — útil quando o verificador não é quem emitiu o token. Aqui
// isso não se aplica: o mesmo processo que cria a confirmação é quem a
// consome, por isso já vamos guardar o estado real (params validados,
// utilizador, expiração, se já foi consumida) OU NÃO CONSEGUIMOS impedir
// reutilização/adulteração de qualquer forma — um token assinado sozinho não
// resolve isso (não é "stateless" que se precisa aqui, é "single-use" e
// "vinculado aos params exatos"). Um token aleatório de 256 bits, usado como
// chave de um Map server-side com esse estado completo, dá exatamente as
// garantias pedidas (vinculado ao utilizador, aos params exatos, expira, é
// consumido uma única vez) sem precisar de HMAC nem de um segredo novo.
//
// [DECISÃO] Em memória (Map), não persistido na base de dados — mesmo
// princípio já usado em src/lib/rate-limit.ts: para a escala desta Beta
// (uma instância, poucos utilizadores), isto é suficiente, e uma confirmação
// pendente é precisamente o tipo de dado que NÃO deve sobreviver a um
// restart do processo nem ficar guardado para sempre (TTL curto, nunca
// escrita no schema do Prisma). Ver DECISIONS.md — mesma filosofia do
// rate-limit.
//
// NUNCA guardar aqui o texto livre da mensagem do utilizador nem qualquer
// dado além do estrito necessário para re-executar a(s) tool(s) propostas.
// ============================================================================

import { randomBytes } from "node:crypto";

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutos — tempo razoável para ler e decidir, nunca "para sempre".
const CLEANUP_INTERVAL_MS = 60_000;

export interface PendingToolCall {
  toolUseId: string;
  toolName: string;
  /** Já validados pelo paramsSchema da tool no momento da proposta — nunca reconstruídos a partir de um novo input do cliente. */
  params: unknown;
}

export type ConfirmationStatus = "pending" | "consumed" | "cancelled";

export interface PendingConfirmation {
  token: string;
  userId: string;
  toolCalls: PendingToolCall[];
  summary: string;
  /**
   * Histórico de mensagens (tipos próprios do Gateway, nunca do SDK — ver
   * src/lib/ai/gateway.ts) até e incluindo o turno do assistant que pediu
   * a(s) tool(s), mais quantos "rounds" de tool-calling já foram consumidos
   * nesta troca — para o limite MAX_TOOL_ROUNDS continuar a valer depois de
   * retomar. Opaco a este módulo (nunca inspecionado aqui).
   */
  conversationSnapshot: unknown;
  roundsUsed: number;
  createdAt: number;
  expiresAt: number;
  status: ConfirmationStatus;
}

const store = new Map<string, PendingConfirmation>();
let lastCleanup = 0;

function cleanupExpired(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [token, confirmation] of store) {
    if (confirmation.status !== "pending" || confirmation.expiresAt <= now) {
      store.delete(token);
    }
  }
}

export interface CreateConfirmationInput {
  userId: string;
  toolCalls: PendingToolCall[];
  summary: string;
  conversationSnapshot: unknown;
  roundsUsed: number;
}

export function createConfirmation(input: CreateConfirmationInput, now: number = Date.now()): PendingConfirmation {
  cleanupExpired(now);
  const token = randomBytes(32).toString("base64url");
  const confirmation: PendingConfirmation = {
    token,
    userId: input.userId,
    toolCalls: input.toolCalls,
    summary: input.summary,
    conversationSnapshot: input.conversationSnapshot,
    roundsUsed: input.roundsUsed,
    createdAt: now,
    expiresAt: now + CONFIRMATION_TTL_MS,
    status: "pending",
  };
  store.set(token, confirmation);
  return confirmation;
}

// [Segurança] "wrong_user" não é um motivo distinto de propósito — um token
// de outro utilizador devolve exatamente "not_found", nunca confirma a quem
// pergunta que um token pertence a outra pessoa (mesmo princípio anti-
// enumeração já usado em toda a app, ex: 404 genérico para ids de outro
// utilizador em src/lib/db/*.ts).
export type ConsumeFailureReason = "not_found" | "expired" | "already_used";

export type ConsumeResult = { ok: true; confirmation: PendingConfirmation } | { ok: false; reason: ConsumeFailureReason };

/**
 * Consome (marca "consumed") uma confirmação pendente — nunca devolve a
 * mesma confirmação duas vezes com sucesso. `userId` tem de bater
 * exatamente com quem a criou; caso contrário devolve o mesmo "not_found"
 * genérico de um token inexistente (nunca confirma para quem está a tentar
 * se um token pertence a outra pessoa).
 */
export function consumeConfirmation(token: string, userId: string, now: number = Date.now()): ConsumeResult {
  // [Correção] `cleanupExpired` é uma limpeza periódica de fundo — não pode
  // correr ANTES de examinarmos o token pedido, senão apaga-o antes de
  // percebermos que estava "expired" e devolvemos "not_found" em vez disso
  // (confuso para um utilizador real, cujo próprio token expirou — não é o
  // mesmo caso de segurança de "token de outro utilizador"). A limpeza de
  // fundo só corre em createConfirmation.
  const confirmation = store.get(token);
  if (!confirmation) return { ok: false, reason: "not_found" };
  if (confirmation.userId !== userId) return { ok: false, reason: "not_found" };
  if (confirmation.status !== "pending") return { ok: false, reason: "already_used" };
  if (confirmation.expiresAt <= now) {
    store.delete(token);
    return { ok: false, reason: "expired" };
  }
  confirmation.status = "consumed";
  return { ok: true, confirmation };
}

export type CancelResult = { ok: true } | { ok: false; reason: ConsumeFailureReason };

export function cancelConfirmation(token: string, userId: string, now: number = Date.now()): CancelResult {
  // Ver comentário equivalente em consumeConfirmation — a limpeza de fundo
  // não pode correr antes de examinarmos este token específico.
  const confirmation = store.get(token);
  if (!confirmation) return { ok: false, reason: "not_found" };
  if (confirmation.userId !== userId) return { ok: false, reason: "not_found" };
  if (confirmation.status !== "pending") return { ok: false, reason: "already_used" };
  if (confirmation.expiresAt <= now) {
    store.delete(token);
    return { ok: false, reason: "expired" };
  }
  confirmation.status = "cancelled";
  return { ok: true };
}

/** Só para os testes: limpa todo o estado entre casos de teste. */
export function _resetConfirmationStoreForTests(): void {
  store.clear();
  lastCleanup = 0;
}

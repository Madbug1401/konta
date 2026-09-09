// ============================================================================
// KONTA AI — Chat Orchestrator (Milestone 4).
//
// Único ficheiro que decide QUANTAS vezes chamar o Claude e QUANDO parar —
// o Gateway (src/lib/ai/gateway.ts) só sabe fazer uma chamada de cada vez.
//
// Fluxo (ver docs/konta-ai-design.html, secção D, e o pedido do milestone):
//   Context Builder → system prompt → Claude → (texto final) OU (tool_use)
//     → Tool Registry/Executor → LOW executa já; HIGH/MEDIUM pausa aqui
//       (nunca executa) e devolve confirmation_required com um token opaco
//     → tool_result → Claude de novo → ... até MAX_TOOL_ROUNDS.
//
// [Isolamento] Não importa `@anthropic-ai/sdk` — só os tipos próprios do
// Gateway (ChatMessage/ChatAssistantBlock/...) e o Tool Registry.
//
// [Milestone 5b — confirmação agrupada] Os blocos tool_use de um turno são
// TODOS avaliados (nunca se para no primeiro que precise de confirmação —
// política antiga do Milestone 4, substituída aqui). LOW/MEDIUM-sem-
// confirmação executam já; todos os que exigirem confirmação (tipicamente
// N chamadas a `create_transaction`, uma por transação extraída de um
// attachment) entram juntos numa ÚNICA `PendingConfirmation` — "tudo ou
// nada" ao nível do GRUPO na decisão do utilizador (confirmar/cancelar),
// mas cada ação executa e é reportada de forma independente (ver
// `confirmPendingAction`): uma falha numa nunca esconde nem desfaz o
// sucesso de outra, e nunca se finge uma atomicidade que o executor não
// tem. Isto substitui o mecanismo anterior de "uma tool 'trigger' executa,
// as outras do mesmo turno ficam bloqueadas e têm de ser pedidas outra vez"
// — mais simples e corresponde ao que o utilizador realmente vê no ecrã
// (uma lista, um Confirmar).
// ============================================================================

import { logError } from "@/lib/logger";
import { AttachmentError } from "@/lib/ai/attachments";
import { buildAiContext, type ContextMode } from "@/lib/ai/context";
import {
  AiConfigError,
  AiProviderError,
  sendChatTurn,
  type ChatAssistantBlock,
  type ChatMessage,
  type ChatToolResultBlock,
  type ChatToolUseBlock,
  type ChatUserBlock,
} from "@/lib/ai/gateway";
import { resolveAttachmentsForMessage } from "./attachments";
import {
  consumeConfirmation,
  cancelConfirmation,
  createConfirmation,
  executeConfirmedTool,
  executeTool,
  getAnthropicToolDefinitions,
  type PendingToolCall,
  type RiskTier,
  type ToolExecutionResult,
} from "@/lib/ai/tools";
import { renderContextForPrompt } from "./context-presentation";
import { buildSystemPrompt } from "./personality";
import type { ChatHistoryTurn, ChatOutcome } from "./types";

/** `runLoop`/`sendMessage`/`confirmPendingAction` nunca produzem "cancelled" — só `cancelPendingAction` o faz. Excluído aqui para o TypeScript confirmar isso, não só um comentário. */
type NonCancelledOutcome = Exclude<ChatOutcome, { type: "cancelled" }>;

const MAX_TOOL_ROUNDS = 5;

interface ConversationSnapshot {
  system: string;
  messages: ChatMessage[];
  // [Milestone 5b] Resultados de blocos do MESMO turno que já executaram
  // (LOW, ou HIGH/MEDIUM sem confirmação pendente) antes de encontrarmos os
  // que precisam de confirmação — nunca perdidos nem reexecutados ao
  // retomar; combinados com os resultados da confirmação para responder a
  // TODOS os tool_use do turno original de uma só vez (exigência da API:
  // um tool_use sem tool_result correspondente bloqueia a conversa).
  preResolvedResults: ChatToolResultBlock[];
}

async function buildSystemForUser(userId: string, mode: ContextMode): Promise<string> {
  const context = await buildAiContext(userId, mode === "full" ? { mode: "full" } : { mode: "light" });
  return buildSystemPrompt(renderContextForPrompt(context));
}

function historyToMessages(history: ChatHistoryTurn[] | undefined): ChatMessage[] {
  return (history ?? []).map((turn) => ({ role: turn.role, content: turn.content }));
}

/**
 * `evaluation` nunca deve ser "confirmation_required" aqui — quem chama isto
 * (evaluateToolUseBlocks, confirmPendingAction) já tratou esse caso antes de
 * chegar aqui. O `Exclude` obriga o TypeScript a confirmar isso: se algum
 * dia esta função for chamada com esse status por engano, o compilador
 * falha em vez de produzir um tool_result sem sentido.
 */
function toToolResultBlock(toolUseId: string, evaluation: Exclude<ToolExecutionResult, { status: "confirmation_required" }>): ChatToolResultBlock {
  if (evaluation.status === "executed") {
    return { type: "tool_result", toolUseId, content: JSON.stringify(evaluation.result) };
  }
  const message =
    evaluation.status === "not_found"
      ? `A ferramenta "${evaluation.toolName}" não existe.`
      : evaluation.status === "invalid_params"
        ? `Parâmetros inválidos: ${evaluation.error}`
        : evaluation.status === "rejected"
          ? evaluation.reason
          : evaluation.error; // execution_failed
  return { type: "tool_result", toolUseId, content: message, isError: true };
}

/** Um bloco do turno que a Permission Layer marcou como precisando de confirmação — ainda NUNCA executado. */
interface PendingBlock {
  toolUseId: string;
  toolName: string;
  params: unknown;
  summary: string;
  riskTier: RiskTier;
}

type BatchEvaluation =
  | { kind: "resolved"; results: ChatToolResultBlock[] }
  | { kind: "confirmation_required"; pending: PendingBlock[]; preResolvedResults: ChatToolResultBlock[] };

/**
 * [Milestone 5b] Avalia TODOS os tool_use de um turno — nunca para no
 * primeiro que precisar de confirmação. `executeTool` para um bloco
 * HIGH/MEDIUM nunca executa nada (só valida e verifica permissão), por isso
 * é sempre seguro continuar a avaliar os restantes mesmo sabendo que um já
 * vai ficar pendente.
 */
async function evaluateToolUseBlocks(userId: string, blocks: ChatToolUseBlock[]): Promise<BatchEvaluation> {
  const resolvedResults: ChatToolResultBlock[] = [];
  const pending: PendingBlock[] = [];

  for (const block of blocks) {
    const evaluation = await executeTool(block.name, userId, block.input);
    if (evaluation.status === "confirmation_required") {
      pending.push({ toolUseId: block.id, toolName: block.name, params: evaluation.params, summary: evaluation.summary, riskTier: evaluation.riskTier });
      continue;
    }
    resolvedResults.push(toToolResultBlock(block.id, evaluation));
  }

  if (pending.length === 0) return { kind: "resolved", results: resolvedResults };
  return { kind: "confirmation_required", pending, preResolvedResults: resolvedResults };
}

/** Resume o texto de confirmação de um grupo — uma linha simples para 1 ação (igual ao comportamento anterior), lista numerada para várias. */
function buildGroupedSummary(pending: PendingBlock[]): string {
  if (pending.length === 1) return pending[0].summary;
  const lines = pending.map((p, i) => `${i + 1}. ${p.summary}`);
  return `Encontrei ${pending.length} ações a confirmar:\n${lines.join("\n")}`;
}

/** HIGH é sempre o mais severo entre as tools desta V1 (MEDIUM nunca é usado) — mas calculado, nunca assumido. */
function highestRiskTier(pending: PendingBlock[]): RiskTier {
  return pending.some((p) => p.riskTier === "HIGH") ? "HIGH" : pending[0].riskTier;
}

interface RunLoopParams {
  userId: string;
  system: string;
  messages: ChatMessage[];
  roundsUsed: number;
}

async function runLoop({ userId, system, messages, roundsUsed }: RunLoopParams): Promise<NonCancelledOutcome> {
  const tools = getAnthropicToolDefinitions();
  let rounds = roundsUsed;
  let currentMessages = messages;

  for (;;) {
    if (rounds >= MAX_TOOL_ROUNDS) {
      return {
        type: "final",
        reply: "Isto tornou-se complexo demais para eu resolver de uma vez — tenta dividir o pedido em passos mais simples.",
      };
    }

    let turn;
    try {
      turn = await sendChatTurn({ system, messages: currentMessages, tools });
    } catch (error) {
      if (error instanceof AiConfigError || error instanceof AiProviderError) {
        logError("ai.chat.orchestrator", error, { userId });
        return { type: "error", message: "O assistente não está disponível de momento. Tenta novamente." };
      }
      throw error;
    }

    const toolUseBlocks = turn.content.filter((b): b is ChatToolUseBlock => b.type === "tool_use");
    if (toolUseBlocks.length === 0) {
      const text = turn.content
        .filter((b): b is Extract<ChatAssistantBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { type: "final", reply: text.length > 0 ? text : "Não tenho uma resposta para isso agora." };
    }

    rounds += 1;
    const nextMessages: ChatMessage[] = [...currentMessages, { role: "assistant", content: turn.content }];

    const evaluation = await evaluateToolUseBlocks(userId, toolUseBlocks);

    if (evaluation.kind === "confirmation_required") {
      const toolCalls: PendingToolCall[] = evaluation.pending.map((p) => ({
        toolUseId: p.toolUseId,
        toolName: p.toolName,
        params: p.params,
      }));
      const summary = buildGroupedSummary(evaluation.pending);
      const snapshot: ConversationSnapshot = { system, messages: nextMessages, preResolvedResults: evaluation.preResolvedResults };
      const confirmation = createConfirmation({
        userId,
        toolCalls,
        summary,
        conversationSnapshot: snapshot,
        roundsUsed: rounds,
      });
      return {
        type: "confirmation_required",
        confirmationToken: confirmation.token,
        summary,
        riskTier: highestRiskTier(evaluation.pending),
      };
    }

    currentMessages = [...nextMessages, { role: "user", content: evaluation.results }];
  }
}

export interface SendMessageInput {
  userId: string;
  message: string;
  /** [Milestone 5a — Multimodal] Ids já resolvidos por POST /api/ai/attachments — nunca bytes/attachments em bruto neste input. */
  attachmentIds?: string[];
  history?: ChatHistoryTurn[];
}

/**
 * [Milestone 5a — Multimodal] Constrói o conteúdo da última mensagem do
 * utilizador. Sem attachments, mantém exatamente o comportamento anterior
 * (uma string simples — nunca um array de blocos só para uma mensagem de
 * texto). Com attachments: texto (se houver) + imagem/documento resolvidos;
 * uma transcrição de áudio (Milestone 5c) entra como texto simples, nunca
 * como bloco — por isso pode acabar por não precisar de nenhum bloco e
 * continuar uma string simples também.
 */
function buildUserMessageContent(userId: string, message: string, attachmentIds: string[] | undefined): string | ChatUserBlock[] {
  if (!attachmentIds || attachmentIds.length === 0) return message;

  const { blocks, transcribedTexts } = resolveAttachmentsForMessage(userId, attachmentIds);
  const text = [message, ...transcribedTexts].filter((part) => part.trim().length > 0).join("\n\n");

  if (blocks.length === 0) return text;

  const content: ChatUserBlock[] = [];
  if (text.length > 0) content.push({ type: "text", text });
  content.push(...blocks);
  return content;
}

export async function sendMessage(input: SendMessageInput): Promise<NonCancelledOutcome> {
  let system: string;
  try {
    system = await buildSystemForUser(input.userId, "light");
  } catch (error) {
    logError("ai.chat.context", error, { userId: input.userId });
    return { type: "error", message: "Não foi possível carregar os teus dados financeiros agora. Tenta novamente." };
  }

  let content: string | ChatUserBlock[];
  try {
    content = buildUserMessageContent(input.userId, input.message, input.attachmentIds);
  } catch (error) {
    if (error instanceof AttachmentError) {
      return { type: "error", message: error.message };
    }
    throw error;
  }
  if (content.length === 0) {
    return { type: "error", message: "Escreve uma mensagem ou anexa pelo menos um ficheiro." };
  }

  const messages: ChatMessage[] = [...historyToMessages(input.history), { role: "user", content }];
  return runLoop({ userId: input.userId, system, messages, roundsUsed: 0 });
}

export async function confirmPendingAction(userId: string, confirmationToken: string): Promise<NonCancelledOutcome> {
  const consumed = consumeConfirmation(confirmationToken, userId);
  if (!consumed.ok) {
    return { type: "error", message: mapConfirmationFailure(consumed.reason) };
  }
  const { confirmation } = consumed;
  const snapshot = confirmation.conversationSnapshot as ConversationSnapshot;

  // [Milestone 5b — confirmação agrupada, sem atomicidade fictícia] TODAS as
  // ações congeladas nesta confirmação executam — sequencialmente, cada uma
  // com o resultado (sucesso ou falha) que realmente teve. Nenhuma ordem
  // "trigger primeiro" é precisa: o utilizador confirmou o GRUPO inteiro tal
  // como lhe foi mostrado, não uma ação em particular. Uma falha numa NUNCA
  // impede as outras de executar, nunca é escondida, e nunca é apresentada
  // como sucesso — o Claude vê o resultado real de cada uma (via
  // `toToolResultBlock`, que já marca `isError` corretamente) e reporta-o ao
  // utilizador no próximo turno (ex: "3 adicionadas, 1 falhou"). O Executor
  // (`executeConfirmedTool`) não muda: continua a revalidar cada schema e a
  // recusar sempre CRITICAL, chamado aqui uma vez por ação, nunca em lote.
  const confirmedResults: ChatToolResultBlock[] = [];
  for (const call of confirmation.toolCalls) {
    const evaluation = await executeConfirmedTool(call.toolName, userId, call.params);
    confirmedResults.push(
      evaluation.status === "confirmation_required"
        ? { type: "tool_result", toolUseId: call.toolUseId, content: "Esta ação não pôde ser confirmada.", isError: true } // executeConfirmedTool nunca devolve isto de facto — defesa
        : toToolResultBlock(call.toolUseId, evaluation),
    );
  }

  const nextMessages: ChatMessage[] = [...snapshot.messages, { role: "user", content: [...snapshot.preResolvedResults, ...confirmedResults] }];
  return runLoop({ userId, system: snapshot.system, messages: nextMessages, roundsUsed: confirmation.roundsUsed });
}

export function cancelPendingAction(userId: string, confirmationToken: string): ChatOutcome {
  const result = cancelConfirmation(confirmationToken, userId);
  if (!result.ok) {
    return { type: "error", message: mapConfirmationFailure(result.reason) };
  }
  return { type: "cancelled" };
}

function mapConfirmationFailure(reason: "not_found" | "expired" | "already_used"): string {
  if (reason === "expired") return "Esta confirmação expirou. Pede a ação outra vez.";
  if (reason === "already_used") return "Esta confirmação já foi usada.";
  return "Confirmação inválida.";
}

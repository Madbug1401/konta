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
// [Política V1 sobre múltiplas tools no mesmo turno — documentada, não
// escondida] Os blocos tool_use de um turno são avaliados SEQUENCIALMENTE.
// Ao encontrar o primeiro que exige confirmação, a avaliação para aí — os
// blocos seguintes só são avaliados depois de confirmado. Se, ao retomar,
// outro bloco também exigir confirmação, a conversa termina com um erro
// claro em vez de encadear confirmações silenciosamente. Isto cobre bem o
// caso comum (uma ação de escrita de cada vez, que é o que o Personality
// Prompt já incentiva) sem a complexidade de um mecanismo de confirmações
// múltiplas em fila — considerado fora de âmbito para esta primeira
// experiência real.
// ============================================================================

import { logError } from "@/lib/logger";
import { buildAiContext, type ContextMode } from "@/lib/ai/context";
import {
  AiConfigError,
  AiProviderError,
  sendChatTurn,
  type ChatAssistantBlock,
  type ChatMessage,
  type ChatToolResultBlock,
  type ChatToolUseBlock,
} from "@/lib/ai/gateway";
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
  triggerToolUseId: string;
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

/**
 * Usado quando um SEGUNDO bloco do mesmo turno também exigia confirmação
 * (ver política V1 no topo do ficheiro). Nunca executa essa segunda ação —
 * devolve um tool_result de erro para o Claude poder explicar a situação ao
 * utilizador em vez de a conversa terminar com um erro genérico.
 */
function toBlockedByConfirmationResult(toolUseId: string): ChatToolResultBlock {
  return {
    type: "tool_result",
    toolUseId,
    content: "Esta ação também precisa de confirmação explícita, em separado — ainda não foi executada.",
    isError: true,
  };
}

type BatchEvaluation =
  | { kind: "resolved"; results: ChatToolResultBlock[] }
  | { kind: "confirmation_required"; triggerToolUseId: string; summary: string; riskTier: RiskTier };

/** Avalia os tool_use de um turno, um a um, parando no primeiro que exigir confirmação (ver política V1 no topo do ficheiro). */
async function evaluateToolUseBlocks(userId: string, blocks: ChatToolUseBlock[]): Promise<BatchEvaluation> {
  const results: ChatToolResultBlock[] = [];
  for (const block of blocks) {
    const evaluation = await executeTool(block.name, userId, block.input);
    if (evaluation.status === "confirmation_required") {
      return { kind: "confirmation_required", triggerToolUseId: block.id, summary: evaluation.summary, riskTier: evaluation.riskTier };
    }
    results.push(toToolResultBlock(block.id, evaluation));
  }
  return { kind: "resolved", results };
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
      const toolCalls: PendingToolCall[] = toolUseBlocks.map((block) => ({
        toolUseId: block.id,
        toolName: block.name,
        params: block.input,
      }));
      const snapshot: ConversationSnapshot = { system, messages: nextMessages, triggerToolUseId: evaluation.triggerToolUseId };
      const confirmation = createConfirmation({
        userId,
        toolCalls,
        summary: evaluation.summary,
        conversationSnapshot: snapshot,
        roundsUsed: rounds,
      });
      return {
        type: "confirmation_required",
        confirmationToken: confirmation.token,
        summary: evaluation.summary,
        riskTier: evaluation.riskTier,
      };
    }

    currentMessages = [...nextMessages, { role: "user", content: evaluation.results }];
  }
}

export interface SendMessageInput {
  userId: string;
  message: string;
  history?: ChatHistoryTurn[];
}

export async function sendMessage(input: SendMessageInput): Promise<NonCancelledOutcome> {
  let system: string;
  try {
    system = await buildSystemForUser(input.userId, "light");
  } catch (error) {
    logError("ai.chat.context", error, { userId: input.userId });
    return { type: "error", message: "Não foi possível carregar os teus dados financeiros agora. Tenta novamente." };
  }

  const messages: ChatMessage[] = [...historyToMessages(input.history), { role: "user", content: input.message }];
  return runLoop({ userId: input.userId, system, messages, roundsUsed: 0 });
}

export async function confirmPendingAction(userId: string, confirmationToken: string): Promise<NonCancelledOutcome> {
  const consumed = consumeConfirmation(confirmationToken, userId);
  if (!consumed.ok) {
    return { type: "error", message: mapConfirmationFailure(consumed.reason) };
  }
  const { confirmation } = consumed;
  const snapshot = confirmation.conversationSnapshot as ConversationSnapshot;

  const triggerCall = confirmation.toolCalls.find((c) => c.toolUseId === snapshot.triggerToolUseId);
  if (!triggerCall) {
    // Nunca deveria acontecer — runLoop sempre inclui o próprio trigger em
    // toolCalls antes de criar a confirmação. Defesa, não um caminho esperado.
    logError("ai.chat.orchestrator", new Error("Confirmação sem o tool call que a originou"), { userId });
    return { type: "error", message: "Não foi possível concluir esta confirmação." };
  }

  // [Correção — auditoria de segurança do Milestone 4] A ação que o
  // utilizador confirmou executa SEMPRE primeiro, independentemente da
  // posição em que apareceu no turno original do Claude — antes, se o
  // Claude tivesse pedido duas tools HIGH na mesma vez e a confirmada não
  // fosse a primeira do array, a ação que o utilizador genuinamente
  // confirmou podia nunca chegar a executar. Qualquer OUTRA tool do mesmo
  // turno que também exija confirmação nunca executa aqui — vira um
  // tool_result de erro (nunca aborta a conversa inteira), para o Claude
  // poder explicar a situação e pedir essa confirmação em separado.
  const results: ChatToolResultBlock[] = [];
  const triggerEvaluation = await executeConfirmedTool(triggerCall.toolName, userId, triggerCall.params);
  results.push(
    triggerEvaluation.status === "confirmation_required"
      ? toBlockedByConfirmationResult(triggerCall.toolUseId) // executeConfirmedTool nunca devolve isto de facto — defesa
      : toToolResultBlock(triggerCall.toolUseId, triggerEvaluation),
  );

  for (const call of confirmation.toolCalls) {
    if (call.toolUseId === triggerCall.toolUseId) continue;
    const evaluation = await executeTool(call.toolName, userId, call.params);
    results.push(
      evaluation.status === "confirmation_required" ? toBlockedByConfirmationResult(call.toolUseId) : toToolResultBlock(call.toolUseId, evaluation),
    );
  }

  const nextMessages: ChatMessage[] = [...snapshot.messages, { role: "user", content: results }];
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

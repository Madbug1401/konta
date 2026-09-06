// ============================================================================
// KONTA AI — AI Gateway (Milestone 1, evoluído no Milestone 4).
//
// [DECISÃO — Milestone 1] Este é o ÚNICO módulo do projeto autorizado a
// importar `@anthropic-ai/sdk` ou a construir um pedido para a API da
// Anthropic. Nenhuma outra camada (orquestrador de chat, Tool Registry,
// rota de API) pode importar o SDK diretamente; deve sempre passar por
// `sendChatTurn()`.
//
// [Milestone 4] Evolui de "uma mensagem, sem tools" (M1) para suportar
// tool-calling multi-turno: system prompt, histórico de mensagens (texto e
// blocos de tool_use/tool_result), e a lista de tools disponíveis. O
// CONTROLO do loop (quantas vezes chamar Claude, quando parar, quando pausar
// para confirmação) NUNCA vive aqui — vive em src/lib/ai/chat/orchestrator.ts.
// Este ficheiro só sabe fazer UMA chamada à Anthropic de cada vez; nunca
// decide sozinho encadear várias.
//
// Os tipos abaixo (ChatMessage, ChatBlock, ...) são deliberadamente tipos
// PRÓPRIOS do Konta, não um re-export dos tipos do SDK — é isso que permite a
// qualquer outra camada (orquestrador, Tool Registry) construir/inspecionar
// mensagens sem nunca importar `@anthropic-ai/sdk`.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

// [DECISÃO — escolha de modelo] Claude Sonnet 5, não Opus 5 — mesma decisão
// do Milestone 1, mantida sem alteração neste milestone (instrução
// explícita: não trocar de modelo).
const MODEL = "claude-sonnet-5";

// [Milestone 4] Uma resposta com tool-calling pode incluir texto de
// raciocínio + a chamada da tool; 1024 (limite do M1, pensado só para texto
// simples) era apertado demais. 2048 continua modesto face ao limite técnico
// do modelo (128k) — decisão de custo, não uma limitação técnica.
const MAX_TOKENS = 2048;

export class AiConfigError extends Error {
  constructor(message = "ANTHROPIC_API_KEY não está definido.") {
    super(message);
    this.name = "AiConfigError";
  }
}

export class AiProviderError extends Error {
  constructor(message = "Erro ao comunicar com o Claude.") {
    super(message);
    this.name = "AiProviderError";
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiConfigError(
      "ANTHROPIC_API_KEY não está definido. Define a chave da API da Anthropic em .env antes de usar o Konta AI.",
    );
  }

  client = new Anthropic({ apiKey });
  return client;
}

// ----------------------------------------------------------------------------
// Tipos próprios do Konta — nunca os tipos do SDK, para nenhuma outra camada
// alguma vez precisar de importar `@anthropic-ai/sdk` só para anotar um tipo.
// ----------------------------------------------------------------------------

export type ChatRole = "user" | "assistant";

export interface ChatTextBlock {
  type: "text";
  text: string;
}

/** Um pedido de tool feito pelo Claude — nunca produzido por nós, só lido. */
export interface ChatToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** O resultado de uma tool, para devolver ao Claude — nunca vem do Claude. */
export interface ChatToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type ChatAssistantBlock = ChatTextBlock | ChatToolUseBlock;
export type ChatUserBlock = ChatTextBlock | ChatToolResultBlock;

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatAssistantBlock[] | ChatUserBlock[];
}

/**
 * Forma mínima que uma tool precisa de anunciar ao Claude — nunca
 * `execute`/`riskTier`/detalhes internos. Ver
 * src/lib/ai/tools/anthropic-adapter.ts (o único produtor deste tipo; este
 * ficheiro só o consome).
 */
export interface ChatToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface SendChatTurnParams {
  system: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
}

export type ChatStopReason = "end_turn" | "tool_use" | "max_tokens" | "other";

export interface ChatTurnResult {
  stopReason: ChatStopReason;
  content: ChatAssistantBlock[];
}

function toAnthropicContent(blocks: ChatAssistantBlock[] | ChatUserBlock[]): Anthropic.MessageParam["content"] {
  return blocks.map((block) => {
    if (block.type === "text") return { type: "text" as const, text: block.text };
    if (block.type === "tool_use") return { type: "tool_use" as const, id: block.id, name: block.name, input: block.input };
    return {
      type: "tool_result" as const,
      tool_use_id: block.toolUseId,
      content: block.content,
      is_error: block.isError,
    };
  });
}

function toAnthropicMessage(message: ChatMessage): Anthropic.MessageParam {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  return { role: message.role, content: toAnthropicContent(message.content) };
}

/**
 * Envia UM turno ao Claude (mensagens + system + tools disponíveis) e devolve
 * a resposta já traduzida para os tipos próprios do Konta. Não sabe nada
 * sobre loops, confirmação, ou o que uma tool faz — isso é
 * src/lib/ai/chat/orchestrator.ts e src/lib/ai/tools/*.
 */
export async function sendChatTurn(params: SendChatTurnParams): Promise<ChatTurnResult> {
  const anthropic = getClient();

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: params.system,
      messages: params.messages.map(toAnthropicMessage),
      tools: params.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new AiProviderError(`Erro ao comunicar com a Anthropic (${error.status ?? "sem status"}): ${error.message}`);
    }
    throw error;
  }

  const content: ChatAssistantBlock[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
    }
    // Outros tipos de bloco (ex: thinking) nunca são precisos por quem chama
    // esta função — nem o Gateway nem o orquestrador raciocinam sobre eles.
  }

  const stopReason: ChatStopReason =
    response.stop_reason === "tool_use"
      ? "tool_use"
      : response.stop_reason === "end_turn"
        ? "end_turn"
        : response.stop_reason === "max_tokens"
          ? "max_tokens"
          : "other";

  if (content.length === 0 && stopReason !== "tool_use") {
    throw new AiProviderError("O Claude devolveu uma resposta vazia ou inesperada.");
  }

  return { stopReason, content };
}

/** Só para os testes: limpa o cliente singleton entre casos de teste. */
export function _resetAiClientForTests(): void {
  client = null;
}

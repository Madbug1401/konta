// ============================================================================
// KONTA AI — AI Gateway (Milestone 1).
//
// [DECISÃO — Milestone 1] Este é o ÚNICO módulo do projeto autorizado a
// importar `@anthropic-ai/sdk` ou a construir um pedido para a API da
// Anthropic — mesmo princípio já usado para `pg` (só `src/lib/db/*`) e para
// `jose` (só `src/lib/auth/jwt.ts`). Nenhuma rota de API deve chamar o SDK
// diretamente; deve sempre passar por `sendChatMessage()`.
//
// Âmbito deliberadamente mínimo (Milestone 1 — "AI Gateway sem tools"):
// nenhum tool-use, nenhum contexto financeiro, nenhuma leitura/escrita na
// base de dados, nenhuma memória de conversa. Só prova que Konta consegue
// falar com o Claude e devolver texto. Ver docs/konta-ai-design.html.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";

// [DECISÃO — escolha de modelo] Claude Sonnet 5, não Opus 5, por decisão de
// produto: docs/konta-ai-design.html, secção "custo", enquadra o Konta AI
// como desenhado para um orçamento pequeno desde o V1 ("não para escalar
// primeiro") — Sonnet 5 ($2/$10 por MTok) é a opção deliberadamente mais
// barata face a Opus 5 ($5/$25), não uma redução de qualidade acidental.
const MODEL = "claude-sonnet-5";

// Resposta de texto simples, sem tools — não há razão para um limite alto.
const MAX_TOKENS = 1024;

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

// Espelha o padrão de `getSecret()` em src/lib/auth/jwt.ts: lê a variável de
// ambiente só quando é mesmo preciso (nunca no import do módulo), com uma
// mensagem de erro clara em vez de deixar o SDK falhar com um erro genérico.
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

/**
 * Envia uma única mensagem de texto ao Claude e devolve a resposta em texto.
 * Sem histórico de conversa, sem tools, sem contexto financeiro — ver nota de
 * âmbito no topo do ficheiro. Não recebe `userId`: nesta fase a resposta não
 * depende do utilizador, e passar um id sem o usar seria uma interface falsa.
 */
export async function sendChatMessage(message: string): Promise<string> {
  const anthropic = getClient();

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: message }],
    });
  } catch (error) {
    // Cadeia do mais específico para o mais genérico (nunca comparar
    // mensagens de erro por texto) — mas para a V1 todas resultam no mesmo
    // AiProviderError: distinguir retryable/não-retryable fica para quando
    // houver um mecanismo de retry a sério a decidir com base nisso.
    if (error instanceof Anthropic.APIError) {
      throw new AiProviderError(`Erro ao comunicar com a Anthropic (${error.status ?? "sem status"}): ${error.message}`);
    }
    throw error;
  }

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock || textBlock.text.trim().length === 0) {
    throw new AiProviderError("O Claude devolveu uma resposta vazia ou inesperada.");
  }

  return textBlock.text;
}

/** Só para os testes: limpa o cliente singleton entre casos de teste. */
export function _resetAiClientForTests(): void {
  client = null;
}

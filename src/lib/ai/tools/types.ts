// ============================================================================
// KONTA AI — Tool Registry: contrato de tipos (Milestone 3).
//
// Ver docs/konta-ai-design.html, secção E ("Tool = contrato, nunca lógica de
// negócio") e F ("Risco por chamada, não só por tool"). Uma tool nunca
// contém a regra financeira — só a aponta (paramsSchema reutiliza Zod já
// existente; execute() chama diretamente a função de domínio já existente).
// ============================================================================

import type { z } from "zod";

/**
 * Lista fechada — nunca strings espalhadas pelo código nem um valor
 * escolhido pelo modelo/chamador. `riskTier` pertence sempre à tool (ver
 * cada ficheiro em ./tools/), nunca a um parâmetro de execução.
 */
export const RISK_TIERS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

/**
 * Contrato de uma tool, tal como descrito no design: name/description
 * (expostos ao modelo), paramsSchema (Zod — nunca outra biblioteca),
 * riskTier (metadado estático), summarize (frase de confirmação, síncrona,
 * só com base em params já validados) e execute (chama a função de domínio
 * existente, nunca SQL novo).
 */
export interface AiTool<TParams, TResult> {
  name: string;
  description: string;
  paramsSchema: z.ZodType<TParams>;
  riskTier: RiskTier;
  summarize: (params: TParams) => string;
  execute: (userId: string, params: TParams) => Promise<TResult>;
}

/**
 * Falha de execução conhecida e segura de anunciar (ex: "Conta não
 * encontrada.") — sempre com a mesma mensagem genérica já usada pelas rotas
 * de API equivalentes (nunca revela se o recurso existe para outro
 * utilizador). Qualquer outro erro (bug, falha de rede/BD) NÃO deve usar esta
 * classe — o executor trata-o como inesperado e regista-o via logError,
 * sem expor detalhes técnicos (mesmo princípio de src/lib/api-error.ts).
 */
export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

/**
 * Decisão da Permission Layer — nunca calculada pelo modelo, nunca
 * confiável a partir de um valor enviado pelos parâmetros. Ver
 * permissions.ts.
 */
export type PermissionDecision =
  | { allowed: true; requiresConfirmation: false }
  | { allowed: true; requiresConfirmation: true; summary: string }
  | { allowed: false; reason: string };

/**
 * Resultado devolvido por executeTool() — nunca uma exceção para os casos
 * esperados (tool inexistente, params inválidos, confirmação pendente,
 * permissão recusada), só para bugs verdadeiramente inesperados fora deste
 * contrato. `TResult` por omissão `unknown` porque o Registry guarda tools
 * de tipos diferentes (ver defineTool abaixo).
 */
export type ToolExecutionResult<TResult = unknown> =
  | { status: "not_found"; toolName: string }
  | { status: "invalid_params"; toolName: string; error: string }
  | { status: "rejected"; toolName: string; reason: string }
  // [Milestone 4] `params` são os parâmetros já validados pelo paramsSchema
  // — nunca os parâmetros em bruto do modelo. Quem chama executeTool()
  // (o orquestrador de chat) usa isto para construir um PendingToolCall no
  // Confirmation Store; nunca para reexecutar sem passar pelo token.
  | { status: "confirmation_required"; toolName: string; riskTier: RiskTier; summary: string; params: unknown }
  | { status: "executed"; toolName: string; riskTier: RiskTier; result: TResult }
  | { status: "execution_failed"; toolName: string; error: string };

/**
 * O Registry guarda tools de TParams/TResult diferentes na mesma lista — em
 * TypeScript isto exige apagar o tipo genérico concreto num ponto único e
 * controlado, em vez de usar `any` espalhado. Cada ficheiro em ./tools/
 * exporta a sua tool com o tipo concreto (`AiTool<ConcreteParams,
 * ConcreteResult>`, com verificação de tipos completa nesse ficheiro);
 * `defineTool` embrulha-a para o Registry, fazendo o cast de `unknown` para
 * o tipo concreto só DEPOIS da validação em runtime pelo próprio
 * paramsSchema — nunca antes, nunca sem essa validação.
 */
export function defineTool<TParams, TResult>(tool: AiTool<TParams, TResult>): AiTool<unknown, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    riskTier: tool.riskTier,
    paramsSchema: tool.paramsSchema as unknown as z.ZodType<unknown>,
    summarize: (params: unknown) => tool.summarize(params as TParams),
    execute: (userId: string, params: unknown) => tool.execute(userId, params as TParams),
  };
}

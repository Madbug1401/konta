// ============================================================================
// KONTA AI — Permission / Risk Layer (Milestone 3).
//
// Ver docs/konta-ai-design.html, secção F ("Risco por chamada, não só por
// tool"): risco = tool + parâmetros + contexto — mas a V1 achata isso
// deliberadamente ("para a V1, achatamos essa nuance de propósito: toda a
// escrita é HIGH"). Esta camada já recebe `params`/`context` na forma do
// pedido, pronta para o cálculo fino descrito no design; a política V1
// abaixo decide só a partir de `riskTier` (metadado estático da tool).
//
// [Isolamento] Este ficheiro não importa `@anthropic-ai/sdk`, não sabe o que
// é o Claude, e não faz I/O — só recebe dados já resolvidos (riskTier,
// summary) e devolve uma decisão. Nunca confia num riskTier vindo de fora da
// própria tool (ver executor.ts — quem chama isto lê sempre `tool.riskTier`,
// nunca um valor dos parâmetros).
// ============================================================================

import type { PermissionDecision, RiskTier } from "./types";

export interface PermissionRequest {
  toolName: string;
  riskTier: RiskTier;
  userId: string;
  params: unknown;
}

/**
 * Política V1, exatamente como definida no design (secção F):
 *
 * - LOW: executa sempre, sem confirmação.
 * - MEDIUM: "tratado como HIGH nesta fase" — mesma exigência de confirmação
 *   que HIGH. A distinção existe na arquitetura (RiskTier tem os quatro
 *   valores) para quando a V1 evoluir a computar risco fino por chamada;
 *   hoje nenhuma das 7 tools é MEDIUM, mas o caso é tratado corretamente.
 * - HIGH: SEMPRE exige confirmação explícita — sem exceção, sem
 *   "force execute".
 * - CRITICAL: recusado — "nem chega a propor". Nenhuma tool da V1 é
 *   CRITICAL, mas a Permission Layer trata o caso mesmo assim (defesa em
 *   profundidade para quando uma tool desse nível existir).
 *
 * `summary` vem já calculado por quem chama (executor.ts, via
 * `tool.summarize(params)`) — esta função nunca invoca o Claude nem conhece
 * a forma de uma tool, só a decisão de risco.
 */
export function evaluatePermission(request: PermissionRequest, summary: string): PermissionDecision {
  switch (request.riskTier) {
    case "LOW":
      return { allowed: true, requiresConfirmation: false };
    case "MEDIUM":
    case "HIGH":
      return { allowed: true, requiresConfirmation: true, summary };
    case "CRITICAL":
      return {
        allowed: false,
        reason: `Ações de risco CRITICAL não são permitidas na V1 (tool: "${request.toolName}").`,
      };
  }
}

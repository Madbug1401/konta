import type { RiskTier } from "@/lib/ai/tools";
import type { AnalyticsViewAction, AiVisualization } from "@/lib/analytics";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * [Milestone Analytics — Konta AI + página] Contexto atual da página de
 * Análises, enviado só quando a mensagem parte dessa página (via
 * `AskKonta`) — nunca inventado, nunca IDs internos, só texto já formatado
 * (rótulos, nunca dados a recalcular). Ver chat/analytics-context.ts.
 */
export interface AnalyticsPageContext {
  periodLabel: string;
  comparisonLabel: string | null;
  view: string;
  categoryName?: string;
  accountName?: string;
  transactionType?: string;
}

/**
 * Resultado de um turno de chat — nunca uma exceção para os casos
 * esperados. `confirmation_required` é devolvido ANTES de qualquer
 * escrita acontecer; só depois de `confirmPendingAction` correr com
 * sucesso é que a tool HIGH/MEDIUM é mesmo executada.
 *
 * [Milestone Analytics] `uiAction`/`visualization` só aparecem quando o
 * turno executou `set_analytics_view`/uma tool de analytics que os tenha
 * preenchido — sempre já validados pelo respetivo schema Zod dentro da
 * própria tool (ver set-analytics-view.ts) antes de chegarem aqui. Nunca
 * confiar cegamente do lado do cliente mesmo assim (ver
 * src/lib/analytics/view-action.ts e visualization.ts, ambos revalidados
 * no componente que os consome).
 */
export type ChatOutcome =
  | { type: "final"; reply: string; uiAction?: AnalyticsViewAction; visualization?: AiVisualization }
  | { type: "confirmation_required"; confirmationToken: string; summary: string; riskTier: RiskTier; uiAction?: AnalyticsViewAction }
  | { type: "cancelled" }
  | { type: "error"; message: string };

import type { RiskTier } from "@/lib/ai/tools";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Resultado de um turno de chat — nunca uma exceção para os casos
 * esperados. `confirmation_required` é devolvido ANTES de qualquer
 * escrita acontecer; só depois de `confirmPendingAction` correr com
 * sucesso é que a tool HIGH/MEDIUM é mesmo executada.
 */
export type ChatOutcome =
  | { type: "final"; reply: string }
  | { type: "confirmation_required"; confirmationToken: string; summary: string; riskTier: RiskTier }
  | { type: "cancelled" }
  | { type: "error"; message: string };

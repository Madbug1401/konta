// ============================================================================
// KONTA ANALYTICS — comparação de dois valores monetários (Milestone Analytics).
//
// Único sítio que decide "subiu/desceu/estável" e a percentagem de variação
// — nunca calculado ad-hoc em cada módulo de analytics, para a regra "nunca
// mostrar uma variação enganosa quando o período anterior for zero" ficar
// garantida num único lugar.
// ============================================================================

import type { MinorAmount } from "@/lib/financial-engine";

export type TrendDirection = "up" | "down" | "flat";

export interface Comparison {
  current: MinorAmount;
  previous: MinorAmount | null;
  /** null quando não há período anterior, OU quando o anterior é zero (percentagem seria infinita/enganosa). */
  changePercent: number | null;
  direction: TrendDirection;
}

export function compareAmounts(current: MinorAmount, previous: MinorAmount | null): Comparison {
  if (previous === null) {
    return { current, previous: null, changePercent: null, direction: "flat" };
  }
  const direction: TrendDirection = current > previous ? "up" : current < previous ? "down" : "flat";
  // [Regra do pedido — "nunca variações enganosas quando o anterior for
  // zero"] 0 -> 5000 não é "+∞%" nem "+100%" que faça sentido comparar —
  // fica sem percentagem, só a direção e os valores absolutos.
  const changePercent = previous === 0n ? null : (Number(current - previous) / Number(previous)) * 100;
  return { current, previous, changePercent, direction };
}

export function comparePercent(current: number | null, previous: number | null): { current: number | null; previous: number | null; direction: TrendDirection } {
  if (current === null || previous === null) return { current, previous, direction: "flat" };
  const direction: TrendDirection = current > previous ? "up" : current < previous ? "down" : "flat";
  return { current, previous, direction };
}

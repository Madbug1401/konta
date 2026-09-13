// ============================================================================
// KONTA AI — Contexto da página de Análises (Milestone Analytics).
//
// [Secção 29/35 do pedido — "Ask Konta" não deve obrigar o utilizador a
// repetir o período/filtro que já está visível na página] Este ficheiro
// serializa esse contexto em texto para o system prompt — nunca dados a
// recalcular (só rótulos já formatados pela própria página, ex: "Setembro
// de 2026", nunca uma data em bruto que o modelo pudesse tentar reutilizar
// como se fosse um id). Sempre um addendum PEQUENO e opcional: só entra no
// prompt quando a mensagem vier da página de Análises (nunca no chat geral),
// nunca substituindo a obrigação da IA de chamar get_analytics_overview/
// get_category_analysis/etc. para números reais — isto é só orientação de
// "onde estás", não dados financeiros.
// ============================================================================

import { z } from "zod";
// [Isolamento cliente/servidor] Importa diretamente de `analytics/view-action`
// (só zod/constantes puras) — NUNCA do barrel `@/lib/analytics`, que também
// reexporta `dataset.ts` (I/O real: `@/lib/db/*`, que por sua vez usa `pg`) —
// isso arrastaria código só-de-servidor para o bundle do cliente. Este
// ficheiro é importado tanto pelo orquestrador (servidor) como pelo
// componente "Ask Konta" (cliente), por isso tem de ser sempre isomórfico.
// Mesmo cuidado já aplicado a use-audio-recorder.ts (Milestone 5c) e
// assistant-provider.tsx (Milestone 5a).
import { ANALYTICS_VIEWS } from "@/lib/analytics/view-action";

export const AnalyticsPageContextSchema = z
  .object({
    periodLabel: z.string().trim().min(1).max(60),
    comparisonLabel: z.string().trim().max(60).nullable(),
    view: z.enum(ANALYTICS_VIEWS),
    categoryName: z.string().trim().max(120).optional(),
    accountName: z.string().trim().max(255).optional(),
    transactionType: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  })
  .strict();
export type AnalyticsPageContext = z.infer<typeof AnalyticsPageContextSchema>;

export function renderAnalyticsContextForPrompt(context: AnalyticsPageContext): string {
  const parts = [`secção "${context.view}"`, `período ${context.periodLabel}`];
  if (context.comparisonLabel) parts.push(`comparado com ${context.comparisonLabel}`);
  if (context.categoryName) parts.push(`filtrado pela categoria "${context.categoryName}"`);
  if (context.accountName) parts.push(`filtrado pela conta "${context.accountName}"`);
  if (context.transactionType) parts.push(`tipo ${context.transactionType}`);
  return `O utilizador está a ver a página de Análises, ${parts.join(", ")} — usa isto como contexto da pergunta (nunca precisas de pedir de novo o período/filtro já indicado aqui), mas continua a obter os números reais sempre através das tools de analytics, nunca inventados a partir deste texto.`;
}

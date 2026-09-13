// ============================================================================
// KONTA ANALYTICS — Contrato de ação declarativa sobre a página (Milestone
// Analytics + Konta AI).
//
// [Segurança — secção 25 do pedido] A Konta AI NUNCA manipula a UI
// diretamente (sem DOM, sem JS, sem localStorage, sem URL livre). Este é o
// ÚNICO formato que a IA pode propor para mudar o que a página de Análises
// mostra — um objeto simples, validado por este schema Zod em AMBOS os
// lados:
//   - no servidor, dentro da tool `set_analytics_view`, que resolve nomes em
//     texto livre (categoria/conta) para ids REAIS do utilizador antes de
//     construir a ação — nunca aceita um id vindo do modelo;
//   - no cliente, na página de Análises, antes de aplicar a ação recebida
//     (nunca confia cegamente só porque "veio do servidor" — validação em
//     profundidade).
// A aplicação (não a IA) decide se a ação é válida e como a aplicar (sempre
// via navegação normal — `router.push` com query params, nunca
// `eval`/`innerHTML`/execução de código).
//
// Este ficheiro é deliberadamente isomórfico (zero I/O, zero import de
// `@/lib/db`) para poder ser importado tanto por uma tool de servidor como
// por um componente cliente.
// ============================================================================

import { z } from "zod";
import { PERIOD_PRESETS } from "./periods";

export const ANALYTICS_VIEWS = [
  "overview",
  "cashflow",
  "expenses",
  "categories",
  "debts",
  "goals",
  "investments",
  "recurring",
  "trends",
] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];

export const COMPARISON_MODE_VALUES = ["previous_period", "previous_year", "none"] as const;

/**
 * Todos os campos são opcionais — pelo menos um tem de estar presente
 * (`.refine` abaixo). `categoryId`/`accountId` são sempre ids reais já
 * resolvidos por quem constrói a ação (nunca aceites em bruto do texto do
 * utilizador) — `categoryName`/`accountName` existem só para a UI/o chat
 * mostrarem algo legível, nunca para resolver nada.
 */
export const AnalyticsViewActionSchema = z
  .object({
    period: z
      .object({
        preset: z.enum(PERIOD_PRESETS).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict()
      .optional(),
    comparisonMode: z.enum(COMPARISON_MODE_VALUES).optional(),
    categoryId: z.string().max(64).nullable().optional(),
    categoryName: z.string().max(120).optional(),
    accountId: z.string().max(64).nullable().optional(),
    accountName: z.string().max(255).optional(),
    transactionType: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).nullable().optional(),
    view: z.enum(ANALYTICS_VIEWS).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.period !== undefined ||
      data.comparisonMode !== undefined ||
      data.categoryId !== undefined ||
      data.accountId !== undefined ||
      data.transactionType !== undefined ||
      data.view !== undefined,
    { message: "A ação tem de alterar pelo menos um campo." },
  );

export type AnalyticsViewAction = z.infer<typeof AnalyticsViewActionSchema>;

/** Valida uma ação recebida de qualquer origem — usar SEMPRE antes de aplicar (nunca confiar num objeto só porque "parece" uma AnalyticsViewAction). */
export function parseAnalyticsViewAction(value: unknown): AnalyticsViewAction | null {
  const result = AnalyticsViewActionSchema.safeParse(value);
  return result.success ? result.data : null;
}

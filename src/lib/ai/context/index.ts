// Superfície pública do Context Builder — só isto deve ser importado por
// fora de src/lib/ai/context/. `collect.ts` e `normalize.ts` são detalhes de
// implementação internos (collection vs. normalization, ver builder.ts).
export { buildAiContext } from "./builder";
export {
  CONTEXT_DOMAINS,
  UnsupportedContextDomainError,
  type AiAccountSummary,
  type AiCategoryAmount,
  type AiCategoryComparison,
  type AiContext,
  type AiCurrencySummary,
  type AiDebtInstallmentSummary,
  type AiDebtSummary,
  type AiGoalSummary,
  type AiInvestmentSummary,
  type AiTransactionSummary,
  type BuildContextOptions,
  type ContextDomain,
  type ContextMode,
  type DirectedTransactionFilters,
} from "./types";

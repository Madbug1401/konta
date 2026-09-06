// Superfície pública do Context Builder — só isto deve ser importado por
// fora de src/lib/ai/context/. `collect.ts` continua um detalhe de
// implementação interno (I/O, ver builder.ts).
//
// [Milestone 3 — Tool Registry] `buildDebtSummaries`/`buildGoalSummaries`
// são reexportados aqui para as tools `get_debts`/`get_goals`
// (src/lib/ai/tools/tools/) reutilizarem o cálculo real já testado
// (bucketing de parcelas, projeção de meta) em vez de o duplicarem — mesmo
// princípio de "reutilizar funções de domínio existentes" já aplicado em
// todo o resto do projeto. Nenhuma lógica nova foi criada aqui.
export { buildAiContext } from "./builder";
export { buildDebtSummaries, buildGoalSummaries, GOAL_PROJECTION_LOOKBACK_DAYS } from "./normalize";
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

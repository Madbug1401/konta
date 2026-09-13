// Superfície pública da camada de Analytics — só isto deve ser importado por
// fora de src/lib/analytics/. Mesmo padrão de src/lib/ai/context/index.ts.
export { collectAnalyticsDataset, currenciesInUse, type AnalyticsDataset, type InvestmentAccountData } from "./dataset";
export type { AnalyticsFilters } from "./types";
export {
  autoGranularity,
  bucketizePeriod,
  COMPARISON_MODES,
  InvalidPeriodError,
  PERIOD_PRESETS,
  resolveComparisonPeriod,
  resolvePeriod,
  type ComparisonMode,
  type Granularity,
  type PeriodBucket,
  type PeriodPreset,
  type PeriodRange,
} from "./periods";
export { compareAmounts, comparePercent, type Comparison, type TrendDirection } from "./compare";
export { filterForComparisonPeriod, filterForPeriod, inPeriod } from "./filters";
export { getAnalyticsOverview, type AnalyticsOverview, type FormattedComparison } from "./overview";
export { findBucketPeriod, getCashflowAnalysis, type CashflowAnalysis, type CashflowBucket } from "./cashflow";
export {
  getCategoryAnalysis,
  getCategoryDrilldown,
  getTopTransactions,
  resolveCategoryName,
  type CategoryAnalysisRow,
  type CategoryDrilldown,
  type CategoryResolution,
  type TopTransactionRow,
} from "./categories";
export { getDebtAnalysis, type DebtAnalysis, type DebtAnalysisRow } from "./debts";
export { getGoalAnalysis, type GoalAnalysis, type GoalAnalysisRow } from "./goals";
export { getRecurringAnalysis, type RecurringAnalysis, type RecurringItemRow } from "./recurring";
export { getInvestmentAnalysis, type InvestmentAnalysis, type InvestmentAnalysisRow } from "./investments";
export { getFinancialTrends, type CategoryTrendRow, type FinancialTrends, type MetricTrend } from "./trends";
export { getFinancialInsights, type FinancialInsight, type InsightKind } from "./insights";
export { runFinancialSimulation, SimulationInputError, type SimulationInput, type SimulationResult } from "./simulations";
export {
  ANALYTICS_VIEWS,
  AnalyticsViewActionSchema,
  COMPARISON_MODE_VALUES,
  parseAnalyticsViewAction,
  type AnalyticsView,
  type AnalyticsViewAction,
} from "./view-action";
export { AiVisualizationSchema, parseAiVisualization, type AiVisualization } from "./visualization";

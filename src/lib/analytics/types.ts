// ============================================================================
// KONTA ANALYTICS — filtros partilhados (Milestone Analytics).
// ============================================================================

import type { TransactionType } from "@/lib/financial-engine";
import type { ComparisonMode, PeriodRange } from "./periods";

export interface AnalyticsFilters {
  period: PeriodRange;
  comparisonMode: ComparisonMode;
  comparisonPeriod: PeriodRange | null;
  /** Moeda sobre a qual esta análise incide — nunca soma-se moedas diferentes (mesma regra do Dashboard). */
  currency: string;
  accountId?: string;
  categoryId?: string;
  transactionType?: TransactionType;
}

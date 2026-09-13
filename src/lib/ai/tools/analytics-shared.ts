// ============================================================================
// KONTA AI — Analytics Tools: schema e resolução de filtros partilhados
// (Milestone Analytics + Konta AI).
//
// Único ponto que traduz os parâmetros que o Claude pode legitimamente
// pedir (preset de período, modo de comparação, nome de categoria/conta em
// texto livre) para um `AnalyticsFilters` real — nunca aceita um id vindo
// do modelo, nunca inventa uma comparação não pedida. Todas as tools de
// analytics (LOW, read-only) reutilizam isto, em vez de cada uma resolver
// filtros à sua maneira.
// ============================================================================

import { z } from "zod";
import {
  COMPARISON_MODES,
  currenciesInUse,
  InvalidPeriodError,
  PERIOD_PRESETS,
  resolveComparisonPeriod,
  resolvePeriod,
  type AnalyticsDataset,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { ToolExecutionError } from "./types";

export const AnalyticsFilterParamsSchema = z
  .object({
    period: z.enum(PERIOD_PRESETS).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    comparisonMode: z.enum(COMPARISON_MODES).optional(),
    currency: z.string().length(3).optional(),
  })
  .strict();
export type AnalyticsFilterParams = z.infer<typeof AnalyticsFilterParamsSchema>;

/** Resolve os parâmetros de período/comparação/moeda de uma tool de analytics num `AnalyticsFilters` real. Nunca aceita accountId/categoryId aqui — cada tool que precisa deles resolve o NOME em texto livre à parte (mesmo princípio de resolveCategoryByName). */
export function resolveAnalyticsFilters(dataset: AnalyticsDataset, params: AnalyticsFilterParams): AnalyticsFilters {
  const presetOrDefault = params.period ?? "this_month";
  let period;
  try {
    period =
      presetOrDefault === "custom"
        ? resolvePeriod("custom", dataset.timezone, new Date(), { from: params.from ?? "", to: params.to ?? "" })
        : resolvePeriod(presetOrDefault, dataset.timezone, new Date());
  } catch (error) {
    if (error instanceof InvalidPeriodError) throw new ToolExecutionError(error.message);
    throw error;
  }
  const comparisonMode = params.comparisonMode ?? "previous_period";
  const comparisonPeriod = resolveComparisonPeriod(period, comparisonMode);
  const currency = params.currency ?? currenciesInUse(dataset)[0];

  return { period, comparisonMode, comparisonPeriod, currency };
}

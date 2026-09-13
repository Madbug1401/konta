// ============================================================================
// KONTA ANALYTICS — POST /api/analytics/simulate (Milestone Analytics).
//
// [READ-ONLY — secção 17/33 do pedido] Só chama runFinancialSimulation
// (src/lib/analytics/simulations.ts), que nunca escreve na base de dados.
// Esta rota existe só para o formulário "E se...?" da página de Análises
// (interativo, sem passar pelo chat) — a Konta AI tem o mesmo resultado
// através da tool run_financial_simulation, mesma função por baixo, nunca
// duas fórmulas financeiras.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-error";
import {
  collectAnalyticsDataset,
  currenciesInUse,
  resolveComparisonPeriod,
  resolvePeriod,
  runFinancialSimulation,
  SimulationInputError,
  InvalidPeriodError,
  COMPARISON_MODES,
  PERIOD_PRESETS,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { getSessionUser } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/db/users";
import { checkRateLimit } from "@/lib/rate-limit";

const SimulateRequestSchema = z
  .object({
    period: z.enum(PERIOD_PRESETS).optional(),
    comparisonMode: z.enum(COMPARISON_MODES).optional(),
    currency: z.string().length(3).optional(),
    input: z.discriminatedUnion("type", [
      z.object({ type: z.literal("reduce_category"), categoryName: z.string().trim().min(1).max(120), percent: z.number().min(1).max(100) }),
      z.object({ type: z.literal("adjust_expenses"), amountMinorDelta: z.number().int() }),
      z.object({ type: z.literal("increase_goal_contribution"), goalId: z.string().min(1), extraAmountMinor: z.number().int().positive() }),
    ]),
  })
  .strict();

// Mesmo limite/janela do resto do Konta AI — nunca uma segunda política de
// custo/abuso paralela.
const SIMULATE_RATE_LIMIT = 20;
const SIMULATE_RATE_WINDOW_MS = 10 * 60 * 1000;

export const POST = withErrorHandling("api.analytics.simulate.post", async (request: Request) => {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (!(await isAiEnabled(session.userId))) {
    return NextResponse.json({ error: "O acesso ao Konta AI foi desativado para a tua conta." }, { status: 403 });
  }

  const rateLimit = checkRateLimit(`analytics.simulate:${session.userId}`, SIMULATE_RATE_LIMIT, SIMULATE_RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados pedidos. Tenta novamente daqui a pouco." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = SimulateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  const dataset = await collectAnalyticsDataset(session.userId);
  const currency = parsed.data.currency ?? currenciesInUse(dataset)[0];

  let period;
  try {
    period = resolvePeriod(parsed.data.period ?? "this_month", dataset.timezone);
  } catch (error) {
    if (error instanceof InvalidPeriodError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const comparisonMode = parsed.data.comparisonMode ?? "previous_period";
  const filters: AnalyticsFilters = { period, comparisonMode, comparisonPeriod: resolveComparisonPeriod(period, comparisonMode), currency };

  try {
    const result = runFinancialSimulation(dataset, filters, parsed.data.input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SimulationInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
});

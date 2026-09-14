import Link from "next/link";
import { Suspense } from "react";
import {
  collectAnalyticsDataset,
  currenciesInUse,
  getAnalyticsOverview,
  getCashflowAnalysis,
  getCategoryAnalysis,
  getCategoryDrilldown,
  getDebtAnalysis,
  getFinancialInsights,
  getFinancialTrends,
  getGoalAnalysis,
  getInvestmentAnalysis,
  getRecurringAnalysis,
  getTopTransactions,
  InvalidPeriodError,
  PERIOD_PRESETS,
  resolveComparisonPeriod,
  resolvePeriod,
  type AnalyticsFilters,
  type PeriodPreset,
} from "@/lib/analytics";
import type { AnalyticsPageContext } from "@/lib/ai/chat/analytics-context";
import { AnalyticsUiActionBridge } from "@/components/analytics/analytics-ui-action-bridge";
import { AskKontaBar } from "@/components/analytics/ask-konta-bar";
import { CashflowChart } from "@/components/analytics/cashflow-chart";
import { CategoryDonutChart } from "@/components/analytics/category-donut-chart";
import { SimulationPanel } from "@/components/analytics/simulation-panel";
import { TrendSparkline, type TrendPoint } from "@/components/analytics/trend-sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import type { TransactionType } from "@/lib/financial-engine";

// [Expansão — navegação rápida dentro da página] Cada entrada aponta para
// um `id="analytics-section-X"` já existente (o mesmo que `set_analytics_view`
// usa para o scroll da Konta AI) — nunca uma segunda lista de secções a
// poder divergir da real.
const QUICK_JUMP_ITEMS: { view: string; label: string }[] = [
  { view: "overview", label: "Resumo" },
  { view: "cashflow", label: "Cash flow" },
  { view: "categories", label: "Categorias" },
  { view: "expenses", label: "Despesas" },
  { view: "debts", label: "Dívidas" },
  { view: "goals", label: "Metas" },
  { view: "recurring", label: "Recorrências" },
  { view: "trends", label: "Tendências" },
];

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "Este mês",
  last_month: "Mês passado",
  last_30d: "Últimos 30 dias",
  last_90d: "Últimos 90 dias",
  this_year: "Este ano",
  last_year: "Ano passado",
  last_12_months: "Últimos 12 meses",
  custom: "Personalizado",
};

const COMPARISON_LABELS: Record<string, string> = { previous_period: "Período anterior", previous_year: "Ano anterior", none: "Sem comparação" };

// [Design principle — secção 46 do pedido: "Data → Understanding →
// Decision", não "Data → Charts"] Cada secção começa por um valor direto,
// só depois mostra o detalhe — mesma hierarquia visual do Dashboard.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSessionUser();
  const dataset = await collectAnalyticsDataset(session!.userId);

  const currency = params.currency || currenciesInUse(dataset)[0];
  const preset: PeriodPreset = PERIOD_PRESETS.includes(params.period as PeriodPreset) ? (params.period as PeriodPreset) : "this_month";

  let period;
  let periodError: string | null = null;
  try {
    period = resolvePeriod(preset, dataset.timezone, new Date(), preset === "custom" ? { from: params.from ?? "", to: params.to ?? "" } : undefined);
  } catch (error) {
    periodError = error instanceof InvalidPeriodError ? error.message : "Período inválido.";
    period = resolvePeriod("this_month", dataset.timezone);
  }

  const comparisonMode = params.comparison === "previous_year" || params.comparison === "none" ? params.comparison : "previous_period";
  const comparisonPeriod = resolveComparisonPeriod(period, comparisonMode);
  const transactionType: TransactionType | undefined = params.type === "INCOME" || params.type === "EXPENSE" ? params.type : undefined;
  const categoryId = params.categoryId || undefined;
  const accountId = params.accountId || undefined;

  const filters: AnalyticsFilters = { period, comparisonMode, comparisonPeriod, currency, accountId, categoryId, transactionType };

  const overview = getAnalyticsOverview(dataset, filters);
  const cashflow = getCashflowAnalysis(dataset, filters);
  const categoryRows = getCategoryAnalysis(dataset, filters, transactionType === "INCOME" ? "INCOME" : "EXPENSE");
  const topExpenses = getTopTransactions(dataset, filters, { type: "EXPENSE", limit: 5 });
  const debts = getDebtAnalysis(dataset, filters);
  const goals = getGoalAnalysis(dataset, filters);
  const recurring = getRecurringAnalysis(dataset, filters);
  const investments = getInvestmentAnalysis(dataset, { currency });
  const trends = getFinancialTrends(dataset, filters);
  const insights = getFinancialInsights(dataset, filters);
  const drilldown = categoryId ? getCategoryDrilldown(dataset, filters, categoryId) : null;

  function href(overrides: Record<string, string | undefined>) {
    const qs = new URLSearchParams();
    const merged = { period: preset, comparison: comparisonMode, currency, type: transactionType, categoryId, accountId, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) qs.set(key, value);
    }
    const query = qs.toString();
    return query ? `/analytics?${query}` : "/analytics";
  }

  // [Expansão — drill-down real ao clicar numa barra, secção 7 do pedido]
  // Cada bucket vira um período `custom` exato — `href()` só existe aqui no
  // servidor (uma função nunca atravessa para o cliente), por isso o link
  // final é calculado já aqui, nunca recalculado no componente cliente.
  const cashflowPoints = cashflow.buckets.map((b) => ({
    label: b.label,
    income: Number(b.incomeMinor),
    expense: Number(b.expenseMinor),
    href: href({ period: "custom", from: b.start, to: b.end }),
  }));

  // [Expansão — donut de categorias] Top 7 + "Outras" agregada, mesmo
  // critério do Dashboard (DashboardCategoryChart) — nunca estica a paleta
  // de 8 cores além do que ela tem.
  const TOP_DONUT_CATEGORIES = 7;
  const topCategoryRows = categoryRows.slice(0, TOP_DONUT_CATEGORIES);
  const otherCategoriesMinor = categoryRows.slice(TOP_DONUT_CATEGORIES).reduce((sum, r) => sum + r.currentMinor, 0n);
  const categoryDonutSlices = [
    ...topCategoryRows.map((r) => ({ name: r.categoryName, value: Number(r.currentMinor), href: href({ categoryId: r.categoryId ?? undefined }) })),
    ...(otherCategoriesMinor > 0n ? [{ name: "Outras", value: Number(otherCategoriesMinor), href: href({}) }] : []),
  ];

  const analyticsPageContext: AnalyticsPageContext = {
    periodLabel: period.label,
    comparisonLabel: comparisonPeriod?.label ?? null,
    view: drilldown ? "categories" : "overview",
    categoryName: drilldown?.categoryName,
    transactionType,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* [Correção — bug reportado em uso real] `useSearchParams()` (dentro
          da bridge) exige sempre um limite `<Suspense>` no App Router —
          mesma regra já seguida por `src/app/(auth)/login/page.tsx`. Sem
          isto, o Next.js lança "useSearchParams() should be wrapped in a
          suspense boundary" — é isto que causava o erro ao interagir com a
          página (o clique despoletava uma re-renderização que expunha o
          limite em falta). `fallback={null}` porque a bridge nunca tem
          saída visual própria. */}
      <Suspense fallback={null}>
        <AnalyticsUiActionBridge />
      </Suspense>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Análises</h1>
        <p className="text-sm text-muted-foreground">
          {period.label}
          {comparisonPeriod ? ` · comparado com ${comparisonPeriod.label}` : ""}
        </p>
      </div>

      {periodError && <p className="text-xs text-danger">{periodError} Mostrando &quot;Este mês&quot; em alternativa.</p>}

      {/* Filtro global de período/comparação — secção 5 do pedido */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_PRESETS.filter((p) => p !== "custom").map((p) => (
          <Link
            key={p}
            href={href({ period: p })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${p === preset ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface-hover text-foreground hover:bg-border"}`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        {(["previous_period", "previous_year", "none"] as const).map((mode) => (
          <Link
            key={mode}
            href={href({ comparison: mode })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${mode === comparisonMode ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface-hover text-foreground hover:bg-border"}`}
          >
            {COMPARISON_LABELS[mode]}
          </Link>
        ))}
      </div>

      {/* Navegação rápida — a mesma lista de âncoras que a Konta AI usa para
          "montar" o foco da página (set_analytics_view → scroll + destaque),
          agora também acessível diretamente ao utilizador. */}
      <nav aria-label="Saltar para secção" className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {QUICK_JUMP_ITEMS.map((item) => (
          <a
            key={item.view}
            href={`#analytics-section-${item.view}`}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Ask Konta + Insights — secções 28/29 do pedido */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AskKontaBar analyticsContext={analyticsPageContext} />
        <InsightsCard insights={insights} />
      </div>

      {/* Resumo executivo — secção 6. Hierarquia em duas camadas (secção 4
          do pedido — "hierarquia visual clara"): os 3 números de fluxo do
          período em destaque (hero), o resto como contexto de apoio. */}
      <section id="analytics-section-overview">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Resumo financeiro</h2>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <HeroMetricCard label="Receita" value={overview.income.current} changePercent={overview.income.changePercent} direction={overview.income.direction} />
          <HeroMetricCard label="Despesas" value={overview.expenses.current} changePercent={overview.expenses.changePercent} direction={overview.expenses.direction} invert />
          <HeroMetricCard label="Cash flow" value={overview.cashflow.current} changePercent={overview.cashflow.changePercent} direction={overview.cashflow.direction} highlight />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <MetricCard
            label="Taxa de poupança"
            value={overview.savingsRatePercent.current !== null ? `${overview.savingsRatePercent.current.toFixed(1)}%` : "—"}
          />
          <MetricCard label="Saldo disponível" value={overview.availableBalance} />
          <MetricCard label="Património líquido" value={overview.netWorth} />
          <MetricCard label="Dívidas em aberto" value={overview.debtsOutstanding} />
          <MetricCard label="Progresso médio das metas" value={overview.goals.averageProgressPercent !== null ? `${overview.goals.averageProgressPercent.toFixed(0)}%` : "—"} />
        </div>
      </section>

      {/* Cash flow — secção 7 */}
      <Card id="analytics-section-cashflow">
        <CardHeader>
          <CardTitle>Fluxo de caixa</CardTitle>
        </CardHeader>
        <CashflowChart points={cashflowPoints} currency={currency} />
      </Card>

      {/* Despesas / Categorias — secções 8, 9, 11 */}
      <Card id="analytics-section-categories">
        <CardHeader>
          <CardTitle>{drilldown ? `Categoria: ${drilldown.categoryName}` : "Categorias"}</CardTitle>
          {drilldown && (
            <Link href={href({ categoryId: undefined })} className="text-xs font-medium text-primary hover:underline">
              ← Voltar à visão geral
            </Link>
          )}
        </CardHeader>

        {drilldown ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Total" value={drilldown.total} changePercent={drilldown.changePercent} direction={drilldown.direction} />
              <MetricCard label="% das despesas" value={`${drilldown.shareOfExpensesPercent.toFixed(1)}%`} />
              <MetricCard label="Nº de transações" value={String(drilldown.transactionCount)} />
              <MetricCard label="Média por transação" value={drilldown.averagePerTransaction} />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Maiores transações</p>
              {drilldown.topTransactions.length === 0 ? (
                <EmptyState title="Sem transações neste período" />
              ) : (
                <TransactionsTable rows={drilldown.topTransactions} />
              )}
            </div>
          </div>
        ) : categoryRows.length === 0 ? (
          <EmptyState title="Sem despesas registadas neste período" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div>
              <CategoryDonutChart slices={categoryDonutSlices} currency={currency} />
              <p className="mt-1 text-center text-[11px] text-muted-foreground">Clica numa fatia para veres essa categoria.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Categoria</th>
                    <th className="py-2 pr-4 font-medium">Atual</th>
                    <th className="py-2 pr-4 font-medium">Anterior</th>
                    <th className="py-2 pr-4 font-medium">Variação</th>
                    <th className="py-2 font-medium">% despesas</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((row) => (
                    <tr key={row.categoryId ?? "none"} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4">
                        <Link href={href({ categoryId: row.categoryId ?? undefined })} className="font-medium text-foreground hover:text-primary hover:underline">
                          {row.categoryName}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{row.current}</td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{row.previous ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {row.changePercent === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={row.direction === "up" ? "text-danger" : row.direction === "down" ? "text-success" : "text-muted-foreground"}>
                            {row.direction === "up" ? "↑" : row.direction === "down" ? "↓" : "→"} {Math.abs(row.changePercent).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 tabular-nums">{row.shareOfTotalPercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Maiores transações — secção 10 */}
      {!drilldown && (
        <Card id="analytics-section-expenses">
          <CardHeader>
            <CardTitle>Maiores despesas</CardTitle>
          </CardHeader>
          {topExpenses.length === 0 ? <EmptyState title="Sem despesas neste período" /> : <TransactionsTable rows={topExpenses} />}
        </Card>
      )}

      {/* Dívidas — secção 12 */}
      <Card id="analytics-section-debts">
        <CardHeader>
          <CardTitle>Dívidas</CardTitle>
        </CardHeader>
        {debts.debts.length === 0 ? (
          <EmptyState title="Sem dívidas registadas" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Total em aberto" value={debts.totalRemaining} />
              <MetricCard label="Parcelas neste período" value={debts.installmentsDueInPeriod} />
              <MetricCard label="% da receita comprometida" value={debts.debtServiceRatioPercent !== null ? `${debts.debtServiceRatioPercent.toFixed(0)}%` : "—"} />
            </div>
            <ul className="flex flex-col gap-2">
              {debts.debts.map((d) => (
                <li key={d.debtId} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{d.creditorName}</span>
                    <span className="tabular-nums text-muted-foreground">{d.remaining} restantes</span>
                  </div>
                  <ProgressBar percent={d.progressPercent} tone="success" label={`${d.progressPercent.toFixed(0)}% pago`} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Metas — secção 13 */}
      <Card id="analytics-section-goals">
        <CardHeader>
          <CardTitle>Metas</CardTitle>
        </CardHeader>
        {goals.goals.length === 0 ? (
          <EmptyState title="Sem metas registadas" />
        ) : (
          <ul className="flex flex-col gap-2">
            {goals.goals.map((g) => (
              <li key={g.goalId} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{g.name}</span>
                  <span className="text-xs font-medium text-foreground">{g.progressPercent.toFixed(0)}%</span>
                </div>
                <ProgressBar percent={g.progressPercent} tone="primary" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {g.currentAmount} de {g.targetAmount} · contribuiu {g.contributionsInPeriod} neste período
                </p>
                {g.projection.estimatedCompletionDate && (
                  <p className="mt-1 text-xs text-muted-foreground">Projeção (estimativa, não uma certeza): conclusão em {g.projection.estimatedCompletionDate}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recorrências — secção 15 */}
      <Card id="analytics-section-recurring">
        <CardHeader>
          <CardTitle>Despesas/receitas recorrentes</CardTitle>
        </CardHeader>
        {recurring.items.length === 0 ? (
          <EmptyState title="Sem recorrências registadas" />
        ) : (
          <div className="flex flex-col gap-3">
            {recurring.shareOfMonthlyExpensesPercent !== null && (
              <p className="text-xs text-muted-foreground">
                As despesas recorrentes representam cerca de <strong className="text-foreground">{recurring.shareOfMonthlyExpensesPercent.toFixed(0)}%</strong> da tua despesa mensal média.
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {recurring.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    {item.description} {!item.isActive && <Badge tone="neutral">em pausa</Badge>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{item.amount}/{item.frequency === "MONTHLY" ? "mês" : item.frequency.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Investimentos — secção 14 (só se existirem) */}
      {investments.accounts.length > 0 && (
        <Card id="analytics-section-investments">
          <CardHeader>
            <CardTitle>Investimentos</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard label="Capital investido" value={investments.totalCapitalContributed} />
            <MetricCard label="Valor atual" value={investments.totalCurrentValue ?? "Avaliação incompleta"} />
          </div>
        </Card>
      )}

      {/* Tendências — secção 39 */}
      <Card id="analytics-section-trends">
        <CardHeader>
          <CardTitle>Tendências (últimos {trends.windowMonths} meses)</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TrendBadge label="Receita" direction={trends.income.direction} series={trends.income.series} />
          <TrendBadge label="Despesas" direction={trends.expenses.direction} series={trends.expenses.series} invert />
          <TrendBadge label="Cash flow" direction={trends.cashflow.direction} series={trends.cashflow.series} />
          <TrendBadge label="Património" direction={trends.netWorth.direction} series={trends.netWorth.series} />
        </div>
        {trends.topIncreasingCategories.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            A crescer mais: {trends.topIncreasingCategories.map((c) => c.categoryName).join(", ")}
          </p>
        )}
      </Card>

      {/* Simulação — secção 17 */}
      <SimulationPanel categoryNames={categoryRows.map((r) => r.categoryName)} periodPreset={preset} />
    </div>
  );
}

function HeroMetricCard({
  label,
  value,
  changePercent,
  direction,
  invert,
  highlight,
}: {
  label: string;
  value: string;
  changePercent: number | null;
  direction: "up" | "down" | "flat";
  invert?: boolean;
  highlight?: boolean;
}) {
  const goodDirection = invert ? "down" : "up";
  const tone = direction === "flat" ? "text-muted-foreground" : direction === goodDirection ? "text-success" : "text-danger";
  return (
    <Card className={highlight ? "border-primary/40" : undefined}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground sm:text-3xl">{value}</p>
      {changePercent !== null && (
        <p className={`mt-2 text-sm font-medium ${tone}`}>
          {direction === "up" ? "↑" : direction === "down" ? "↓" : "→"} {Math.abs(changePercent).toFixed(1)}% vs período anterior
        </p>
      )}
    </Card>
  );
}

function MetricCard({
  label,
  value,
  changePercent,
  direction,
  invert,
}: {
  label: string;
  value: string;
  changePercent?: number | null;
  direction?: "up" | "down" | "flat";
  invert?: boolean;
}) {
  const goodDirection = invert ? "down" : "up";
  const tone = direction === undefined || direction === "flat" ? "text-muted-foreground" : direction === goodDirection ? "text-success" : "text-danger";
  return (
    <Card>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {changePercent !== undefined && changePercent !== null && (
        <p className={`mt-1 text-xs font-medium ${tone}`}>
          {direction === "up" ? "↑" : direction === "down" ? "↓" : "→"} {Math.abs(changePercent).toFixed(1)}% vs período anterior
        </p>
      )}
    </Card>
  );
}

function TrendBadge({
  label,
  direction,
  series,
  invert,
}: {
  label: string;
  direction: "up" | "down" | "flat";
  series: TrendPoint[];
  invert?: boolean;
}) {
  const goodDirection = invert ? "down" : "up";
  const tone = direction === "flat" ? "neutral" : direction === goodDirection ? "success" : "danger";
  const text = direction === "up" ? "Crescente" : direction === "down" ? "Decrescente" : "Estável";
  const sparklineTone = direction === "flat" ? "muted" : direction === goodDirection ? "success" : "danger";
  return (
    <div className="rounded-lg border border-border p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Badge tone={tone} className="mt-1">
        {text}
      </Badge>
      <div className="mt-2">
        <TrendSparkline data={series} tone={sparklineTone} />
      </div>
    </div>
  );
}

function ProgressBar({ percent, tone, label }: { percent: number; tone: "success" | "primary"; label?: string }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = tone === "success" ? "var(--color-success)" : "var(--color-primary)";
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${clamped}%`, backgroundColor: color }} />
      </div>
      {label && <p className="mt-1 text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}

function InsightsCard({ insights }: { insights: ReturnType<typeof getFinancialInsights> }) {
  return (
    <Card>
      <p className="mb-2 text-sm font-semibold text-foreground">Konta AI Insights</p>
      {insights.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem observações relevantes para este período.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {insights.slice(0, 5).map((insight) => (
            <li key={insight.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <Badge tone={insight.kind === "alert" ? "danger" : insight.kind === "opportunity" ? "success" : insight.kind === "trend" ? "info" : "neutral"}>
                  {insight.kind}
                </Badge>
                <p className="text-xs font-medium text-foreground">{insight.title}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{insight.description}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TransactionsTable({ rows }: { rows: { id: string; description: string; date: string; categoryName: string | null; amount: string }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-foreground">{t.description}</p>
            <p className="text-xs text-muted-foreground">
              {t.date} {t.categoryName ? `· ${t.categoryName}` : ""}
            </p>
          </div>
          <span className="tabular-nums text-foreground">{t.amount}</span>
        </li>
      ))}
    </ul>
  );
}

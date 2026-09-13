// ============================================================================
// KONTA ANALYTICS — Insights (Milestone Analytics).
//
// Todos os insights são determinísticos e derivados de números já calculados
// por outros módulos desta camada — NUNCA gerados por Claude, nunca
// inventados (secção 16 do pedido: "cada insight deve possuir dados que
// expliquem a sua origem"). Este ficheiro só decide QUANDO um número já
// calculado merece virar um insight, com que limiar, e como o descrever em
// linguagem neutra (secção 39: "os gastos aumentaram", nunca "você gastou
// mais porque...", a menos que haja evidência disso — e nunca há aqui).
// ============================================================================

import { formatMinor } from "@/lib/financial-engine";
import { getAnalyticsOverview } from "./overview";
import { getCategoryAnalysis } from "./categories";
import { getRecurringAnalysis } from "./recurring";
import { getGoalAnalysis } from "./goals";
import { getDebtAnalysis } from "./debts";
import type { AnalyticsDataset } from "./dataset";
import type { AnalyticsFilters } from "./types";

// Um insight de "categoria mudou" só é gerado acima deste limiar — variações
// pequenas são ruído, não sinal (evita "insights" triviais em toda a
// resposta). Valor explícito, documentado, não escondido num "algoritmo".
const CATEGORY_CHANGE_THRESHOLD_PERCENT = 15;
const DEBT_SERVICE_ALERT_THRESHOLD_PERCENT = 30;

export type InsightKind = "trend" | "opportunity" | "alert" | "observation";

export interface FinancialInsight {
  id: string;
  kind: InsightKind;
  title: string;
  description: string;
  metric: string;
  periodLabel: string;
  /** De onde este insight veio — nunca "a IA achou", sempre um módulo real desta camada. */
  source: string;
}

export function getFinancialInsights(dataset: AnalyticsDataset, filters: AnalyticsFilters): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const overview = getAnalyticsOverview(dataset, filters);
  const periodLabel = filters.period.label;

  // Cashflow: só quando há comparação e uma percentagem real (nunca com o anterior a zero).
  if (overview.cashflow.changePercent !== null) {
    const improved = overview.cashflow.direction === "up";
    insights.push({
      id: "cashflow-change",
      kind: improved ? "trend" : "alert",
      title: improved ? "O teu fluxo de caixa melhorou" : "O teu fluxo de caixa piorou",
      description: `O cash flow ${improved ? "subiu" : "desceu"} ${Math.abs(overview.cashflow.changePercent).toFixed(1)}% face ao período anterior.`,
      metric: overview.cashflow.current,
      periodLabel,
      source: "getAnalyticsOverview.cashflow",
    });
  }

  // Categorias com variação acima do limiar.
  const categoryRows = getCategoryAnalysis(dataset, filters);
  for (const row of categoryRows) {
    if (row.changePercent === null || Math.abs(row.changePercent) < CATEGORY_CHANGE_THRESHOLD_PERCENT) continue;
    const increased = row.changePercent > 0;
    insights.push({
      id: `category-${row.categoryId ?? "none"}`,
      kind: increased ? "alert" : "opportunity",
      title: increased ? `${row.categoryName} aumentou` : `${row.categoryName} diminuiu`,
      description: `As despesas em ${row.categoryName} ${increased ? "aumentaram" : "diminuíram"} ${Math.abs(row.changePercent).toFixed(1)}% face ao período anterior.`,
      metric: row.current,
      periodLabel,
      source: "getCategoryAnalysis",
    });
  }

  // Recorrências: peso significativo no orçamento.
  const recurring = getRecurringAnalysis(dataset, filters);
  if (recurring.shareOfMonthlyExpensesPercent !== null && recurring.shareOfMonthlyExpensesPercent >= 30) {
    insights.push({
      id: "recurring-share",
      kind: "observation",
      title: "As tuas despesas recorrentes pesam no orçamento",
      description: `As despesas recorrentes ativas representam cerca de ${recurring.shareOfMonthlyExpensesPercent.toFixed(0)}% da tua despesa mensal média.`,
      metric: recurring.recurringMonthlyExpenseEquivalent,
      periodLabel,
      source: "getRecurringAnalysis",
    });
  }

  // Metas: contribuição real feita no período.
  const goals = getGoalAnalysis(dataset, filters);
  for (const goal of goals.goals.filter((g) => g.status === "ACTIVE")) {
    if (goal.contributionsInPeriod !== formatMinor(0n, filters.currency)) {
      insights.push({
        id: `goal-${goal.goalId}`,
        kind: "observation",
        title: `Contribuíste para "${goal.name}"`,
        description: `Adicionaste ${goal.contributionsInPeriod} à meta "${goal.name}" neste período — progresso atual: ${goal.progressPercent.toFixed(0)}%.`,
        metric: goal.contributionsInPeriod,
        periodLabel,
        source: "getGoalAnalysis",
      });
    }
  }

  // Dívidas: alerta quando o serviço da dívida pesa muito na receita do período.
  const debts = getDebtAnalysis(dataset, filters);
  if (debts.debtServiceRatioPercent !== null && debts.debtServiceRatioPercent >= DEBT_SERVICE_ALERT_THRESHOLD_PERCENT) {
    insights.push({
      id: "debt-service-ratio",
      kind: "alert",
      title: "As tuas dívidas comprometem uma parte significativa da receita",
      description: `As parcelas com vencimento neste período representam ${debts.debtServiceRatioPercent.toFixed(0)}% da tua receita do mesmo período.`,
      metric: debts.installmentsDueInPeriod,
      periodLabel,
      source: "getDebtAnalysis",
    });
  }

  return insights;
}

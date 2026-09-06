// ============================================================================
// KONTA AI — apresentação do contexto para o prompt (Milestone 4).
//
// O Context Builder (Milestone 2) devolve um DTO estruturado (`AiContext`) —
// deliberadamente parou aí, sem decidir como isso vira texto para o Claude
// ("output... suitable for LATER conversion into an LLM prompt"). Este é
// esse passo, e só este ficheiro o faz: serialização determinística,
// nenhuma chamada de rede, nenhum acesso a dados — só formata o que o
// Context Builder já calculou. Nunca inclui um campo que o AiContext não
// tenha (nada de "enriquecer" com um novo acesso à BD aqui).
// ============================================================================

import type {
  AiCategoryComparison,
  AiContext,
  AiCurrencySummary,
  AiDebtSummary,
  AiGoalSummary,
} from "@/lib/ai/context";

function renderCurrencySummary(summary: AiCurrencySummary): string {
  const lines = [
    `Em ${summary.currency}: saldo disponível ${summary.availableBalance}, património ${summary.netWorth}.`,
    `Este mês: receitas ${summary.monthlyIncome}, despesas ${summary.monthlyExpense}, fluxo de caixa ${summary.monthlyCashflow}` +
      (summary.savingsRatePercent === null ? "." : ` (taxa de poupança ${summary.savingsRatePercent}%).`),
  ];
  return lines.join(" ");
}

function renderCategoryComparison(comparison: AiCategoryComparison): string {
  const current = comparison.currentMonth.map((c) => `${c.categoryName}: ${c.amount}`).join(", ") || "sem despesas registadas";
  const previous = comparison.previousMonth.map((c) => `${c.categoryName}: ${c.amount}`).join(", ") || "sem despesas registadas";
  return `Categorias em ${comparison.currency} — este mês: ${current}. Mês anterior: ${previous}.`;
}

function renderDebt(debt: AiDebtSummary): string {
  const upcoming = debt.upcomingInstallments.map((i) => `${i.amount} em ${i.dueDate}`).join(", ") || "nenhuma";
  const overdue = debt.overdueInstallments.map((i) => `${i.amount} desde ${i.dueDate}`).join(", ") || "nenhuma";
  return `Dívida a ${debt.creditorName} (${debt.status}): falta pagar ${debt.remaining}. Próximas parcelas: ${upcoming}. Em atraso: ${overdue}.`;
}

function renderGoal(goal: AiGoalSummary): string {
  const projection =
    goal.estimatedCompletionDate === null
      ? "sem projeção (poucas contribuições recentes)"
      : `estimativa de conclusão ${goal.estimatedCompletionDate}${goal.onTrack === null ? "" : goal.onTrack ? " (dentro do prazo)" : " (fora do prazo)"}`;
  return `Meta "${goal.name}" (${goal.status}): ${goal.currentAmount} de ${goal.targetAmount} (${goal.progressPercent}%). ${projection}.`;
}

/**
 * Converte um AiContext (qualquer modo) em texto simples para o system
 * prompt. Determinístico: o mesmo AiContext produz sempre o mesmo texto.
 * Nunca inclui nada que não esteja já no AiContext (sem ids, sem dados de
 * autenticação — o Context Builder já garantiu isso).
 */
export function renderContextForPrompt(context: AiContext): string {
  const sections: string[] = [`Dados financeiros do utilizador (gerados em ${context.generatedAt}):`];

  if (context.summaries && context.summaries.length > 0) {
    sections.push(context.summaries.map(renderCurrencySummary).join(" "));
  }
  if (context.accounts && context.accounts.length > 0) {
    sections.push(
      "Contas: " + context.accounts.map((a) => `${a.name} (${a.type}, ${a.currency}): ${a.balance}`).join("; ") + ".",
    );
  }
  if (context.transactions && context.transactions.length > 0) {
    sections.push(
      "Transações: " +
        context.transactions
          .map((t) => `${t.date} — ${t.description} (${t.categoryName ?? "sem categoria"}): ${t.amount} [${t.type}]`)
          .join("; ") +
        ".",
    );
  }
  if (context.categoryComparison && context.categoryComparison.length > 0) {
    sections.push(context.categoryComparison.map(renderCategoryComparison).join(" "));
  }
  if (context.debts && context.debts.length > 0) {
    sections.push(context.debts.map(renderDebt).join(" "));
  }
  if (context.goals && context.goals.length > 0) {
    sections.push(context.goals.map(renderGoal).join(" "));
  }
  if (context.investments && context.investments.length > 0) {
    sections.push(
      "Investimentos: " +
        context.investments
          .map(
            (i) =>
              `${i.accountName} (${i.investmentType}): capital investido ${i.capitalContributed}` +
              (i.hasValuation ? `, valor atual ${i.currentValue} (${i.returnPercent}%)` : ", sem avaliação registada"),
          )
          .join("; ") +
        ".",
    );
  }

  if (sections.length === 1) {
    sections.push("Sem dados financeiros registados ainda.");
  }

  return sections.join("\n");
}

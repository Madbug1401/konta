// ============================================================================
// KONTA AI — Context Builder (Milestone 2).
//
// Ponto de entrada público: `buildAiContext(userId, options)`. Orquestra as
// duas camadas separadas deste módulo — collect.ts (I/O, ownership por
// userId via src/lib/db) e normalize.ts (puro, DTOs de src/lib/ai/context/
// types.ts) — e decide, a partir de `options.mode`, que secções do
// AiContext preencher. Nunca devolve um AccountRecord/TransactionRecord/
// DebtRecord/GoalRecord/UserRow em bruto — só os DTOs.
//
// [Segurança] `userId` tem de vir sempre de getSessionUser() no servidor
// (ver src/lib/auth/session.ts) — nunca de um campo do corpo do pedido, e
// nunca escolhido pelo modelo. Esta função não introduz um segundo mecanismo
// de autenticação: confia no `userId` recebido, exatamente como já fazem
// todas as funções de src/lib/db/*.ts. Quem a chamar é responsável por essa
// fronteira — no Milestone 1 (AI Gateway) essa chamada ainda não existe; este
// milestone entrega só o Context Builder, testado isoladamente (ver
// docs/konta-ai-design.html, "Do NOT connect to Anthropic yet").
//
// [Âmbito] Sem tools, sem escrita, sem memória, sem AI Action Log — ver
// docs/architecture/OVERVIEW.md para o estado exato deste milestone.
// ============================================================================

import { daysFromToday, getMonthBounds, getPreviousMonthBounds, getTodayInTimezone } from "@/lib/financial-engine";
import { collectFinancialData, type CollectNeeds } from "./collect";
import {
  buildAccountSummaries,
  buildCategoryComparison,
  buildCurrencySummaries,
  buildDebtSummaries,
  buildGoalSummaries,
  buildInvestmentSummaries,
  buildTransactionSummaries,
  GOAL_PROJECTION_LOOKBACK_DAYS,
} from "./normalize";
import { CONTEXT_DOMAINS, UnsupportedContextDomainError, type AiContext, type BuildContextOptions, type ContextDomain } from "./types";

const KNOWN_DOMAINS = new Set<string>(CONTEXT_DOMAINS);

function computeNeeds(options: BuildContextOptions): CollectNeeds {
  if (options.mode === "light") {
    return { accounts: true, ledger: true, categories: false, debts: false, goals: false, investments: false };
  }
  if (options.mode === "full") {
    return { accounts: true, ledger: true, categories: true, debts: true, goals: true, investments: false };
  }

  // mode === "directed": lista fechada de domínios — nunca um campo
  // arbitrário escolhido pelo chamador/modelo. Um domínio desconhecido, ou
  // uma lista vazia, é rejeitado aqui, ANTES de qualquer acesso à base de
  // dados (requisito 10 do milestone).
  const unknown = options.domains.filter((d) => !KNOWN_DOMAINS.has(d));
  if (unknown.length > 0 || options.domains.length === 0) {
    throw new UnsupportedContextDomainError(unknown.length > 0 ? unknown : []);
  }

  const domains = new Set<ContextDomain>(options.domains);
  return {
    // [Minimização — exemplo do próprio milestone] "Quanto tenho?" (domínio
    // "accounts") não deve arrastar dívidas/metas/investimentos; da mesma
    // forma, pedir só "transactions" ou só "debts" nunca chama listAccounts —
    // nenhum dos dois precisa da lista de contas para construir o seu DTO.
    accounts: domains.has("accounts") || domains.has("goals") || domains.has("investments"),
    ledger: domains.has("accounts") || domains.has("debts") || domains.has("goals") || domains.has("investments"),
    categories: domains.has("transactions"),
    debts: domains.has("debts"),
    goals: domains.has("goals"),
    investments: domains.has("investments"),
    directedTransactions: domains.has("transactions") ? (options.transactionFilters ?? {}) : undefined,
  };
}

/**
 * Constrói o contexto de IA para `userId`, no modo pedido. `now` existe só
 * para os testes serem determinísticos (mesmo padrão de `checkRateLimit` em
 * src/lib/rate-limit.ts) — em produção usa sempre o relógio real.
 */
export async function buildAiContext(userId: string, options: BuildContextOptions, now: Date = new Date()): Promise<AiContext> {
  const needs = computeNeeds(options);
  const snapshot = await collectFinancialData(userId, needs);

  const today = getTodayInTimezone(snapshot.timezone, now);
  const context: AiContext = { mode: options.mode, generatedAt: today };

  if (options.mode === "light") {
    const monthBounds = getMonthBounds(snapshot.timezone, now);
    context.summaries = buildCurrencySummaries(snapshot.accounts, snapshot.ledgerTransactions, snapshot.defaultCurrency, today, monthBounds);
    context.accounts = buildAccountSummaries(snapshot.accounts, snapshot.ledgerTransactions, today);
    return context;
  }

  if (options.mode === "full") {
    const monthBounds = getMonthBounds(snapshot.timezone, now);
    const previousMonthBounds = getPreviousMonthBounds(snapshot.timezone, now);
    const lookbackStart = daysFromToday(snapshot.timezone, -GOAL_PROJECTION_LOOKBACK_DAYS, now);

    context.summaries = buildCurrencySummaries(snapshot.accounts, snapshot.ledgerTransactions, snapshot.defaultCurrency, today, monthBounds);
    context.accounts = buildAccountSummaries(snapshot.accounts, snapshot.ledgerTransactions, today);
    context.categoryComparison = buildCategoryComparison(
      snapshot.accounts,
      snapshot.ledgerTransactions,
      snapshot.categories,
      snapshot.defaultCurrency,
      monthBounds,
      previousMonthBounds,
    );
    // [Decisão de minimização] Um resumo "full" automático mostra só o que
    // ainda está em curso — dívidas já pagas e metas já concluídas/abandonadas
    // não ajudam a resposta e são ruído. Um pedido "directed" explícito por
    // dívidas/metas (abaixo) não filtra por estado, porque aí o utilizador
    // pediu especificamente por esse domínio.
    context.debts = buildDebtSummaries(
      snapshot.debts.filter((d) => d.status !== "PAID_OFF"),
      snapshot.ledgerTransactions,
      today,
    );
    context.goals = buildGoalSummaries(
      snapshot.goals.filter((g) => g.status === "ACTIVE"),
      snapshot.accounts,
      snapshot.ledgerTransactions,
      today,
      lookbackStart,
      GOAL_PROJECTION_LOOKBACK_DAYS,
    );
    return context;
  }

  // mode === "directed"
  const lookbackStart = daysFromToday(snapshot.timezone, -GOAL_PROJECTION_LOOKBACK_DAYS, now);
  for (const domain of new Set(options.domains)) {
    if (domain === "accounts") {
      const monthBounds = getMonthBounds(snapshot.timezone, now);
      context.summaries = buildCurrencySummaries(snapshot.accounts, snapshot.ledgerTransactions, snapshot.defaultCurrency, today, monthBounds);
      context.accounts = buildAccountSummaries(snapshot.accounts, snapshot.ledgerTransactions, today);
    } else if (domain === "transactions") {
      context.transactions = buildTransactionSummaries(snapshot.directedTransactions, snapshot.categories);
    } else if (domain === "debts") {
      context.debts = buildDebtSummaries(snapshot.debts, snapshot.ledgerTransactions, today);
    } else if (domain === "goals") {
      context.goals = buildGoalSummaries(
        snapshot.goals,
        snapshot.accounts,
        snapshot.ledgerTransactions,
        today,
        lookbackStart,
        GOAL_PROJECTION_LOOKBACK_DAYS,
      );
    } else if (domain === "investments") {
      context.investments = buildInvestmentSummaries(snapshot.investmentAccounts, snapshot.ledgerTransactions);
    }
  }
  return context;
}

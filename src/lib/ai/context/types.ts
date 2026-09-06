// ============================================================================
// KONTA AI — Context Builder: contrato de tipos (Milestone 2).
//
// Este ficheiro é a fronteira de segurança em forma de tipo: nenhuma função
// deste módulo pode devolver nada que não esteja definido aqui. Nunca um
// AccountRecord/TransactionRecord/DebtRecord/GoalRecord/UserRow do
// src/lib/db ou src/lib/financial-engine "vaza" para fora do Context
// Builder — só os DTOs abaixo, deliberadamente mais pequenos.
//
// Ver docs/konta-ai-design.html, secção G ("Enviar o mínimo, nunca a base
// toda"): três modos — light, full, directed — nenhum outro.
// ============================================================================

import type { AccountType, DebtStatus, GoalStatus, InstallmentStatus, TransactionType } from "@/lib/financial-engine";

export type ContextMode = "light" | "full" | "directed";

/**
 * Domínios que o contexto "directed" pode pedir — uma lista fechada, nunca
 * campos arbitrários escolhidos pelo modelo. Adicionar um domínio novo é uma
 * decisão explícita (editar esta lista + normalize.ts), nunca algo que o
 * chamador possa inventar em runtime.
 */
export const CONTEXT_DOMAINS = ["accounts", "transactions", "debts", "goals", "investments"] as const;
export type ContextDomain = (typeof CONTEXT_DOMAINS)[number];

/** Filtros seguros para o domínio "transactions" — nunca id interno, nunca SQL livre. */
export interface DirectedTransactionFilters {
  from?: string; // ISODate
  to?: string; // ISODate
  type?: TransactionType;
}

export type BuildContextOptions =
  | { mode: "light" }
  | { mode: "full" }
  | { mode: "directed"; domains: ContextDomain[]; transactionFilters?: DirectedTransactionFilters };

export class UnsupportedContextDomainError extends Error {
  constructor(public readonly domains: string[]) {
    super(`Domínio(s) de contexto não suportado(s): ${domains.join(", ")}`);
    this.name = "UnsupportedContextDomainError";
  }
}

// ----------------------------------------------------------------------------
// DTOs — representação orientada a IA, nunca um objeto de base de dados.
//
// Cada valor monetário é uma string já formatada (via formatMinor, a mesma
// função usada pela UI) — nunca um bigint nem um par {amountMinor, currency}
// à parte. Isto evita duas classes de problema ao mesmo tempo: nenhum bigint
// tem de ser serializado/desserializado por quem consome isto, e o modelo
// nunca recebe um número em bruto para "fazer contas" — só o valor já
// calculado e já formatado pelo Financial Engine.
//
// Nenhum DTO abaixo tem `id`, `userId`, `createdAt`/`updatedAt`, ou qualquer
// campo de autenticação — deliberado, não um esquecimento (ver secção
// "Sensitive fields explicitly excluded" no relatório do milestone).
// ----------------------------------------------------------------------------

export interface AiCurrencySummary {
  currency: string;
  availableBalance: string;
  netWorth: string;
  monthlyIncome: string;
  monthlyExpense: string;
  monthlyCashflow: string;
  savingsRatePercent: number | null;
}

export interface AiAccountSummary {
  name: string;
  type: AccountType;
  currency: string;
  balance: string;
}

export interface AiTransactionSummary {
  type: TransactionType;
  amount: string;
  description: string;
  date: string;
  categoryName: string | null;
}

export interface AiCategoryAmount {
  categoryName: string;
  amount: string;
}

export interface AiCategoryComparison {
  currency: string;
  currentMonth: AiCategoryAmount[];
  previousMonth: AiCategoryAmount[];
}

export interface AiDebtInstallmentSummary {
  dueDate: string;
  amount: string;
  status: InstallmentStatus;
}

export interface AiDebtSummary {
  creditorName: string;
  currency: string;
  status: DebtStatus;
  remaining: string;
  upcomingInstallments: AiDebtInstallmentSummary[];
  overdueInstallments: AiDebtInstallmentSummary[];
}

export interface AiGoalSummary {
  name: string;
  currency: string;
  status: GoalStatus;
  targetAmount: string;
  targetDate: string | null;
  currentAmount: string;
  progressPercent: number;
  estimatedCompletionDate: string | null;
  onTrack: boolean | null;
}

export interface AiInvestmentSummary {
  accountName: string;
  investmentType: string;
  currency: string;
  capitalContributed: string;
  hasValuation: boolean;
  currentValue: string | null;
  returnPercent: number | null;
  asOfDate: string | null;
}

/**
 * A saída do Context Builder. Todos os campos são opcionais — qual deles vem
 * preenchido depende do `mode` pedido (ver builder.ts); nunca todos ao mesmo
 * tempo só "para garantir". `generatedAt` é sempre o "hoje" no timezone do
 * utilizador (nunca um timestamp de servidor em bruto — mesma regra já usada
 * em todo o Financial Engine).
 */
export interface AiContext {
  mode: ContextMode;
  generatedAt: string;
  summaries?: AiCurrencySummary[];
  accounts?: AiAccountSummary[];
  transactions?: AiTransactionSummary[];
  categoryComparison?: AiCategoryComparison[];
  debts?: AiDebtSummary[];
  goals?: AiGoalSummary[];
  investments?: AiInvestmentSummary[];
}

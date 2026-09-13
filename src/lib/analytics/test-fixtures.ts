// Fixtures partilhadas pelos testes de src/lib/analytics/*.test.ts — nunca
// importado por código de produção. Constrói um AnalyticsDataset mínimo em
// memória (sem base de dados), o mesmo princípio já usado pelos testes do
// Financial Engine (tudo determinístico, sem I/O).
import type { AccountRecord, DebtInstallmentRecord, DebtRecord, GoalRecord, RecurringTransactionRecord, TransactionRecord } from "@/lib/financial-engine";
import type { CategoryRow } from "@/lib/db/categories";
import type { DebtWithInstallments } from "@/lib/db/debts";
import type { AnalyticsDataset } from "./dataset";
import type { PeriodRange } from "./periods";
import type { AnalyticsFilters } from "./types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: overrides.id ?? nextId("acc"),
    userId: "user-1",
    name: "Carteira",
    type: "WALLET",
    currency: "CVE",
    initialBalanceMinor: 0n,
    isArchived: false,
    color: null,
    ...overrides,
  };
}

export function makeTransaction(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: overrides.id ?? nextId("tx"),
    userId: "user-1",
    type: "EXPENSE",
    status: "COMPLETED",
    accountId: "acc-1",
    destinationAccountId: null,
    amountMinor: 1000n,
    currency: "CVE",
    categoryId: null,
    description: "Transação",
    date: "2026-09-10",
    debtId: null,
    debtInstallmentId: null,
    goalId: null,
    recurringTransactionId: null,
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return { id: overrides.id ?? nextId("cat"), name: "Categoria", kind: "EXPENSE", isSystem: false, ...overrides };
}

export function makeDebt(overrides: Partial<DebtRecord> = {}, installments: DebtInstallmentRecord[] = []): DebtWithInstallments {
  return {
    id: overrides.id ?? nextId("debt"),
    userId: "user-1",
    creditorName: "João",
    description: null,
    currency: "CVE",
    originalAmountMinor: 10_000n,
    interestRate: null,
    status: "ACTIVE",
    startDate: "2026-01-01",
    finalDueDate: null,
    installments,
    ...overrides,
  };
}

export function makeInstallment(overrides: Partial<DebtInstallmentRecord> = {}): DebtInstallmentRecord {
  return {
    id: overrides.id ?? nextId("inst"),
    debtId: "debt-1",
    sequence: 1,
    dueDate: "2026-09-15",
    amountMinor: 1000n,
    status: "PENDING",
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<GoalRecord> = {}): GoalRecord {
  return {
    id: overrides.id ?? nextId("goal"),
    userId: "user-1",
    name: "Laptop",
    description: null,
    currency: "CVE",
    targetAmountMinor: 100_000n,
    targetDate: null,
    linkedAccountId: null,
    status: "ACTIVE",
    ...overrides,
  };
}

export function makeRecurring(overrides: Partial<RecurringTransactionRecord> = {}): RecurringTransactionRecord {
  return {
    id: overrides.id ?? nextId("rec"),
    userId: "user-1",
    type: "EXPENSE",
    accountId: "acc-1",
    destinationAccountId: null,
    amountMinor: 1000n,
    currency: "CVE",
    categoryId: null,
    description: "Renda",
    frequency: "MONTHLY",
    interval: 1,
    startDate: "2026-01-01",
    endDate: null,
    occurrencesTotal: null,
    occurrencesGenerated: 0,
    nextRunDate: "2026-10-01",
    isActive: true,
    ...overrides,
  };
}

export const PERIOD: PeriodRange = { start: "2026-09-01", end: "2026-09-30", label: "Setembro de 2026" };
export const COMPARISON_PERIOD: PeriodRange = { start: "2026-08-01", end: "2026-08-31", label: "Agosto de 2026" };

export function makeFilters(overrides: Partial<AnalyticsFilters> = {}): AnalyticsFilters {
  return {
    period: PERIOD,
    comparisonMode: "previous_period",
    comparisonPeriod: COMPARISON_PERIOD,
    currency: "CVE",
    ...overrides,
  };
}

export function makeDataset(overrides: Partial<AnalyticsDataset> = {}): AnalyticsDataset {
  return {
    userId: "user-1",
    timezone: "Atlantic/Cape_Verde",
    defaultCurrency: "CVE",
    accounts: [makeAccount({ id: "acc-1" })],
    transactions: [],
    categories: [],
    debts: [],
    goals: [],
    recurring: [],
    investmentAccounts: [],
    ...overrides,
  };
}

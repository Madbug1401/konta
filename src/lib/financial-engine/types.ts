// ============================================================================
// Tipos de domínio do Financial Engine.
//
// [DECISÃO 12] Estes tipos são deliberadamente "planos" (plain objects) e não
// importam nada de @prisma/client. O Financial Engine não sabe o que é uma
// base de dados — recebe arrays de dados já carregados e devolve resultados
// calculados. Isto é o que torna esta camada:
//   - testável sem qualquer base de dados (ver *.test.ts, tudo corre em
//     memória, sem Postgres);
//   - reutilizável tal e qual pela API web, por um futuro app mobile, por um
//     job agendado (ex: gerar próximas ocorrências recorrentes) e pelo futuro
//     agente de IA (secção 16 e 23 do briefing do produto).
// A camada de acesso a dados (src/lib/db) é responsável por buscar as linhas
// da base de dados e passá-las para estas funções — nunca o contrário.
// ============================================================================

export type AccountType =
  | "WALLET"
  | "BANK"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "INVESTMENT"
  | "EMERGENCY_FUND"
  | "OTHER";

export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";
export type TransactionStatus = "COMPLETED" | "PENDING" | "CANCELED";
export type CategoryKind = "INCOME" | "EXPENSE";
export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type DebtStatus = "ACTIVE" | "PAID_OFF" | "DEFAULTED";
export type InstallmentStatus = "PENDING" | "PAID" | "OVERDUE";
export type GoalStatus = "ACTIVE" | "ACHIEVED" | "ABANDONED";

/** Valor monetário em unidade mínima (ex: cêntimos). NUNCA usar float/number para dinheiro. */
export type MinorAmount = bigint;

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalanceMinor: MinorAmount;
  isArchived: boolean;
  // Id de uma cor da paleta curada (ver src/lib/account-colors.ts), não um
  // hex livre — null para contas criadas antes desta funcionalidade existir.
  color: string | null;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: MinorAmount;
  currency: string;
  categoryId: string | null;
  description: string;
  /** Dia local (YYYY-MM-DD), já resolvido no timezone do utilizador. */
  date: string;
  debtId: string | null;
  debtInstallmentId: string | null;
  goalId: string | null;
  recurringTransactionId: string | null;
}

export interface DebtRecord {
  id: string;
  userId: string;
  // [Correção — implementação da interface de Dívidas] Estes três campos
  // (creditorName, description, currency) existem no schema desde o
  // início, mas não estavam neste tipo porque o Financial Engine em si
  // nunca precisou deles para calcular nada. Ficam aqui agora para que
  // exista um único tipo `DebtRecord` de ponta a ponta (DB → API → UI),
  // tal como `AccountRecord` já faz — em vez de um segundo tipo paralelo
  // só para apresentação.
  creditorName: string;
  description: string | null;
  currency: string;
  originalAmountMinor: MinorAmount;
  interestRate: number | null;
  status: DebtStatus;
  startDate: string;
  finalDueDate: string | null;
}

export interface DebtInstallmentRecord {
  id: string;
  debtId: string;
  sequence: number;
  dueDate: string;
  amountMinor: MinorAmount;
  status: InstallmentStatus;
}

export interface GoalRecord {
  id: string;
  userId: string;
  // Mesma razão do DebtRecord acima: campos de apresentação que já existem
  // no schema, agora incluídos no tipo único da entidade.
  name: string;
  description: string | null;
  currency: string;
  targetAmountMinor: MinorAmount;
  targetDate: string | null;
  linkedAccountId: string | null;
  status: GoalStatus;
}

export interface RecurringTransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: MinorAmount;
  categoryId: string | null;
  description: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  occurrencesTotal: number | null;
  occurrencesGenerated: number;
  nextRunDate: string;
  isActive: boolean;
}

export interface InvestmentValuationRecord {
  id: string;
  investmentDetailId: string;
  date: string;
  valueMinor: MinorAmount;
}

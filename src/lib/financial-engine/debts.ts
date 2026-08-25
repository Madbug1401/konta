// ============================================================================
// Dívidas e plano de parcelas.
//
// [DECISÃO 8/9] Corrige o bug da auditoria em
// `installment * occurrences !== total` (comparação de floats). Aqui o plano
// de parcelas é GERADO por divisão inteira exata (splitIntoInstallments),
// nunca introduzido livremente pelo utilizador e depois "validado" por
// igualdade — a soma bate certo por construção, sempre.
// ============================================================================

import { addRecurrenceInterval, type ISODate } from "./datetime";
import { splitIntoInstallments, sum } from "./money";
import type { DebtInstallmentRecord, DebtRecord, MinorAmount, TransactionRecord } from "./types";

export interface GeneratedInstallment {
  sequence: number;
  dueDate: ISODate;
  amountMinor: MinorAmount;
}

export function generateInstallmentPlan(
  totalMinor: MinorAmount,
  count: number,
  startDate: ISODate,
  frequency: "MONTHLY" | "WEEKLY" | "DAILY" | "YEARLY" = "MONTHLY",
): GeneratedInstallment[] {
  const amounts = splitIntoInstallments(totalMinor, count);
  return amounts.map((amountMinor, i) => ({
    sequence: i + 1,
    dueDate: i === 0 ? startDate : addRecurrenceInterval(startDate, frequency, i),
    amountMinor,
  }));
}

/** Saldo em dívida = valor original - soma dos pagamentos já registados (nunca um campo gravado à parte). */
export function getDebtRemaining(
  debt: DebtRecord,
  payments: TransactionRecord[],
): MinorAmount {
  const paid = sum(
    payments.filter((p) => p.debtId === debt.id && p.status === "COMPLETED").map((p) => p.amountMinor),
  );
  return debt.originalAmountMinor - paid;
}

export function getUpcomingInstallments(
  installments: DebtInstallmentRecord[],
  todayIso: ISODate,
  withinDays = 30,
): DebtInstallmentRecord[] {
  const limit = addRecurrenceInterval(todayIso, "DAILY", withinDays);
  return installments
    .filter((i) => i.status !== "PAID" && i.dueDate >= todayIso && i.dueDate <= limit)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getOverdueInstallments(
  installments: DebtInstallmentRecord[],
  todayIso: ISODate,
): DebtInstallmentRecord[] {
  return installments.filter((i) => i.status === "PENDING" && i.dueDate < todayIso);
}

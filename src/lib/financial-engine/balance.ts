// ============================================================================
// Saldo de contas ("ledger").
//
// [DECISÃO 3] Corrige diretamente o bug da auditoria em que o Cofre de
// Emergência somava o VALOR ABSOLUTO de cada movimento (transformando um
// levantamento negativo em positivo). Aqui não existe "valor com sinal
// ambíguo": toda a Transaction tem um `type` explícito (INCOME/EXPENSE/
// TRANSFER) e o saldo de uma conta é sempre:
//
//   saldo = saldoInicial + entradas - saídas
//
// onde "entrada"/"saída" depende só do papel da conta na transação
// (accountId vs destinationAccountId), nunca do sinal de `amountMinor`
// (que é sempre >= 0). Um levantamento do cofre de emergência é uma TRANSFER
// em que o cofre é a conta de origem — reduz o saldo do cofre por construção,
// sem qualquer Math.abs() a inverter o efeito.
// ============================================================================

import { sum } from "./money";
import type { AccountRecord, MinorAmount, TransactionRecord } from "./types";

/** Transações que já aconteceram (COMPLETED) até uma certa data local (inclusive). */
function relevantTransactions(
  transactions: TransactionRecord[],
  accountId: string,
  asOfDate?: string,
): TransactionRecord[] {
  return transactions.filter((t) => {
    if (t.status !== "COMPLETED") return false;
    if (asOfDate && t.date > asOfDate) return false;
    return t.accountId === accountId || t.destinationAccountId === accountId;
  });
}

/**
 * Saldo de UMA conta, calculado a partir do razão de transações — nunca
 * lido de um campo "saldo atual" gravado (que poderia dessincronizar).
 */
export function getAccountBalance(
  account: AccountRecord,
  transactions: TransactionRecord[],
  asOfDate?: string,
): MinorAmount {
  let balance = account.initialBalanceMinor;
  for (const t of relevantTransactions(transactions, account.id, asOfDate)) {
    const isIncoming = t.type === "INCOME" ? t.accountId === account.id : t.destinationAccountId === account.id;
    const isOutgoing =
      (t.type === "EXPENSE" && t.accountId === account.id) ||
      (t.type === "TRANSFER" && t.accountId === account.id);

    if (isIncoming) balance += t.amountMinor;
    else if (isOutgoing) balance -= t.amountMinor;
  }
  return balance;
}

/** Saldo disponível = soma de todas as contas "líquidas" (exclui investimento e dívida de cartão, que têm semântica própria). */
export function getNetWorth(
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  asOfDate?: string,
): MinorAmount {
  const balances = accounts
    .filter((a) => !a.isArchived)
    .map((a) => getAccountBalance(a, transactions, asOfDate));
  return sum(balances);
}

export function getAvailableBalance(
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  asOfDate?: string,
): MinorAmount {
  const spendable = accounts.filter(
    (a) => !a.isArchived && (a.type === "WALLET" || a.type === "BANK"),
  );
  return sum(spendable.map((a) => getAccountBalance(a, transactions, asOfDate)));
}

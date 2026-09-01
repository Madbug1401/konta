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

    // [Correção — bug crítico encontrado em auditoria Go-to-Beta, 29/08/2026]
    // Isto era "if / else if": para uma TRANSFER em que accountId ===
    // destinationAccountId (auto-transferência), isIncoming e isOutgoing
    // eram AMBOS verdadeiros, mas só o ramo isIncoming corria — a conta
    // ganhava amountMinor do nada, sem a dedução correspondente. A defesa
    // principal é rejeitar isto na API (ver CreateTransactionSchema em
    // src/app/api/transactions/route.ts), mas o Financial Engine é a fonte
    // de verdade partilhada por Web/Mobile/relatórios/IA — não deve poder
    // ser enganado por um registo destas, seja qual for a origem dele. Com
    // dois `if` independentes, uma auto-transferência soma e subtrai o
    // mesmo valor e o efeito líquido é zero, por construção; para todos os
    // outros casos (já cobertos pelos testes existentes) isIncoming e
    // isOutgoing nunca são verdadeiros ao mesmo tempo, por isso este troca
    // não muda nenhum comportamento anterior.
    if (isIncoming) balance += t.amountMinor;
    if (isOutgoing) balance -= t.amountMinor;
  }
  return balance;
}

/** Saldo disponível = soma de todas as contas "líquidas" (exclui investimento e dívida de cartão, que têm semântica própria).
 *
 * [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] `currency`
 * é opcional e, quando passado, restringe a soma às contas dessa moeda —
 * nunca se soma CVE com EUR como se fosse o mesmo número (o motor não faz
 * conversão cambial em lado nenhum). Quem só tem contas numa moeda não
 * precisa de passar nada e o comportamento é exatamente o de antes desta
 * funcionalidade existir. A página que chama isto (Dashboard) é responsável
 * por descobrir as moedas em uso e chamar esta função uma vez por moeda.
 */
export function getNetWorth(
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  asOfDate?: string,
  currency?: string,
): MinorAmount {
  const balances = accounts
    .filter((a) => !a.isArchived && (currency === undefined || a.currency === currency))
    .map((a) => getAccountBalance(a, transactions, asOfDate));
  return sum(balances);
}

export function getAvailableBalance(
  accounts: AccountRecord[],
  transactions: TransactionRecord[],
  asOfDate?: string,
  currency?: string,
): MinorAmount {
  const spendable = accounts.filter(
    (a) =>
      !a.isArchived &&
      (a.type === "WALLET" || a.type === "BANK") &&
      (currency === undefined || a.currency === currency),
  );
  return sum(spendable.map((a) => getAccountBalance(a, transactions, asOfDate)));
}

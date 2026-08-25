import type { TransactionRecord, TransactionType } from "@/lib/financial-engine";
import { getPool, toBigInt, toISODateString } from "./client";

export interface ListTransactionsFilter {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  from?: string; // ISODate
  to?: string; // ISODate
  search?: string;
  limit?: number;
  offset?: number;
}

// [DECISÃO 12 do briefing] Página de histórico completo com pesquisa e
// filtros — corrige a lacuna da auditoria em que só os 10 próximos eventos
// eram visíveis. Esta função suporta todos os filtros pedidos na secção 12.
export async function listTransactions(
  userId: string,
  filter: ListTransactionsFilter = {},
): Promise<TransactionRecord[]> {
  const conditions: string[] = [`"userId" = $1`];
  const params: Array<string | number> = [userId];

  if (filter.accountId) {
    params.push(filter.accountId);
    conditions.push(`("accountId" = $${params.length} OR "destinationAccountId" = $${params.length})`);
  }
  if (filter.categoryId) {
    params.push(filter.categoryId);
    conditions.push(`"categoryId" = $${params.length}`);
  }
  if (filter.type) {
    params.push(filter.type);
    conditions.push(`type = $${params.length}`);
  }
  if (filter.from) {
    params.push(filter.from);
    conditions.push(`date >= $${params.length}`);
  }
  if (filter.to) {
    params.push(filter.to);
    conditions.push(`date <= $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`description ILIKE $${params.length}`);
  }

  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await getPool().query(
    `SELECT id, "userId", type, status, "accountId", "destinationAccountId", "amountMinor",
            currency, "categoryId", description, date, "debtId", "debtInstallmentId",
            "goalId", "recurringTransactionId"
     FROM "Transaction"
     WHERE ${conditions.join(" AND ")}
     ORDER BY date DESC, "createdAt" DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(mapTransaction);
}

export async function createTransaction(input: {
  userId: string;
  type: TransactionType;
  accountId: string;
  destinationAccountId?: string | null;
  amountMinor: bigint;
  currency: string;
  categoryId?: string | null;
  description: string;
  date: string;
  debtId?: string | null;
  goalId?: string | null;
  recurringTransactionId?: string | null;
}): Promise<TransactionRecord> {
  const { rows } = await getPool().query(
    `INSERT INTO "Transaction"
       (id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
        "categoryId", description, date, "debtId", "goalId", "recurringTransactionId")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, "userId", type, status, "accountId", "destinationAccountId", "amountMinor",
               currency, "categoryId", description, date, "debtId", "debtInstallmentId",
               "goalId", "recurringTransactionId"`,
    [
      input.userId,
      input.type,
      input.accountId,
      input.destinationAccountId ?? null,
      input.amountMinor.toString(),
      input.currency,
      input.categoryId ?? null,
      input.description,
      input.date,
      input.debtId ?? null,
      input.goalId ?? null,
      input.recurringTransactionId ?? null,
    ],
  );
  return mapTransaction(rows[0]);
}

export async function getTransactionById(userId: string, id: string): Promise<TransactionRecord | null> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", type, status, "accountId", "destinationAccountId", "amountMinor",
            currency, "categoryId", description, date, "debtId", "debtInstallmentId",
            "goalId", "recurringTransactionId"
     FROM "Transaction" WHERE "userId" = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function updateTransaction(
  userId: string,
  id: string,
  patch: { amountMinor?: bigint; categoryId?: string | null; description?: string; date?: string },
): Promise<TransactionRecord | null> {
  const { rows } = await getPool().query(
    `UPDATE "Transaction" SET
       "amountMinor" = COALESCE($3, "amountMinor"),
       "categoryId" = COALESCE($4, "categoryId"),
       description = COALESCE($5, description),
       date = COALESCE($6, date),
       "updatedAt" = now()
     WHERE "userId" = $1 AND id = $2
     RETURNING id, "userId", type, status, "accountId", "destinationAccountId", "amountMinor",
               currency, "categoryId", description, date, "debtId", "debtInstallmentId",
               "goalId", "recurringTransactionId"`,
    [userId, id, patch.amountMinor?.toString() ?? null, patch.categoryId ?? null, patch.description ?? null, patch.date ?? null],
  );
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  const result = await getPool().query(`DELETE FROM "Transaction" WHERE "userId" = $1 AND id = $2`, [userId, id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Todas as transações COMPLETED de um utilizador, sem paginação — usada
 * exclusivamente pelo Financial Engine para calcular saldos/patrimónios.
 * Não deve ser usada para listagens visíveis ao utilizador (usar
 * listTransactions, que pagina e filtra).
 */
export async function listAllTransactionsForBalances(userId: string): Promise<TransactionRecord[]> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", type, status, "accountId", "destinationAccountId", "amountMinor",
            currency, "categoryId", description, date, "debtId", "debtInstallmentId",
            "goalId", "recurringTransactionId"
     FROM "Transaction"
     WHERE "userId" = $1 AND status = 'COMPLETED'`,
    [userId],
  );
  return rows.map(mapTransaction);
}

interface TransactionRow {
  id: string;
  userId: string;
  type: TransactionRecord["type"];
  status: TransactionRecord["status"];
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: string;
  currency: string;
  categoryId: string | null;
  description: string;
  date: Date | string;
  debtId: string | null;
  debtInstallmentId: string | null;
  goalId: string | null;
  recurringTransactionId: string | null;
}

function mapTransaction(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    status: row.status,
    accountId: row.accountId,
    destinationAccountId: row.destinationAccountId,
    amountMinor: toBigInt(row.amountMinor),
    currency: row.currency,
    categoryId: row.categoryId,
    description: row.description,
    date: toISODateString(row.date),
    debtId: row.debtId,
    debtInstallmentId: row.debtInstallmentId,
    goalId: row.goalId,
    recurringTransactionId: row.recurringTransactionId,
  };
}

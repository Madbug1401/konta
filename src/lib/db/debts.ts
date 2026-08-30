// ============================================================================
// Dívidas e parcelas.
//
// [Correção — implementação da interface de Dívidas] Duas operações aqui
// (criar uma dívida com o seu plano de parcelas, e pagar uma parcela) tocam
// mais do que uma tabela e têm de ser atómicas — ou tudo fica gravado, ou
// nada fica. Esta é a primeira vez neste ficheiro-tipo (src/lib/db/*.ts) que
// se usa uma transação SQL explícita (BEGIN/COMMIT/ROLLBACK via
// pool.connect()) em vez de uma única query — até agora nenhuma operação
// precisava de mais do que uma escrita. Ver DECISIONS.md.
// ============================================================================

import {
  generateInstallmentPlan,
  type DebtInstallmentRecord,
  type DebtRecord,
  type DebtStatus,
  type InstallmentStatus,
  type MinorAmount,
} from "@/lib/financial-engine";
import { getPool, toBigInt, toISODateString } from "./client";
import { createTransaction } from "./transactions";

export interface DebtWithInstallments extends DebtRecord {
  installments: DebtInstallmentRecord[];
}

export async function listDebts(userId: string): Promise<DebtWithInstallments[]> {
  const { rows: debtRows } = await getPool().query(
    `SELECT id, "userId", "creditorName", description, "originalAmountMinor", currency,
            "interestRate", status, "startDate", "finalDueDate"
     FROM "Debt" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId],
  );
  if (debtRows.length === 0) return [];

  const debtIds = debtRows.map((r) => r.id as string);
  const { rows: installmentRows } = await getPool().query(
    `SELECT id, "debtId", sequence, "dueDate", "amountMinor", status
     FROM "DebtInstallment" WHERE "debtId" = ANY($1::text[]) ORDER BY sequence ASC`,
    [debtIds],
  );

  const installmentsByDebt = new Map<string, DebtInstallmentRecord[]>();
  for (const row of installmentRows) {
    const installment = mapInstallment(row);
    const list = installmentsByDebt.get(installment.debtId) ?? [];
    list.push(installment);
    installmentsByDebt.set(installment.debtId, list);
  }

  return debtRows.map((row) => ({
    ...mapDebt(row),
    installments: installmentsByDebt.get(row.id) ?? [],
  }));
}

export async function createDebtWithInstallments(input: {
  userId: string;
  creditorName: string;
  description?: string | null;
  originalAmountMinor: MinorAmount;
  currency?: string;
  interestRate?: number | null;
  startDate: string;
  installmentCount: number;
  frequency?: "MONTHLY" | "WEEKLY" | "DAILY" | "YEARLY";
}): Promise<DebtWithInstallments> {
  const currency = input.currency ?? "CVE";
  const frequency = input.frequency ?? "MONTHLY";
  // [Correção — implementação da interface de Dívidas] `finalDueDate` nunca
  // é um valor pedido ao utilizador — é sempre a data da última parcela
  // gerada por `generateInstallmentPlan` (já existente e testado no
  // Financial Engine), para nunca haver duas fontes de verdade para a mesma
  // informação.
  const plan = generateInstallmentPlan(input.originalAmountMinor, input.installmentCount, input.startDate, frequency);
  const finalDueDate = plan[plan.length - 1]?.dueDate ?? input.startDate;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: debtRows } = await client.query(
      `INSERT INTO "Debt"
         (id, "userId", "creditorName", description, "originalAmountMinor", currency,
          "interestRate", "startDate", "finalDueDate")
       VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, "userId", "creditorName", description, "originalAmountMinor", currency,
                 "interestRate", status, "startDate", "finalDueDate"`,
      [
        input.userId,
        input.creditorName,
        input.description ?? null,
        input.originalAmountMinor.toString(),
        currency,
        input.interestRate ?? null,
        input.startDate,
        finalDueDate,
      ],
    );
    const debt = mapDebt(debtRows[0]);

    const installments: DebtInstallmentRecord[] = [];
    for (const item of plan) {
      const { rows } = await client.query(
        `INSERT INTO "DebtInstallment" (id, "debtId", sequence, "dueDate", "amountMinor")
         VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4)
         RETURNING id, "debtId", sequence, "dueDate", "amountMinor", status`,
        [debt.id, item.sequence, item.dueDate, item.amountMinor.toString()],
      );
      installments.push(mapInstallment(rows[0]));
    }

    await client.query("COMMIT");
    return { ...debt, installments };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export class InstallmentNotPayableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallmentNotPayableError";
  }
}

/**
 * Paga uma parcela: cria a Transaction de despesa correspondente (ligada à
 * dívida e à parcela exata via debtId/debtInstallmentId), marca a parcela
 * como PAID e, se era a última por pagar, fecha a dívida (status PAID_OFF).
 * Tudo dentro de uma única transação SQL — nunca deixa a parcela marcada
 * como paga sem o registo do pagamento (Transaction) existir, nem
 * vice-versa.
 */
export async function payInstallment(
  userId: string,
  debtId: string,
  installmentId: string,
  input: { accountId: string; date: string },
): Promise<{ debt: DebtRecord; installment: DebtInstallmentRecord }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // [Correção — implementação da interface de Dívidas] Bloqueia a linha
    // (FOR UPDATE) e cruza sempre com o userId — nunca confiar num
    // debtId/installmentId vindo do cliente sem confirmar que pertence
    // mesmo ao utilizador autenticado (regra 6 do briefing, mesmo padrão já
    // usado em src/lib/db/accounts.ts e transactions.ts).
    const { rows: found } = await client.query(
      `SELECT d.id AS "debtId", d."userId", d."creditorName", d.description, d."originalAmountMinor",
              d.currency, d."interestRate", d.status AS "debtStatus", d."startDate", d."finalDueDate",
              i.id AS "installmentId", i.sequence, i."dueDate", i."amountMinor", i.status AS "installmentStatus",
              (SELECT COUNT(*) FROM "DebtInstallment" WHERE "debtId" = d.id) AS "totalInstallments"
       FROM "DebtInstallment" i
       JOIN "Debt" d ON d.id = i."debtId"
       WHERE i.id = $1 AND d.id = $2 AND d."userId" = $3
       FOR UPDATE OF i, d`,
      [installmentId, debtId, userId],
    );
    const row = found[0];
    if (!row) {
      throw new InstallmentNotPayableError("Parcela não encontrada.");
    }
    if (row.installmentStatus !== "PENDING") {
      throw new InstallmentNotPayableError("Esta parcela já está paga.");
    }

    await createTransaction(
      {
        userId,
        type: "EXPENSE",
        accountId: input.accountId,
        amountMinor: toBigInt(row.amountMinor),
        currency: row.currency,
        description: `Parcela ${row.sequence}/${row.totalInstallments} — ${row.creditorName}`,
        date: input.date,
        debtId,
        debtInstallmentId: installmentId,
      },
      client,
    );

    const { rows: updatedInstallmentRows } = await client.query(
      `UPDATE "DebtInstallment" SET status = 'PAID', "updatedAt" = now()
       WHERE id = $1
       RETURNING id, "debtId", sequence, "dueDate", "amountMinor", status`,
      [installmentId],
    );

    const { rows: remaining } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "DebtInstallment" WHERE "debtId" = $1 AND status != 'PAID'`,
      [debtId],
    );
    let debtStatus: DebtStatus = row.debtStatus;
    if (remaining[0].count === 0) {
      debtStatus = "PAID_OFF";
      await client.query(`UPDATE "Debt" SET status = 'PAID_OFF', "updatedAt" = now() WHERE id = $1`, [debtId]);
    }

    await client.query("COMMIT");

    return {
      debt: mapDebt({ ...row, id: row.debtId, status: debtStatus }),
      installment: mapInstallment(updatedInstallmentRows[0]),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface DebtRow {
  id: string;
  userId: string;
  creditorName: string;
  description: string | null;
  originalAmountMinor: string;
  currency: string;
  interestRate: string | null;
  status: DebtStatus;
  startDate: Date | string;
  finalDueDate: Date | string | null;
}

function mapDebt(row: DebtRow): DebtRecord {
  return {
    id: row.id,
    userId: row.userId,
    creditorName: row.creditorName,
    description: row.description,
    originalAmountMinor: toBigInt(row.originalAmountMinor),
    currency: row.currency,
    interestRate: row.interestRate !== null ? parseFloat(row.interestRate) : null,
    status: row.status,
    startDate: toISODateString(row.startDate),
    finalDueDate: row.finalDueDate !== null ? toISODateString(row.finalDueDate) : null,
  };
}

interface DebtInstallmentRow {
  id: string;
  debtId: string;
  sequence: number;
  dueDate: Date | string;
  amountMinor: string;
  status: InstallmentStatus;
}

function mapInstallment(row: DebtInstallmentRow): DebtInstallmentRecord {
  return {
    id: row.id,
    debtId: row.debtId,
    sequence: row.sequence,
    dueDate: toISODateString(row.dueDate),
    amountMinor: toBigInt(row.amountMinor),
    status: row.status,
  };
}

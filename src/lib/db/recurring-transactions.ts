// ============================================================================
// Transações Recorrentes.
//
// [Fase 4 — Recorrências] Este projeto já recusou jobs de fundo mais do que
// uma vez (ex: "atrasada" em Dívidas é sempre calculado em direto, nunca por
// um job que muda status) — recorrências seguem a mesma filosofia:
// `materializeDueOccurrences` NÃO é um cron job, é chamada em direto no
// pedido HTTP (uma única vez, em src/app/(app)/layout.tsx, logo a seguir à
// verificação de sessão) sempre que alguém navega na Web. Custo zero para
// quem não tem séries ativas (uma só SELECT indexada em nextRunDate/isActive
// — ver @@index no schema).
// ============================================================================

import {
  advanceSeries,
  computeNextRunDate,
  type RecurrenceFrequency,
  type RecurringTransactionRecord,
  type TransactionType,
} from "@/lib/financial-engine";
import { logError, logInfo } from "@/lib/logger";
import { getPool, toBigInt, toISODateString } from "./client";
import { createTransaction } from "./transactions";

export async function listRecurringTransactions(userId: string): Promise<RecurringTransactionRecord[]> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
            "categoryId", description, frequency, interval, "startDate", "endDate",
            "occurrencesTotal", "occurrencesGenerated", "nextRunDate", "isActive"
     FROM "RecurringTransaction" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId],
  );
  return rows.map(mapRecurring);
}

export async function getRecurringTransactionById(userId: string, id: string): Promise<RecurringTransactionRecord | null> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
            "categoryId", description, frequency, interval, "startDate", "endDate",
            "occurrencesTotal", "occurrencesGenerated", "nextRunDate", "isActive"
     FROM "RecurringTransaction" WHERE "userId" = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRecurring(rows[0]) : null;
}

export async function createRecurringTransaction(input: {
  userId: string;
  type: TransactionType;
  accountId: string;
  destinationAccountId?: string | null;
  amountMinor: bigint;
  currency: string;
  categoryId?: string | null;
  description: string;
  frequency: RecurrenceFrequency;
  interval?: number;
  startDate: string;
  endDate?: string | null;
  occurrencesTotal?: number | null;
}): Promise<RecurringTransactionRecord> {
  // [Fase 4 — Recorrências] `nextRunDate` começa sempre em `startDate` — a
  // primeira ocorrência só é materializada (por materializeDueOccurrences)
  // quando alguém navegar na Web num dia >= startDate, nunca gravada aqui
  // como uma Transaction já existente.
  const { rows } = await getPool().query(
    `INSERT INTO "RecurringTransaction"
       (id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
        "categoryId", description, frequency, interval, "startDate", "endDate",
        "occurrencesTotal", "nextRunDate")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $11)
     RETURNING id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
               "categoryId", description, frequency, interval, "startDate", "endDate",
               "occurrencesTotal", "occurrencesGenerated", "nextRunDate", "isActive"`,
    [
      input.userId,
      input.type,
      input.accountId,
      input.destinationAccountId ?? null,
      input.amountMinor.toString(),
      input.currency,
      input.categoryId ?? null,
      input.description,
      input.frequency,
      input.interval ?? 1,
      input.startDate,
      input.endDate ?? null,
      input.occurrencesTotal ?? null,
    ],
  );
  return mapRecurring(rows[0]);
}

// [Fase 4 — Recorrências] Pausar/retomar é o mecanismo escolhido em vez de
// eliminar uma série — mesma filosofia de arquivar uma Conta (Fase 3):
// sem isto, uma série só poderia ficar ativa para sempre ou desaparecer.
export async function setRecurringTransactionActive(
  userId: string,
  id: string,
  isActive: boolean,
): Promise<RecurringTransactionRecord | null> {
  const { rows } = await getPool().query(
    `UPDATE "RecurringTransaction" SET "isActive" = $3, "updatedAt" = now()
     WHERE "userId" = $1 AND id = $2
     RETURNING id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
               "categoryId", description, frequency, interval, "startDate", "endDate",
               "occurrencesTotal", "occurrencesGenerated", "nextRunDate", "isActive"`,
    [userId, id, isActive],
  );
  return rows[0] ? mapRecurring(rows[0]) : null;
}

// Salvaguarda contra uma série esquecida há anos (ex: diária, nunca aberta
// na Web) gerar milhares de Transactions de uma só vez num único pedido.
// Ocorrências além deste limite ficam para o próximo pedido — nunca
// perdidas, `nextRunDate` só avança pelas que forem mesmo geradas.
const MAX_OCCURRENCES_PER_REQUEST = 24;

/**
 * Materializa (cria as Transactions reais de) todas as ocorrências em
 * atraso de todas as séries ativas do utilizador, até `todayIso`. Chamada
 * em direto no pedido HTTP — ver comentário no topo do ficheiro.
 *
 * Cada série é processada na sua própria transação SQL: uma série com
 * problema (ex: conta entretanto arquivada) nunca bloqueia as outras — o
 * erro fica registado e o ciclo continua para a série seguinte.
 */
export async function materializeDueOccurrences(userId: string, todayIso: string): Promise<void> {
  const { rows } = await getPool().query(
    `SELECT id FROM "RecurringTransaction" WHERE "userId" = $1 AND "isActive" = true AND "nextRunDate" <= $2`,
    [userId, todayIso],
  );

  for (const row of rows as { id: string }[]) {
    try {
      await materializeSeries(userId, row.id, todayIso);
    } catch (err) {
      logError("recurring.materialize", err, { userId, recurringTransactionId: row.id });
    }
  }
}

async function materializeSeries(userId: string, seriesId: string, todayIso: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // [Correção — mesmo padrão de payInstallment em src/lib/db/debts.ts]
    // Bloqueia a linha (FOR UPDATE): sem isto, duas abas a carregar a app ao
    // mesmo tempo podiam materializar a mesma ocorrência duas vezes.
    const { rows } = await client.query(
      `SELECT id, "userId", type, "accountId", "destinationAccountId", "amountMinor", currency,
              "categoryId", description, frequency, interval, "startDate", "endDate",
              "occurrencesTotal", "occurrencesGenerated", "nextRunDate", "isActive"
       FROM "RecurringTransaction" WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
      [seriesId, userId],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return;
    }

    let series = mapRecurring(row);

    // [Correção — auditoria de prontidão para Beta] `POST /api/transactions`
    // e a rota de pagar parcela já rejeitam uma conta arquivada (Fase 3),
    // mas isso só protege pedidos feitos por um humano num formulário. Uma
    // série recorrente não passa por nenhuma rota quando é materializada —
    // sem esta verificação, arquivar uma conta DEPOIS de já existir uma
    // recorrência ativa sobre ela não a travava: `materializeSeries`
    // continuaria a gerar Transactions novas para sempre contra uma conta
    // arquivada, o que contradiz diretamente a política de arquivamento
    // (DELETE_POLICY.md). Em vez de só ignorar em silêncio, a série é
    // pausada (mesmo mecanismo de `setRecurringTransactionActive`) — o
    // utilizador vê-a marcada "· em pausa" em /recurring, com o botão
    // "Retomar" sempre disponível caso reative a conta (ou queira apontar a
    // série a outra conta, editando-a).
    const accountIds = [series.accountId, series.destinationAccountId].filter((id): id is string => Boolean(id));
    const { rows: accountRows } = await client.query(`SELECT id FROM "Account" WHERE id = ANY($1::text[]) AND "isArchived" = true`, [
      accountIds,
    ]);
    if (accountRows.length > 0) {
      await client.query(`UPDATE "RecurringTransaction" SET "isActive" = false, "updatedAt" = now() WHERE id = $1`, [seriesId]);
      await client.query("COMMIT");
      logInfo("recurring.materialize.archived_account", "Conta arquivada — série pausada automaticamente.", {
        userId,
        recurringTransactionId: seriesId,
      });
      return;
    }

    let generated = 0;

    while (generated < MAX_OCCURRENCES_PER_REQUEST) {
      const runDate = computeNextRunDate(series);
      if (!runDate || runDate > todayIso) break;

      await createTransaction(
        {
          userId,
          type: series.type,
          accountId: series.accountId,
          destinationAccountId: series.destinationAccountId,
          amountMinor: series.amountMinor,
          currency: series.currency,
          categoryId: series.categoryId,
          description: series.description,
          date: runDate,
          recurringTransactionId: series.id,
        },
        client,
      );
      series = advanceSeries(series);
      generated++;
    }

    // Só uma escrita no fim (não uma por ocorrência) — tudo no mesmo COMMIT
    // que as Transactions criadas acima, para nunca ficar com Transactions
    // geradas sem o cursor avançado (ou vice-versa).
    if (generated > 0) {
      await client.query(
        `UPDATE "RecurringTransaction" SET "nextRunDate" = $2, "occurrencesGenerated" = $3, "updatedAt" = now() WHERE id = $1`,
        [seriesId, series.nextRunDate, series.occurrencesGenerated],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface RecurringRow {
  id: string;
  userId: string;
  type: TransactionType;
  accountId: string;
  destinationAccountId: string | null;
  amountMinor: string;
  currency: string;
  categoryId: string | null;
  description: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: Date | string;
  endDate: Date | string | null;
  occurrencesTotal: number | null;
  occurrencesGenerated: number;
  nextRunDate: Date | string;
  isActive: boolean;
}

function mapRecurring(row: RecurringRow): RecurringTransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    accountId: row.accountId,
    destinationAccountId: row.destinationAccountId,
    amountMinor: toBigInt(row.amountMinor),
    currency: row.currency,
    categoryId: row.categoryId,
    description: row.description,
    frequency: row.frequency,
    interval: row.interval,
    startDate: toISODateString(row.startDate),
    endDate: row.endDate !== null ? toISODateString(row.endDate) : null,
    occurrencesTotal: row.occurrencesTotal,
    occurrencesGenerated: row.occurrencesGenerated,
    nextRunDate: toISODateString(row.nextRunDate),
    isActive: row.isActive,
  };
}

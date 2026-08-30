import type { GoalRecord, GoalStatus, MinorAmount } from "@/lib/financial-engine";
import { getPool, toBigInt, toISODateString } from "./client";

export async function listGoals(userId: string): Promise<GoalRecord[]> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", name, description, "targetAmountMinor", currency, "targetDate",
            "linkedAccountId", status
     FROM "Goal" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId],
  );
  return rows.map(mapGoal);
}

// [Correção — ligar Transações a Metas] Usado por src/app/api/transactions/
// route.ts para nunca confiar num goalId vindo do cliente sem confirmar
// que pertence ao utilizador autenticado — mesmo princípio já aplicado a
// accountId/categoryId nessa rota.
export async function getGoalById(userId: string, goalId: string): Promise<GoalRecord | null> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", name, description, "targetAmountMinor", currency, "targetDate",
            "linkedAccountId", status
     FROM "Goal" WHERE "userId" = $1 AND id = $2`,
    [userId, goalId],
  );
  return rows[0] ? mapGoal(rows[0]) : null;
}

export async function createGoal(input: {
  userId: string;
  name: string;
  description?: string | null;
  targetAmountMinor: MinorAmount;
  currency?: string;
  targetDate?: string | null;
  linkedAccountId: string;
}): Promise<GoalRecord> {
  const { rows } = await getPool().query(
    `INSERT INTO "Goal" (id, "userId", name, description, "targetAmountMinor", currency, "targetDate", "linkedAccountId")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, $6, $7)
     RETURNING id, "userId", name, description, "targetAmountMinor", currency, "targetDate",
               "linkedAccountId", status`,
    [
      input.userId,
      input.name,
      input.description ?? null,
      input.targetAmountMinor.toString(),
      input.currency ?? "CVE",
      input.targetDate ?? null,
      input.linkedAccountId,
    ],
  );
  return mapGoal(rows[0]);
}

// [Fase 2 — editar Meta] `linkedAccountId` fica de fora de propósito: o
// progresso da meta É o saldo em direto da conta ligada (getGoalProgress),
// não um livro de contribuições próprio — trocar a conta trocaria
// instantaneamente todo o histórico de progresso sem aviso. Os restantes
// campos são sempre lidos em direto por getGoalProgress/
// calculateGoalProjection, por isso nada fica "cozido" a partir deles.
export async function updateGoal(
  userId: string,
  goalId: string,
  input: { name?: string; description?: string | null; targetAmountMinor?: bigint; targetDate?: string | null },
): Promise<GoalRecord | null> {
  const { rows } = await getPool().query(
    `UPDATE "Goal"
     SET name = COALESCE($3, name),
         description = CASE WHEN $4::boolean THEN $5 ELSE description END,
         "targetAmountMinor" = COALESCE($6, "targetAmountMinor"),
         "targetDate" = CASE WHEN $7::boolean THEN $8 ELSE "targetDate" END,
         "updatedAt" = now()
     WHERE "userId" = $1 AND id = $2
     RETURNING id, "userId", name, description, "targetAmountMinor", currency, "targetDate",
               "linkedAccountId", status`,
    [
      userId,
      goalId,
      input.name ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.targetAmountMinor?.toString() ?? null,
      input.targetDate !== undefined,
      input.targetDate ?? null,
    ],
  );
  return rows[0] ? mapGoal(rows[0]) : null;
}

interface GoalRow {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  targetAmountMinor: string;
  currency: string;
  targetDate: Date | string | null;
  linkedAccountId: string | null;
  status: GoalStatus;
}

function mapGoal(row: GoalRow): GoalRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    currency: row.currency,
    targetAmountMinor: toBigInt(row.targetAmountMinor),
    targetDate: row.targetDate !== null ? toISODateString(row.targetDate) : null,
    linkedAccountId: row.linkedAccountId,
    status: row.status,
  };
}

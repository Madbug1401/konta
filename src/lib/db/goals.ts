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

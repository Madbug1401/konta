import type { AccountRecord, AccountType } from "@/lib/financial-engine";
import { getPool, toBigInt } from "./client";

// [DECISÃO 1] Todas as funções abaixo recebem userId explicitamente e
// filtram SEMPRE por ele na cláusula WHERE — nunca confiar num id de conta
// vindo do cliente sem cruzar com o utilizador autenticado. Isto é o que
// garante, a nível de acesso a dados, que "os dados de um utilizador nunca
// podem ser acedidos por outro" (regra 6 do briefing).

export async function listAccounts(userId: string): Promise<AccountRecord[]> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", name, type, currency, "initialBalanceMinor", "isArchived"
     FROM "Account" WHERE "userId" = $1 ORDER BY "createdAt" ASC`,
    [userId],
  );
  return rows.map(mapAccount);
}

export async function getAccountById(userId: string, accountId: string): Promise<AccountRecord | null> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", name, type, currency, "initialBalanceMinor", "isArchived"
     FROM "Account" WHERE "userId" = $1 AND id = $2`,
    [userId, accountId],
  );
  return rows[0] ? mapAccount(rows[0]) : null;
}

export async function createAccount(input: {
  userId: string;
  name: string;
  type: AccountType;
  currency?: string;
  initialBalanceMinor?: bigint;
}): Promise<AccountRecord> {
  const { rows } = await getPool().query(
    `INSERT INTO "Account" (id, "userId", name, type, currency, "initialBalanceMinor")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, COALESCE($4, 'CVE'), COALESCE($5, 0))
     RETURNING id, "userId", name, type, currency, "initialBalanceMinor", "isArchived"`,
    [input.userId, input.name, input.type, input.currency ?? null, input.initialBalanceMinor?.toString() ?? null],
  );
  return mapAccount(rows[0]);
}

interface AccountRow {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalanceMinor: string;
  isArchived: boolean;
}

function mapAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    currency: row.currency,
    initialBalanceMinor: toBigInt(row.initialBalanceMinor),
    isArchived: row.isArchived,
  };
}

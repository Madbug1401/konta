import type { AccountRecord, AccountType } from "@/lib/financial-engine";
import { getPool, toBigInt } from "./client";

// [DECISÃO 1] Todas as funções abaixo recebem userId explicitamente e
// filtram SEMPRE por ele na cláusula WHERE — nunca confiar num id de conta
// vindo do cliente sem cruzar com o utilizador autenticado. Isto é o que
// garante, a nível de acesso a dados, que "os dados de um utilizador nunca
// podem ser acedidos por outro" (regra 6 do briefing).

export async function listAccounts(userId: string): Promise<AccountRecord[]> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", name, type, currency, "initialBalanceMinor", "isArchived", color
     FROM "Account" WHERE "userId" = $1 ORDER BY "createdAt" ASC`,
    [userId],
  );
  return rows.map(mapAccount);
}

export async function getAccountById(userId: string, accountId: string): Promise<AccountRecord | null> {
  const { rows } = await getPool().query(
    `SELECT id, "userId", name, type, currency, "initialBalanceMinor", "isArchived", color
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
  // Id de uma cor da paleta curada (ver src/lib/account-colors.ts) —
  // validado pela rota de API antes de chegar aqui, nunca um hex livre.
  color?: string | null;
}): Promise<AccountRecord> {
  const { rows } = await getPool().query(
    `INSERT INTO "Account" (id, "userId", name, type, currency, "initialBalanceMinor", color)
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, COALESCE($4, 'CVE'), COALESCE($5, 0), $6)
     RETURNING id, "userId", name, type, currency, "initialBalanceMinor", "isArchived", color`,
    [input.userId, input.name, input.type, input.currency ?? null, input.initialBalanceMinor?.toString() ?? null, input.color ?? null],
  );
  return mapAccount(rows[0]);
}

// [Fase 2 — editar Conta] Só `name`/`type`/`color` são editáveis (ver
// plano): `currency` fica de fora porque cada Transação já gravada nesta
// conta congelou a sua própria moeda na criação (o motor não converte
// câmbio em lado nenhum — mudar a etiqueta da conta misturaria moedas em
// silêncio); `initialBalanceMinor` fica de fora porque todo o saldo é
// `initialBalanceMinor + entradas - saídas` — mudar isto agora deslocaria
// retroativamente todo o histórico de saldos sem nenhum rasto (uma
// transação corretiva é o mecanismo certo para isso, já existente).
export async function updateAccount(
  userId: string,
  accountId: string,
  input: { name?: string; type?: AccountType; color?: string | null },
): Promise<AccountRecord | null> {
  const { rows } = await getPool().query(
    `UPDATE "Account"
     SET name = COALESCE($3, name),
         type = COALESCE($4, type),
         color = CASE WHEN $5::boolean THEN $6 ELSE color END,
         "updatedAt" = now()
     WHERE "userId" = $1 AND id = $2
     RETURNING id, "userId", name, type, currency, "initialBalanceMinor", "isArchived", color`,
    [userId, accountId, input.name ?? null, input.type ?? null, input.color !== undefined, input.color ?? null],
  );
  return rows[0] ? mapAccount(rows[0]) : null;
}

// [Fase 3 — arquivar/encerrar] Reversível de propósito (ao contrário de
// DEFAULTED numa Dívida ou ACHIEVED/ABANDONED numa Meta) — arquivar uma
// conta é um "esconder por agora", nunca uma decisão definitiva sobre o
// próprio dinheiro. Ver DELETE_POLICY.md: isto é o mecanismo recomendado
// em vez de qualquer DELETE físico.
export async function setAccountArchived(userId: string, accountId: string, isArchived: boolean): Promise<AccountRecord | null> {
  const { rows } = await getPool().query(
    `UPDATE "Account" SET "isArchived" = $3, "updatedAt" = now()
     WHERE "userId" = $1 AND id = $2
     RETURNING id, "userId", name, type, currency, "initialBalanceMinor", "isArchived", color`,
    [userId, accountId, isArchived],
  );
  return rows[0] ? mapAccount(rows[0]) : null;
}

interface AccountRow {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalanceMinor: string;
  isArchived: boolean;
  color: string | null;
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
    color: row.color,
  };
}

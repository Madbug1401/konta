import { getPool } from "./client";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  timezone: string;
  locale: string;
  defaultCurrency: string;
}

/**
 * [Correção — Pre-Beta Hardening, Prioridade 9] `email = $1` no Postgres é
 * sensível a maiúsculas/minúsculas por omissão — "Test@Example.com" e
 * "test@example.com" eram tratados como contas diferentes (incluindo pela
 * própria constraint UNIQUE da coluna), tanto no registo como no login.
 * Normalizar sempre para minúsculas (e sem espaço à volta) num único sítio
 * — aqui, não em cada rota que chama estas funções — garante que
 * `findUserByEmail`/`createUser` tratam sempre o mesmo endereço como a
 * mesma conta, independentemente de como o utilizador o escreveu.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, email, "passwordHash", name, timezone, locale, "defaultCurrency"
     FROM "User" WHERE email = $1`,
    [normalizeEmail(email)],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, email, "passwordHash", name, timezone, locale, "defaultCurrency"
     FROM "User" WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// [Sugestão do utilizador — painel de estatísticas do dono do projeto]
// Chamado a partir das rotas de login E de registo (registar já inicia
// sessão de imediato) — nunca a partir de nenhum outro sítio, para
// "último login" continuar a significar exatamente isso, não "última vez
// que qualquer rota tocou nesta linha".
export async function touchLastLogin(userId: string): Promise<void> {
  await getPool().query(`UPDATE "User" SET "lastLoginAt" = now() WHERE id = $1`, [userId]);
}

// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] Consulta dedicada (mesmo padrão de touchLastLogin
// acima) em vez de acrescentar "aiEnabled" a UserRow/findUserById — este
// valor só interessa a um único chamador (POST /api/ai/chat, antes de
// sequer construir o contexto ou chamar o Claude), nunca precisa de
// viajar por todo o resto do código que já usa findUserById para outras
// coisas (timezone, etc.). Fail-closed, mesma filosofia de isAdminEmail
// (src/lib/auth/admin.ts): se a linha não existir por algum motivo,
// `rows[0]` é undefined e `Boolean(undefined)` é false — nunca se assume
// acesso ativo por omissão quando a consulta não devolve nada.
export async function isAiEnabled(userId: string): Promise<boolean> {
  const { rows } = await getPool().query(`SELECT "aiEnabled" FROM "User" WHERE id = $1`, [userId]);
  return Boolean(rows[0]?.aiEnabled);
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
  timezone?: string;
}): Promise<UserRow> {
  const { rows } = await getPool().query(
    `INSERT INTO "User" (id, email, "passwordHash", name, timezone)
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, COALESCE($4, 'Atlantic/Cape_Verde'))
     RETURNING id, email, "passwordHash", name, timezone, locale, "defaultCurrency"`,
    [normalizeEmail(input.email), input.passwordHash, input.name ?? null, input.timezone ?? null],
  );
  return rows[0];
}

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

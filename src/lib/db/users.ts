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

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, email, "passwordHash", name, timezone, locale, "defaultCurrency"
     FROM "User" WHERE email = $1`,
    [email],
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
    [input.email, input.passwordHash, input.name ?? null, input.timezone ?? null],
  );
  return rows[0];
}

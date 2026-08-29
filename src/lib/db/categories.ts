import type { CategoryKind } from "@/lib/financial-engine";
import { getPool } from "./client";

export interface CategoryRow {
  id: string;
  name: string;
  kind: CategoryKind;
  isSystem: boolean;
}

/** Categorias de sistema (partilhadas) + categorias criadas por este utilizador. */
export async function listCategories(userId: string): Promise<CategoryRow[]> {
  const { rows } = await getPool().query(
    `SELECT id, name, kind, "isSystem" FROM "Category"
     WHERE "userId" IS NULL OR "userId" = $1
     ORDER BY "isSystem" DESC, name ASC`,
    [userId],
  );
  return rows;
}

/**
 * [Correção — Pre-Beta Hardening, Prioridade 7] Confirma que uma categoria é
 * visível para este utilizador — categoria de sistema (`userId IS NULL`,
 * partilhada por todos) OU criada por ele — antes de a aceitar num
 * `categoryId` de transação. Mesmo princípio já aplicado a `accountId` em
 * `getAccountById` (src/lib/db/accounts.ts): nunca confiar num id vindo do
 * cliente sem cruzar com o utilizador autenticado. Antes desta função, uma
 * transação aceitava QUALQUER `categoryId` que existisse na base de dados,
 * incluindo uma categoria privada de outro utilizador.
 */
export async function getCategoryById(userId: string, categoryId: string): Promise<CategoryRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, name, kind, "isSystem" FROM "Category"
     WHERE id = $1 AND ("userId" IS NULL OR "userId" = $2)`,
    [categoryId, userId],
  );
  return rows[0] ?? null;
}

export async function createCategory(input: { userId: string; name: string; kind: CategoryKind }): Promise<CategoryRow> {
  const { rows } = await getPool().query(
    `INSERT INTO "Category" (id, "userId", name, kind, "isSystem")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, false)
     RETURNING id, name, kind, "isSystem"`,
    [input.userId, input.name, input.kind],
  );
  return rows[0];
}

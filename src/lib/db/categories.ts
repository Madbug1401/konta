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

export async function createCategory(input: { userId: string; name: string; kind: CategoryKind }): Promise<CategoryRow> {
  const { rows } = await getPool().query(
    `INSERT INTO "Category" (id, "userId", name, kind, "isSystem")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, false)
     RETURNING id, name, kind, "isSystem"`,
    [input.userId, input.name, input.kind],
  );
  return rows[0];
}

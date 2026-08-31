import { getPool } from "./client";

// [Sugestão do utilizador — "quero um campo para me dar feedback direto no
// aplicativo"] Nunca anónimo: gravado sempre com o userId da sessão
// autenticada (nunca aceite do corpo do pedido) — ver
// src/app/api/feedback/route.ts. Sem edição/eliminação pelo próprio autor
// nesta v1, mesma filosofia de InvestmentValuation: é um relato pontual.
export async function createFeedback(userId: string, message: string): Promise<void> {
  await getPool().query(
    `INSERT INTO "Feedback" (id, "userId", message)
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2)`,
    [userId, message],
  );
}

export interface FeedbackRow {
  id: string;
  message: string;
  createdAt: string;
  userEmail: string;
  userName: string | null;
}

// [Sugestão do utilizador — painel de estatísticas do dono do projeto] Tal
// como src/lib/db/admin.ts, este ficheiro não faz nenhuma verificação de
// posse por userId de propósito — só é chamado depois de a rota/página
// confirmar isAdminEmail. Mais recente primeiro, para o dono ver logo as
// mensagens novas sem ter de percorrer a lista toda.
export async function listFeedback(): Promise<FeedbackRow[]> {
  const { rows } = await getPool().query(`
    SELECT f.id, f.message, f."createdAt", u.email AS "userEmail", u.name AS "userName"
    FROM "Feedback" f
    JOIN "User" u ON u.id = f."userId"
    ORDER BY f."createdAt" DESC
  `);
  return rows.map((row) => ({
    id: row.id as string,
    message: row.message as string,
    createdAt: row.createdAt as string,
    userEmail: row.userEmail as string,
    userName: (row.userName as string | null) ?? null,
  }));
}

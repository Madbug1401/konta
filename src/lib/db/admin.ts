import { getPool } from "./client";

// [Sugestão do utilizador — painel de estatísticas do dono do projeto] Só
// contagens e datas, nunca conteúdo de transações/contas de ninguém — dá
// visibilidade operacional ao dono sem tocar na privacidade dos dados
// financeiros de cada utilizador (mesmo princípio de "Contas Segurança e
// privacidade" na página /help). Este ficheiro não faz nenhuma verificação
// de posse por userId de propósito — é o único sítio da app que consulta
// TODOS os utilizadores; a rota/página que o chama é que tem de confirmar
// isAdminEmail antes de sequer chamar isto.
export interface PlatformTotals {
  users: number;
  accounts: number;
  transactions: number;
  debts: number;
  goals: number;
  feedback: number;
}

export async function getPlatformTotals(): Promise<PlatformTotals> {
  const { rows } = await getPool().query(`
    SELECT
      (SELECT COUNT(*) FROM "User") AS users,
      (SELECT COUNT(*) FROM "Account") AS accounts,
      (SELECT COUNT(*) FROM "Transaction") AS transactions,
      (SELECT COUNT(*) FROM "Debt") AS debts,
      (SELECT COUNT(*) FROM "Goal") AS goals,
      (SELECT COUNT(*) FROM "Feedback") AS feedback
  `);
  const row = rows[0] as Record<string, string>;
  return {
    users: Number(row.users),
    accounts: Number(row.accounts),
    transactions: Number(row.transactions),
    debts: Number(row.debts),
    goals: Number(row.goals),
    feedback: Number(row.feedback),
  };
}

export interface UserActivityRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  accountsCount: number;
  transactionsCount: number;
  // [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao
  // Konta AI por utilizador"] Ver setAiEnabledForUser abaixo e
  // src/lib/db/users.ts::isAiEnabled (a consulta que a rota do chat usa de
  // facto — este campo aqui é só para desenhar o botão certo em /admin).
  aiEnabled: boolean;
}

export async function listUsersWithActivity(): Promise<UserActivityRow[]> {
  const { rows } = await getPool().query(`
    SELECT
      u.id,
      u.email,
      u.name,
      u."createdAt",
      u."lastLoginAt",
      u."aiEnabled",
      COUNT(DISTINCT a.id) AS "accountsCount",
      COUNT(DISTINCT t.id) AS "transactionsCount"
    FROM "User" u
    LEFT JOIN "Account" a ON a."userId" = u.id
    LEFT JOIN "Transaction" t ON t."accountId" = a.id
    GROUP BY u.id, u.email, u.name, u."createdAt", u."lastLoginAt", u."aiEnabled"
    ORDER BY u."createdAt" DESC
  `);
  return rows.map((row) => ({
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    createdAt: row.createdAt as string,
    lastLoginAt: (row.lastLoginAt as string | null) ?? null,
    accountsCount: Number(row.accountsCount),
    transactionsCount: Number(row.transactionsCount),
    aiEnabled: Boolean(row.aiEnabled),
  }));
}

// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] Único sítio que ESCREVE "aiEnabled" — leitura
// autoritativa para POST /api/ai/chat continua a ser isAiEnabled
// (src/lib/db/users.ts), não este ficheiro (que, como o resto de
// admin.ts, nunca verifica isAdminEmail a si próprio — quem chama é que
// tem de o fazer antes). Devolve false sem tocar em nada se o userId não
// corresponder a ninguém, para a rota poder devolver 404 em vez de fingir
// sucesso.
export async function setAiEnabledForUser(userId: string, enabled: boolean): Promise<boolean> {
  const result = await getPool().query(`UPDATE "User" SET "aiEnabled" = $2, "updatedAt" = now() WHERE id = $1`, [
    userId,
    enabled,
  ]);
  return (result.rowCount ?? 0) > 0;
}

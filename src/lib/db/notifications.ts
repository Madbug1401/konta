import { getPool } from "./client";

// [Sugestão do utilizador — "quero enviar mensagens aos meus users, como
// notificação, e eles receberem"] Igual ao resto de src/lib/db/admin.ts: só
// chamada depois de a rota confirmar isAdminEmail — este ficheiro não
// repete essa verificação. Broadcast puro, sem destinatário próprio (ver
// schema.prisma, model Notification).
export async function createNotification(message: string): Promise<void> {
  await getPool().query(
    `INSERT INTO "Notification" (id, message)
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1)`,
    [message],
  );
}

export interface NotificationRow {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
}

// [Sugestão do utilizador] Lista as últimas notificações (mais recente
// primeiro) já cruzadas com o estado "lida" deste utilizador específico —
// a mesma Notification aparece "lida" para quem já a viu e "não lida" para
// quem ainda não, sem duplicar a linha. Limite de 50: isto é um mural de
// avisos, não um histórico a crescer sem fim.
export async function listNotificationsForUser(userId: string): Promise<NotificationRow[]> {
  const { rows } = await getPool().query(
    `SELECT n.id, n.message, n."createdAt", (nr."userId" IS NOT NULL) AS read
     FROM "Notification" n
     LEFT JOIN "NotificationRead" nr ON nr."notificationId" = n.id AND nr."userId" = $1
     ORDER BY n."createdAt" DESC
     LIMIT 50`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    message: row.message as string,
    createdAt: row.createdAt as string,
    read: Boolean(row.read),
  }));
}

export interface SentNotificationRow {
  id: string;
  message: string;
  createdAt: string;
}

// [Sugestão do utilizador] Histórico do que já foi enviado, para o painel
// /admin — sem estado "lida" (isso é por destinatário, não faz sentido
// aqui; ver listNotificationsForUser para a versão por utilizador).
export async function listRecentNotifications(): Promise<SentNotificationRow[]> {
  const { rows } = await getPool().query(
    `SELECT id, message, "createdAt" FROM "Notification" ORDER BY "createdAt" DESC LIMIT 20`,
  );
  return rows.map((row) => ({
    id: row.id as string,
    message: row.message as string,
    createdAt: row.createdAt as string,
  }));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { rows } = await getPool().query(
    `SELECT COUNT(*) AS count
     FROM "Notification" n
     WHERE NOT EXISTS (
       SELECT 1 FROM "NotificationRead" nr WHERE nr."notificationId" = n.id AND nr."userId" = $1
     )`,
    [userId],
  );
  return Number((rows[0] as Record<string, string>).count);
}

// [Sugestão do utilizador] Marca TODAS as notificações ainda não lidas deste
// utilizador como lidas, de uma vez — chamado ao visitar /notifications.
// ON CONFLICT DO NOTHING: nunca falha nem duplica se a pessoa abrir a
// página em duas abas ao mesmo tempo.
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO "NotificationRead" ("notificationId", "userId")
     SELECT n.id, $1 FROM "Notification" n
     WHERE NOT EXISTS (
       SELECT 1 FROM "NotificationRead" nr WHERE nr."notificationId" = n.id AND nr."userId" = $1
     )
     ON CONFLICT DO NOTHING`,
    [userId],
  );
}

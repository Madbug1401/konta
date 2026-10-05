-- [Sugestão do utilizador — "quero enviar mensagens aos meus users, como
-- notificação, e eles receberem"] Duas tabelas novas: Notification (uma
-- mensagem de broadcast, criada só pelo dono do projeto em /admin) e
-- NotificationRead (o estado "lida" por utilizador — ver schema.prisma para
-- a explicação completa da chave composta).
--
-- Correr manualmente contra a base de dados de produção (Neon) uma única
-- vez, tal como 0001..0008 — ver docs/operations/RENDER-NEON.md.
CREATE TABLE IF NOT EXISTS "Notification" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  message TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "NotificationRead" (
  "notificationId" TEXT NOT NULL REFERENCES "Notification"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("notificationId", "userId")
);
CREATE INDEX IF NOT EXISTS "NotificationRead_userId_idx" ON "NotificationRead"("userId");

-- [Sugestão do utilizador — "quero um campo para me dar feedback direto no
-- aplicativo"] Nova tabela Feedback: mensagens curtas dos utilizadores,
-- sempre ligadas a quem escreveu (nunca anónimas), visíveis só no painel de
-- Estatísticas do dono do projeto (/admin) — ver
-- docs/architecture/DECISIONS.md.
--
-- Correr manualmente contra a base de dados de produção (Neon) uma única
-- vez, tal como 0001_init.sql/0002_seed_categories.sql/0003_add_last_login.sql
-- — ver docs/operations/RENDER-NEON.md.
CREATE TABLE IF NOT EXISTS "Feedback" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Feedback_userId_idx" ON "Feedback"("userId");
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");

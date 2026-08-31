-- [Sugestão do utilizador — painel de estatísticas do dono do projeto]
-- Adiciona "lastLoginAt" a User (nulo por omissão: contas existentes nunca
-- tiveram este campo, e não há forma honesta de reconstruir esse histórico
-- retroativamente — fica nulo até ao próximo login/registo real, nunca
-- preenchido com um valor inventado).
--
-- Correr manualmente contra a base de dados de produção (Neon) uma única
-- vez, tal como 0001_init.sql/0002_seed_categories.sql — ver
-- docs/operations/RENDER-NEON.md.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ;

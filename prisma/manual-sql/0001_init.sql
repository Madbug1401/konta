-- ============================================================================
-- KONTA — Migração inicial (SQL equivalente a prisma/schema.prisma)
--
-- Este ficheiro existe por uma limitação do SANDBOX de desenvolvimento: o CLI
-- da Prisma não conseguiu descarregar os binários do schema-engine (domínio
-- binaries.prisma.sh bloqueado pela política de rede deste ambiente isolado).
-- Este SQL foi escrito à mão para espelhar exatamente prisma/schema.prisma e
-- foi aplicado a um Postgres local real para validar o modelo (chaves
-- estrangeiras, enums, constraints, índices). Num ambiente com rede normal,
-- este ficheiro deixa de ser necessário: usa-se `npx prisma migrate dev` a
-- partir do schema.prisma, que gera a migração oficial automaticamente.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "AccountType" AS ENUM ('WALLET','BANK','SAVINGS','CREDIT_CARD','INVESTMENT','EMERGENCY_FUND','OTHER');
CREATE TYPE "TransactionType" AS ENUM ('INCOME','EXPENSE','TRANSFER');
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED','PENDING','CANCELED');
CREATE TYPE "CategoryKind" AS ENUM ('INCOME','EXPENSE');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY','WEEKLY','MONTHLY','YEARLY');
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE','PAID_OFF','DEFAULTED');
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING','PAID','OVERDUE');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE','ACHIEVED','ABANDONED');

CREATE TABLE "User" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  email TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Atlantic/Cape_Verde',
  locale TEXT NOT NULL DEFAULT 'pt-CV',
  "defaultCurrency" TEXT NOT NULL DEFAULT 'CVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Account" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type "AccountType" NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CVE',
  "initialBalanceMinor" BIGINT NOT NULL DEFAULT 0,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  color TEXT,
  icon TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE TABLE "Category" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind "CategoryKind" NOT NULL,
  icon TEXT,
  color TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

CREATE TABLE "RecurringTransaction" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type "TransactionType" NOT NULL,
  "accountId" TEXT NOT NULL REFERENCES "Account"(id),
  "destinationAccountId" TEXT,
  "amountMinor" BIGINT NOT NULL,
  currency TEXT NOT NULL,
  "categoryId" TEXT REFERENCES "Category"(id),
  description TEXT NOT NULL,
  frequency "RecurrenceFrequency" NOT NULL,
  interval INTEGER NOT NULL DEFAULT 1,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "occurrencesTotal" INTEGER,
  "occurrencesGenerated" INTEGER NOT NULL DEFAULT 0,
  "nextRunDate" DATE NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "RecurringTransaction_userId_idx" ON "RecurringTransaction"("userId");
CREATE INDEX "RecurringTransaction_nextRunDate_isActive_idx" ON "RecurringTransaction"("nextRunDate", "isActive");

CREATE TABLE "Debt" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "creditorName" TEXT NOT NULL,
  description TEXT,
  "originalAmountMinor" BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CVE',
  "interestRate" DECIMAL(6,3),
  status "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
  "startDate" DATE NOT NULL,
  "finalDueDate" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Debt_userId_idx" ON "Debt"("userId");

CREATE TABLE "DebtInstallment" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "debtId" TEXT NOT NULL REFERENCES "Debt"(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  "dueDate" DATE NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  status "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("debtId", sequence)
);
CREATE INDEX "DebtInstallment_debtId_status_idx" ON "DebtInstallment"("debtId", status);

CREATE TABLE "Goal" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  "targetAmountMinor" BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CVE',
  "targetDate" DATE,
  "linkedAccountId" TEXT REFERENCES "Account"(id),
  status "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

CREATE TABLE "Transaction" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type "TransactionType" NOT NULL,
  status "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "accountId" TEXT NOT NULL REFERENCES "Account"(id) ON DELETE CASCADE,
  "destinationAccountId" TEXT REFERENCES "Account"(id),
  "amountMinor" BIGINT NOT NULL,
  currency TEXT NOT NULL,
  "categoryId" TEXT REFERENCES "Category"(id),
  description TEXT NOT NULL,
  date DATE NOT NULL,
  "debtId" TEXT REFERENCES "Debt"(id),
  "debtInstallmentId" TEXT UNIQUE REFERENCES "DebtInstallment"(id),
  "goalId" TEXT REFERENCES "Goal"(id),
  "recurringTransactionId" TEXT REFERENCES "RecurringTransaction"(id),
  metadata JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", date);
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_recurringTransactionId_idx" ON "Transaction"("recurringTransactionId");

CREATE TABLE "InvestmentDetail" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "accountId" TEXT NOT NULL UNIQUE REFERENCES "Account"(id) ON DELETE CASCADE,
  "investmentType" TEXT NOT NULL,
  "expectedReturnRate" DECIMAL(6,3),
  "maturityDate" DATE
);

CREATE TABLE "InvestmentValuation" (
  id TEXT PRIMARY KEY DEFAULT ('c' || replace(gen_random_uuid()::text, '-', '')),
  "investmentDetailId" TEXT NOT NULL REFERENCES "InvestmentDetail"(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  "valueMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "InvestmentValuation_investmentDetailId_date_idx" ON "InvestmentValuation"("investmentDetailId", date);

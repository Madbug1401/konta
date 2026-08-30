// ============================================================================
// Investimentos.
//
// [Fase 5 — Investimentos] `InvestmentDetail` não tem `userId` próprio, só
// `accountId` (ver prisma/schema.prisma) — por isso, ao contrário dos
// outros ficheiros deste diretório, a posse é SEMPRE verificada via JOIN
// com "Account" (nunca confiar num accountId vindo do cliente sem cruzar
// com o utilizador autenticado — regra 6 do briefing). `InvestmentValuation`
// nunca é editada nem apagada depois de criada — é histórico de mercado,
// mesma filosofia de nunca alterar um registo passado já usada no resto do
// projeto (ex: DebtInstallment paga nunca volta a PENDING).
// ============================================================================

import type { InvestmentValuationRecord } from "@/lib/financial-engine";
import { getPool, toBigInt, toISODateString } from "./client";

export interface InvestmentDetailRecord {
  id: string;
  accountId: string;
  investmentType: string;
  expectedReturnRate: number | null;
  maturityDate: string | null;
}

export async function getInvestmentDetailByAccountId(userId: string, accountId: string): Promise<InvestmentDetailRecord | null> {
  const { rows } = await getPool().query(
    `SELECT i.id, i."accountId", i."investmentType", i."expectedReturnRate", i."maturityDate"
     FROM "InvestmentDetail" i
     JOIN "Account" a ON a.id = i."accountId"
     WHERE a.id = $1 AND a."userId" = $2`,
    [accountId, userId],
  );
  return rows[0] ? mapDetail(rows[0]) : null;
}

export async function createInvestmentDetail(
  userId: string,
  accountId: string,
  input: { investmentType: string; expectedReturnRate?: number | null; maturityDate?: string | null },
): Promise<InvestmentDetailRecord | null> {
  // A conta tem de pertencer ao utilizador E ser mesmo do tipo INVESTMENT —
  // esta verificação substitui, aqui, o "WHERE userId = $1" que as outras
  // tabelas fazem diretamente.
  const { rows: ownerCheck } = await getPool().query(
    `SELECT 1 FROM "Account" WHERE id = $1 AND "userId" = $2 AND type = 'INVESTMENT'`,
    [accountId, userId],
  );
  if (ownerCheck.length === 0) return null;

  const { rows } = await getPool().query(
    `INSERT INTO "InvestmentDetail" (id, "accountId", "investmentType", "expectedReturnRate", "maturityDate")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4)
     RETURNING id, "accountId", "investmentType", "expectedReturnRate", "maturityDate"`,
    [accountId, input.investmentType, input.expectedReturnRate ?? null, input.maturityDate ?? null],
  );
  return mapDetail(rows[0]);
}

export async function updateInvestmentDetail(
  userId: string,
  accountId: string,
  input: { investmentType?: string; expectedReturnRate?: number | null; maturityDate?: string | null },
): Promise<InvestmentDetailRecord | null> {
  const { rows } = await getPool().query(
    `UPDATE "InvestmentDetail" AS i
     SET "investmentType" = COALESCE($3, i."investmentType"),
         "expectedReturnRate" = CASE WHEN $4::boolean THEN $5 ELSE i."expectedReturnRate" END,
         "maturityDate" = CASE WHEN $6::boolean THEN $7 ELSE i."maturityDate" END
     FROM "Account" a
     WHERE a.id = i."accountId" AND a.id = $1 AND a."userId" = $2
     RETURNING i.id, i."accountId", i."investmentType", i."expectedReturnRate", i."maturityDate"`,
    [
      accountId,
      userId,
      input.investmentType ?? null,
      input.expectedReturnRate !== undefined,
      input.expectedReturnRate ?? null,
      input.maturityDate !== undefined,
      input.maturityDate ?? null,
    ],
  );
  return rows[0] ? mapDetail(rows[0]) : null;
}

export async function listValuations(userId: string, accountId: string): Promise<InvestmentValuationRecord[]> {
  const { rows } = await getPool().query(
    `SELECT v.id, v."investmentDetailId", v.date, v."valueMinor"
     FROM "InvestmentValuation" v
     JOIN "InvestmentDetail" i ON i.id = v."investmentDetailId"
     JOIN "Account" a ON a.id = i."accountId"
     WHERE a.id = $1 AND a."userId" = $2
     ORDER BY v.date ASC`,
    [accountId, userId],
  );
  return rows.map(mapValuation);
}

// [Fase 5 — Investimentos] Nunca edita/apaga uma avaliação antiga — só
// insere uma nova. `computeInvestmentPerformance` (financial-engine) já usa
// sempre a mais recente por data, nunca a última inserida (podem não
// coincidir se alguém registar uma avaliação atrasada).
export async function addValuation(
  userId: string,
  accountId: string,
  input: { date: string; valueMinor: bigint },
): Promise<InvestmentValuationRecord | null> {
  const { rows: detailRows } = await getPool().query(
    `SELECT i.id FROM "InvestmentDetail" i JOIN "Account" a ON a.id = i."accountId" WHERE a.id = $1 AND a."userId" = $2`,
    [accountId, userId],
  );
  const detail = detailRows[0];
  if (!detail) return null;

  const { rows } = await getPool().query(
    `INSERT INTO "InvestmentValuation" (id, "investmentDetailId", date, "valueMinor")
     VALUES ('c' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3)
     RETURNING id, "investmentDetailId", date, "valueMinor"`,
    [detail.id, input.date, input.valueMinor.toString()],
  );
  return mapValuation(rows[0]);
}

interface InvestmentDetailRow {
  id: string;
  accountId: string;
  investmentType: string;
  expectedReturnRate: string | null;
  maturityDate: Date | string | null;
}

function mapDetail(row: InvestmentDetailRow): InvestmentDetailRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    investmentType: row.investmentType,
    expectedReturnRate: row.expectedReturnRate !== null ? parseFloat(row.expectedReturnRate) : null,
    maturityDate: row.maturityDate !== null ? toISODateString(row.maturityDate) : null,
  };
}

interface InvestmentValuationRow {
  id: string;
  investmentDetailId: string;
  date: Date | string;
  valueMinor: string;
}

function mapValuation(row: InvestmentValuationRow): InvestmentValuationRecord {
  return {
    id: row.id,
    investmentDetailId: row.investmentDetailId,
    date: toISODateString(row.date),
    valueMinor: toBigInt(row.valueMinor),
  };
}

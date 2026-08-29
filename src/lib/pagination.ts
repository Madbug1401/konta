// ============================================================================
// KONTA — validação de paginação (Pre-Beta Hardening, Prioridade 8).
//
// `GET /api/transactions` aceitava `limit`/`offset` da query string sem
// nenhuma validação: `Number("abc")` é `NaN`, um valor negativo ou
// astronomicamente grande passavam direto para `listTransactions()`
// (src/lib/db/transactions.ts) e chegavam ao Postgres como parâmetros de
// `LIMIT`/`OFFSET` — na melhor hipótese o Postgres rejeita com um erro que
// se tornava um 500 genérico (não um 400 claro para quem chama a API); na
// pior hipótese, um `limit` enorme fazia o servidor tentar carregar um
// número absurdo de linhas para memória.
//
// [DECISÃO] Uma única verificação (`Number.isInteger`) já cobre os três
// casos exigidos ao mesmo tempo: `NaN`/`Infinity` (não é inteiro),
// negativos (fora do intervalo `min`) e valores absurdamente grandes (fora
// do intervalo `max`) — não precisa de três `if`s separados.
// ============================================================================

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const DEFAULT_OFFSET = 0;
export const MAX_OFFSET = 1_000_000;

export type PaginationResult = { ok: true; limit: number; offset: number } | { ok: false; error: string };

function parseBoundedInt(
  raw: string | null,
  { fieldName, defaultValue, min, max }: { fieldName: string; defaultValue: number; min: number; max: number },
): { value: number } | { error: string } {
  if (raw === null || raw === "") return { value: defaultValue };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { error: `"${fieldName}" tem de ser um número inteiro entre ${min} e ${max}.` };
  }
  return { value: parsed };
}

export function parsePagination(rawLimit: string | null, rawOffset: string | null): PaginationResult {
  const limitResult = parseBoundedInt(rawLimit, { fieldName: "limit", defaultValue: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
  if ("error" in limitResult) return { ok: false, error: limitResult.error };

  const offsetResult = parseBoundedInt(rawOffset, {
    fieldName: "offset",
    defaultValue: DEFAULT_OFFSET,
    min: 0,
    max: MAX_OFFSET,
  });
  if ("error" in offsetResult) return { ok: false, error: offsetResult.error };

  return { ok: true, limit: limitResult.value, offset: offsetResult.value };
}

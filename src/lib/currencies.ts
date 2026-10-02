// ============================================================================
// Moedas disponíveis para uma conta.
//
// [Sugestão do utilizador — pedido de amigos fora de Cabo Verde] Até aqui, o
// formulário de criar conta nunca oferecia escolha de moeda (ficava sempre
// CVE, mesmo o schema já suportando qualquer código de 3 letras por conta —
// ver [DECISÃO 3]/[DECISÃO 4] em prisma/schema.prisma). Em vez de um campo de
// texto livre para um código ISO 4217 (fácil de escrever mal — "EU" em vez
// de "EUR"), a app oferece uma paleta curada e fixa, mesmo princípio já
// aplicado à cor da conta em src/lib/account-colors.ts: cobre os destinos
// mais comuns da diáspora cabo-verdiana, e é fácil de estender (só é preciso
// acrescentar uma entrada aqui — tanto a UI como a validação do servidor
// leem desta mesma lista, nunca duas listas a poderem divergir).
// ============================================================================

// [Task 2 — Precisão monetária] `decimalPlaces` é a única fonte de verdade
// de quantas casas decimais cada moeda usa (CVE não tem subunidade de uso
// corrente, por isso 0 — nunca 2; as restantes seguem o ISO 4217 normal).
// `src/lib/financial-engine/money.ts` (toMinor/fromMinor/formatMinor) e
// `src/components/money-display.tsx` leem SEMPRE daqui — nunca um valor
// fixo duplicado nesses sítios, para nunca poderem divergir entre si.
export const CURRENCIES = [
  { code: "CVE", label: "Escudo cabo-verdiano (CVE)", decimalPlaces: 0 },
  { code: "EUR", label: "Euro (EUR)", decimalPlaces: 2 },
  { code: "USD", label: "Dólar americano (USD)", decimalPlaces: 2 },
  { code: "GBP", label: "Libra esterlina (GBP)", decimalPlaces: 2 },
  { code: "BRL", label: "Real brasileiro (BRL)", decimalPlaces: 2 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// z.enum() exige um tuplo não vazio de literais — construído uma vez aqui a
// partir da mesma lista acima (ver src/app/api/accounts/route.ts).
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

const DECIMAL_PLACES_BY_CODE: Record<string, number> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.decimalPlaces]));

/**
 * Casas decimais de uma moeda. Uma moeda fora da lista curada (hoje só
 * possível através de `currency` em Debt/Goal/RecurringTransaction, que
 * valida só o formato "3 letras", nunca contra `CURRENCY_CODES` — ver
 * [Task 2] abaixo) assume 0 casas, o mesmo comportamento conservador que já
 * existia implicitamente para todas as moedas antes desta mudança — nunca
 * lança, para nunca partir a formatação de dados já gravados.
 */
export function getCurrencyDecimalPlaces(code: string): number {
  return DECIMAL_PLACES_BY_CODE[code] ?? 0;
}

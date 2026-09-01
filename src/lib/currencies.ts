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

export const CURRENCIES = [
  { code: "CVE", label: "Escudo cabo-verdiano (CVE)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dólar americano (USD)" },
  { code: "GBP", label: "Libra esterlina (GBP)" },
  { code: "BRL", label: "Real brasileiro (BRL)" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// z.enum() exige um tuplo não vazio de literais — construído uma vez aqui a
// partir da mesma lista acima (ver src/app/api/accounts/route.ts).
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

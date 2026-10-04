// ============================================================================
// Aritmética monetária seguras.
//
// [DECISÃO 4 / regra 7 e 20 do briefing] Dinheiro nunca é `number`/float.
// Tudo aqui trabalha com `bigint` (unidade mínima, ex: cêntimos). Isto elimina
// por construção toda a classe de bug de arredondamento de vírgula flutuante
// encontrada na auditoria (ex: 333.33 * 3 !== 1000 em JS float).
// ============================================================================

import { getCurrencyDecimalPlaces } from "@/lib/currencies";
import type { MinorAmount } from "./types";

export function add(a: MinorAmount, b: MinorAmount): MinorAmount {
  return a + b;
}

export function subtract(a: MinorAmount, b: MinorAmount): MinorAmount {
  return a - b;
}

export function sum(values: MinorAmount[]): MinorAmount {
  return values.reduce((acc, v) => acc + v, 0n);
}

export function isNegative(value: MinorAmount): boolean {
  return value < 0n;
}

export function abs(value: MinorAmount): MinorAmount {
  return value < 0n ? -value : value;
}

/**
 * Divide um valor total em `count` parcelas cujo somatório é EXATAMENTE
 * `totalMinor` — nunca aproximadamente. É a correção direta do bug da
 * auditoria em que `installment * occurrences !== total` rejeitava planos de
 * pagamento válidos por causa de arredondamento decimal.
 *
 * Estratégia: divisão inteira para as primeiras (count - 1) parcelas; a
 * última parcela absorve o resto. Isto garante soma exata por construção,
 * sem nunca precisar comparar floats.
 */
export function splitIntoInstallments(
  totalMinor: MinorAmount,
  count: number,
): MinorAmount[] {
  if (count <= 0) throw new Error("O número de parcelas tem de ser maior que zero.");
  if (totalMinor < 0n) throw new Error("O valor total não pode ser negativo.");

  const base = totalMinor / BigInt(count);
  const remainder = totalMinor % BigInt(count);
  const installments: MinorAmount[] = [];
  for (let i = 0; i < count; i++) {
    installments.push(base);
  }
  // O resto (sempre < count) é distribuído 1 cêntimo de cada vez pelas
  // últimas parcelas, para não concentrar toda a diferença só na última
  // quando o resto for grande (ex: total=100, count=3 -> 33,33,34 em vez de
  // 33,33,34 mesmo resultado aqui, mas para count=7 evita 14,14,14,14,14,14,16).
  for (let i = 0; i < Number(remainder); i++) {
    installments[count - 1 - i] += 1n;
  }
  return installments;
}

/**
 * Confirma que um plano de parcelas manualmente introduzido pelo utilizador
 * bate certo com o valor total da dívida — usando aritmética inteira exata,
 * nunca `installment * count !== total` em float.
 */
export function installmentsMatchTotal(
  installments: MinorAmount[],
  totalMinor: MinorAmount,
): boolean {
  return sum(installments) === totalMinor;
}

/** Formata um valor em unidade mínima para exibição, ex: 1050 EUR -> "10,50 EUR". */
export function formatMinor(
  amountMinor: MinorAmount,
  currency: string,
  locale = "pt-CV",
): string {
  const decimals = getCurrencyDecimalPlaces(currency);
  const majorValue = Number(amountMinor) / 10 ** decimals;
  return `${majorValue.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

/**
 * [Task 2 — Precisão monetária] Converte um valor digitado pelo utilizador
 * (string, ex: "10.50") para a unidade mínima da moeda (ex: 1050 para EUR).
 * Nunca usa `parseFloat`/`Math.round` — separa a parte inteira da decimal
 * como string e compõe o BigInt diretamente, para nunca introduzir
 * imprecisão de vírgula flutuante na conversão. Lança se o valor tiver mais
 * casas decimais do que a moeda permite (ver getCurrencyDecimalPlaces) —
 * nunca arredonda silenciosamente uma entrada do utilizador.
 */
export function toMinor(input: string, currency: string): MinorAmount {
  const decimals = getCurrencyDecimalPlaces(currency);
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(unsigned);
  if (!match) throw new Error(`Valor inválido: "${input}".`);
  const [, intPart, fracPartRaw = ""] = match;
  if (fracPartRaw.length > decimals) {
    throw new Error(`"${currency}" só aceita ${decimals} casa${decimals === 1 ? "" : "s"} decimal${decimals === 1 ? "" : "is"}.`);
  }
  const fracPart = fracPartRaw.padEnd(decimals, "0");
  const value = BigInt(`${intPart}${fracPart}`);
  return negative ? -value : value;
}

/** Inverso de `toMinor` — devolve a representação decimal exata como string, nunca `number`. */
export function fromMinor(amountMinor: MinorAmount, currency: string): string {
  const decimals = getCurrencyDecimalPlaces(currency);
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  if (decimals === 0) return `${negative ? "-" : ""}${abs.toString()}`;
  const digits = abs.toString().padStart(decimals + 1, "0");
  const intPart = digits.slice(0, -decimals);
  const fracPart = digits.slice(-decimals);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

/**
 * Arredondamento half-up determinístico de uma divisão inteira
 * (numerator/denominator), nunca usando float — necessário para o cálculo
 * de câmbio da Task 3 (destinationAmountMinor), mas já aqui porque é
 * aritmética monetária pura, mesmo sítio que `splitIntoInstallments`.
 * Half-up: se `2 * (numerator % denominator) >= denominator`, arredonda
 * para cima. `denominator` tem de ser positivo.
 */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("O denominador tem de ser positivo.");
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const quotient = n / denominator;
  const remainder = n % denominator;
  const roundedUp = 2n * remainder >= denominator ? quotient + 1n : quotient;
  return negative ? -roundedUp : roundedUp;
}

/**
 * [Task 3 — transferências multi-moeda] Converte uma taxa de câmbio
 * digitada (ex: "110.265") num par numerador/denominador inteiro exato —
 * mesma técnica de `toMinor`: separa a parte inteira da decimal como
 * string e compõe o BigInt diretamente, nunca `parseFloat`. A taxa
 * significa sempre "quantas unidades da moeda de destino por 1 unidade da
 * moeda de origem" (ex: rate="110" para EUR→CVE = 1 EUR vale 110 CVE).
 */
export function parseExchangeRate(rate: string): { numerator: bigint; denominator: bigint } {
  const trimmed = rate.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) throw new Error(`Taxa de câmbio inválida: "${rate}".`);
  const [, intPart, fracPartRaw = ""] = match;
  const numerator = BigInt(`${intPart}${fracPartRaw}`);
  const denominator = 10n ** BigInt(fracPartRaw.length);
  if (numerator <= 0n) throw new Error("A taxa de câmbio tem de ser maior que zero.");
  return { numerator, denominator };
}

/**
 * Quanto chega à conta de destino, na moeda de destino, dado o valor de
 * origem (na unidade mínima da moeda de origem) e a taxa "X destino por 1
 * origem". Tem em conta as casas decimais de cada moeda (podem ser
 * diferentes) — nunca assume as duas iguais. Arredondamento half-up
 * determinístico (`roundHalfUpDiv`), nunca `Number(x) * rate` em float.
 */
export function convertByExchangeRate(
  sourceAmountMinor: MinorAmount,
  rate: string,
  sourceCurrency: string,
  destinationCurrency: string,
): MinorAmount {
  const { numerator, denominator } = parseExchangeRate(rate);
  const sourceDecimals = getCurrencyDecimalPlaces(sourceCurrency);
  const destinationDecimals = getCurrencyDecimalPlaces(destinationCurrency);
  const scaledNumerator = numerator * 10n ** BigInt(destinationDecimals);
  const scaledDenominator = denominator * 10n ** BigInt(sourceDecimals);
  return roundHalfUpDiv(sourceAmountMinor * scaledNumerator, scaledDenominator);
}

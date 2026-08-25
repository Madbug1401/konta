// ============================================================================
// Aritmética monetária seguras.
//
// [DECISÃO 4 / regra 7 e 20 do briefing] Dinheiro nunca é `number`/float.
// Tudo aqui trabalha com `bigint` (unidade mínima, ex: cêntimos). Isto elimina
// por construção toda a classe de bug de arredondamento de vírgula flutuante
// encontrada na auditoria (ex: 333.33 * 3 !== 1000 em JS float).
// ============================================================================

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

/** Formata um valor em unidade mínima para exibição, ex: 150000 CVE -> "150 000 CVE". */
export function formatMinor(
  amountMinor: MinorAmount,
  currency: string,
  locale = "pt-CV",
): string {
  // CVE não tem subunidade de uso corrente -> minorUnitFactor = 1.
  // Preparado para moedas com cêntimos (EUR/USD) bastaria mudar este fator
  // por moeda numa tabela de configuração — ver docs/architecture/DECISIONS.md.
  const minorUnitFactor = 1;
  const majorValue = Number(amountMinor) / minorUnitFactor;
  return `${majorValue.toLocaleString(locale)} ${currency}`;
}

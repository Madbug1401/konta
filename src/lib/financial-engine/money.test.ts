import { describe, expect, it } from "vitest";
import {
  splitIntoInstallments,
  installmentsMatchTotal,
  sum,
  abs,
  toMinor,
  fromMinor,
  formatMinor,
  roundHalfUpDiv,
  parseExchangeRate,
  convertByExchangeRate,
} from "./money";

describe("splitIntoInstallments", () => {
  it("divide de forma exata quando o total é divisível", () => {
    expect(splitIntoInstallments(900n, 3)).toEqual([300n, 300n, 300n]);
  });

  it("distribui o resto pelas últimas parcelas em vez de o perder ou duplicar", () => {
    const installments = splitIntoInstallments(100n, 7);
    expect(sum(installments)).toBe(100n);
    expect(installments.length).toBe(7);
  });

  it("rejeita número de parcelas inválido", () => {
    expect(() => splitIntoInstallments(100n, 0)).toThrow();
  });

  it("rejeita valor total negativo", () => {
    expect(() => splitIntoInstallments(-100n, 3)).toThrow();
  });
});

describe("installmentsMatchTotal", () => {
  it("é verdadeiro quando a soma bate certo, mesmo com valores não redondos", () => {
    expect(installmentsMatchTotal([333n, 333n, 334n], 1000n)).toBe(true);
  });

  it("é falso quando a soma não bate certo", () => {
    expect(installmentsMatchTotal([333n, 333n, 333n], 1000n)).toBe(false);
  });
});

describe("abs", () => {
  it("devolve o valor absoluto sem alterar o sinal original de quem chama", () => {
    expect(abs(-500n)).toBe(500n);
    expect(abs(500n)).toBe(500n);
  });
});

// [Task 2 — Precisão monetária] toMinor/fromMinor nunca usam parseFloat nem
// Math.round — estes testes existem para provar isso com casos-limite reais
// (nunca toBeCloseTo, que esconderia exatamente o tipo de erro que isto
// previne).
describe("toMinor", () => {
  it("converte um valor com 2 casas decimais para CVE (centavo, ISO 4217 — decisão de 02/10/2026)", () => {
    expect(toMinor("50.00", "CVE")).toBe(5000n);
    expect(toMinor("5000", "CVE")).toBe(500000n); // "5000" sem ponto = 5000 escudos inteiros = 500000 centavos
  });

  it("converte um valor com 2 casas decimais para EUR", () => {
    expect(toMinor("10.50", "EUR")).toBe(1050n);
  });

  it("aceita um valor EUR sem parte decimal (completa com zeros)", () => {
    expect(toMinor("10", "EUR")).toBe(1000n);
  });

  it("rejeita mais casas decimais do que a moeda permite", () => {
    expect(() => toMinor("10.505", "EUR")).toThrow();
    expect(() => toMinor("50.001", "CVE")).toThrow();
  });

  it("preserva o sinal negativo", () => {
    expect(toMinor("-10.50", "EUR")).toBe(-1050n);
  });

  it("rejeita entrada não numérica", () => {
    expect(() => toMinor("abc", "EUR")).toThrow();
    expect(() => toMinor("", "EUR")).toThrow();
  });

  it("uma moeda desconhecida é tratada como 0 casas decimais (nunca lança por si só)", () => {
    expect(toMinor("300", "XYZ")).toBe(300n);
    expect(() => toMinor("300.50", "XYZ")).toThrow();
  });
});

describe("fromMinor", () => {
  it("é o inverso exato de toMinor para várias moedas", () => {
    expect(fromMinor(1050n, "EUR")).toBe("10.50");
    expect(fromMinor(5000n, "CVE")).toBe("50.00");
    expect(fromMinor(-1050n, "EUR")).toBe("-10.50");
  });

  it("preenche zeros à esquerda da parte decimal corretamente", () => {
    expect(fromMinor(5n, "EUR")).toBe("0.05");
  });
});

describe("formatMinor", () => {
  it("formata CVE e EUR, ambos com 2 casas decimais", () => {
    expect(formatMinor(5000n, "CVE")).toBe("50,00 CVE");
    expect(formatMinor(1050n, "EUR")).toBe("10,50 EUR");
  });
});

describe("roundHalfUpDiv", () => {
  it("arredonda exatamente .5 para cima", () => {
    expect(roundHalfUpDiv(5n, 2n)).toBe(3n); // 2.5 -> 3
    expect(roundHalfUpDiv(15n, 10n)).toBe(2n); // 1.5 -> 2
  });

  it("não arredonda para cima quando o resto é menor que metade", () => {
    expect(roundHalfUpDiv(14n, 10n)).toBe(1n); // 1.4 -> 1
  });

  it("funciona com valores negativos (arredonda o valor absoluto, preserva o sinal)", () => {
    expect(roundHalfUpDiv(-15n, 10n)).toBe(-2n);
  });

  it("rejeita denominador não positivo", () => {
    expect(() => roundHalfUpDiv(10n, 0n)).toThrow();
    expect(() => roundHalfUpDiv(10n, -1n)).toThrow();
  });
});

describe("parseExchangeRate", () => {
  it("converte uma taxa decimal exata em numerador/denominador", () => {
    expect(parseExchangeRate("110")).toEqual({ numerator: 110n, denominator: 1n });
    expect(parseExchangeRate("110.265")).toEqual({ numerator: 110265n, denominator: 1000n });
  });

  it("rejeita taxa <= 0 e entrada não numérica", () => {
    expect(() => parseExchangeRate("0")).toThrow();
    expect(() => parseExchangeRate("-5")).toThrow();
    expect(() => parseExchangeRate("abc")).toThrow();
  });
});

describe("convertByExchangeRate", () => {
  it("100 EUR a 110 CVE/EUR -> 11 000,00 CVE (ambas com 2 casas decimais)", () => {
    // sourceAmountMinor = 10000 (100.00 EUR em cêntimos)
    expect(convertByExchangeRate(10_000n, "110", "EUR", "CVE")).toBe(1_100_000n); // 11000.00 CVE em centavos
  });

  it("nunca usa float — uma taxa com muitas casas continua exata", () => {
    // 100.00 EUR a 110.265 CVE/EUR = 11026.50 CVE
    expect(convertByExchangeRate(10_000n, "110.265", "EUR", "CVE")).toBe(1_102_650n);
  });

  it("arredonda half-up no limite exato de .5, nunca trunca para baixo", () => {
    // 1.00 EUR * 1.005 = 1.005 centavos-equivalente -> exatamente no meio
    // (remainder*2 == denominator) -> half-up arredonda para 101, não 100.
    expect(convertByExchangeRate(100n, "1.005", "EUR", "CVE")).toBe(101n);
    // abaixo do meio (0.5%): fica para baixo, sem arredondar.
    expect(convertByExchangeRate(1n, "1.005", "EUR", "CVE")).toBe(1n);
  });
});

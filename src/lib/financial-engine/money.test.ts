import { describe, expect, it } from "vitest";
import { splitIntoInstallments, installmentsMatchTotal, sum, abs } from "./money";

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

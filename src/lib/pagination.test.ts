import { describe, expect, it } from "vitest";
import { DEFAULT_LIMIT, DEFAULT_OFFSET, MAX_LIMIT, MAX_OFFSET, parsePagination } from "./pagination";

describe("parsePagination", () => {
  it("usa os valores por omissão quando limit/offset não são fornecidos", () => {
    const result = parsePagination(null, null);
    expect(result).toEqual({ ok: true, limit: DEFAULT_LIMIT, offset: DEFAULT_OFFSET });
  });

  it("aceita valores válidos dentro do intervalo", () => {
    expect(parsePagination("20", "40")).toEqual({ ok: true, limit: 20, offset: 40 });
  });

  it("rejeita limit=NaN (ex: um valor não numérico na query string)", () => {
    const result = parsePagination("abc", null);
    expect(result.ok).toBe(false);
  });

  it("rejeita offset negativo", () => {
    const result = parsePagination(null, "-1");
    expect(result.ok).toBe(false);
  });

  it("rejeita limit negativo", () => {
    const result = parsePagination("-10", null);
    expect(result.ok).toBe(false);
  });

  it("rejeita um limit absurdamente grande (acima de MAX_LIMIT)", () => {
    const result = parsePagination(String(MAX_LIMIT + 1), null);
    expect(result.ok).toBe(false);
  });

  it("rejeita um offset absurdamente grande (acima de MAX_OFFSET)", () => {
    const result = parsePagination(null, String(MAX_OFFSET + 1));
    expect(result.ok).toBe(false);
  });

  it("rejeita valores não inteiros (ex: 1.5)", () => {
    expect(parsePagination("1.5", null).ok).toBe(false);
  });

  it("rejeita Infinity", () => {
    expect(parsePagination("Infinity", null).ok).toBe(false);
  });

  it("aceita limit=0? não — o mínimo exigido é 1 (uma página vazia por pedido não faz sentido)", () => {
    expect(parsePagination("0", null).ok).toBe(false);
  });

  it("aceita offset=0 (o primeiro valor válido do intervalo)", () => {
    expect(parsePagination(null, "0")).toEqual({ ok: true, limit: DEFAULT_LIMIT, offset: 0 });
  });
});

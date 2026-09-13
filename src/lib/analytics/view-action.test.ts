import { describe, expect, it } from "vitest";
import { AnalyticsViewActionSchema, parseAnalyticsViewAction } from "./view-action";

describe("AnalyticsViewActionSchema — segurança (secção 25 do pedido)", () => {
  it("aceita uma ação válida com um único campo", () => {
    expect(AnalyticsViewActionSchema.safeParse({ view: "cashflow" }).success).toBe(true);
    expect(AnalyticsViewActionSchema.safeParse({ period: { preset: "last_30d" } }).success).toBe(true);
  });

  it("rejeita um objeto vazio — a ação tem de alterar pelo menos um campo", () => {
    expect(AnalyticsViewActionSchema.safeParse({}).success).toBe(false);
  });

  it("rejeita QUALQUER campo desconhecido (.strict()) — nunca deixa a IA injetar um campo arbitrário", () => {
    expect(AnalyticsViewActionSchema.safeParse({ view: "cashflow", script: "alert(1)" }).success).toBe(false);
    expect(AnalyticsViewActionSchema.safeParse({ view: "cashflow", onClick: "javascript:alert(1)" }).success).toBe(false);
    // `__proto__` como key de objeto literal nunca cria uma propriedade própria enumerável
    // (define o protótipo) — o Zod rejeita-o de qualquer forma; ambos os desfechos são
    // seguros (nunca chega a existir um campo `__proto__` num objeto validado por este schema).
    expect(AnalyticsViewActionSchema.safeParse({ view: "cashflow", __proto__: { polluted: true } }).success).toBe(false);
  });

  it("rejeita um 'view' fora da lista fechada de views suportadas", () => {
    expect(AnalyticsViewActionSchema.safeParse({ view: "admin-panel" }).success).toBe(false);
  });

  it("rejeita um preset de período que não exista", () => {
    expect(AnalyticsViewActionSchema.safeParse({ period: { preset: "next_decade" } }).success).toBe(false);
  });

  it("rejeita datas mal formadas em 'from'/'to'", () => {
    expect(AnalyticsViewActionSchema.safeParse({ period: { from: "10/09/2026", to: "2026-09-30" } }).success).toBe(false);
  });

  it("rejeita transactionType fora do enum fechado", () => {
    expect(AnalyticsViewActionSchema.safeParse({ transactionType: "REFUND" }).success).toBe(false);
  });

  it("categoryId/accountId aceitam null (para 'limpar o filtro'), mas nunca um número/objeto", () => {
    expect(AnalyticsViewActionSchema.safeParse({ categoryId: null }).success).toBe(true);
    expect(AnalyticsViewActionSchema.safeParse({ categoryId: { $ne: null } }).success).toBe(false);
  });

  it("parseAnalyticsViewAction nunca lança — devolve null para entrada inválida", () => {
    expect(parseAnalyticsViewAction("<script>alert(1)</script>")).toBeNull();
    expect(parseAnalyticsViewAction(null)).toBeNull();
    expect(parseAnalyticsViewAction(undefined)).toBeNull();
    expect(parseAnalyticsViewAction(42)).toBeNull();
  });

  it("parseAnalyticsViewAction aceita uma ação real e devolve o objeto tipado", () => {
    const result = parseAnalyticsViewAction({ view: "categories", categoryId: "cat-1", categoryName: "Alimentação" });
    expect(result).toEqual({ view: "categories", categoryId: "cat-1", categoryName: "Alimentação" });
  });
});

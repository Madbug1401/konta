import { afterEach, describe, expect, it } from "vitest";
import { _resetRateLimitState, checkRateLimit, getClientIp } from "./rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    _resetRateLimitState();
  });

  it("permite pedidos até ao limite dentro da mesma janela", () => {
    const now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      expect(checkRateLimit("login:1.2.3.4", 5, 60_000, now).allowed).toBe(true);
    }
  });

  it("bloqueia a partir do pedido que excede o limite, com retryAfterSeconds > 0", () => {
    const now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      checkRateLimit("login:1.2.3.4", 5, 60_000, now);
    }
    const sixth = checkRateLimit("login:1.2.3.4", 5, 60_000, now);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("volta a permitir depois de a janela expirar", () => {
    const windowMs = 60_000;
    const now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      checkRateLimit("login:1.2.3.4", 5, windowMs, now);
    }
    expect(checkRateLimit("login:1.2.3.4", 5, windowMs, now).allowed).toBe(false);

    // Passou exatamente a duração da janela — deve começar uma nova.
    const afterWindow = now + windowMs + 1;
    expect(checkRateLimit("login:1.2.3.4", 5, windowMs, afterWindow).allowed).toBe(true);
  });

  it("mantém contagens independentes por chave (IPs diferentes não se afetam)", () => {
    const now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      checkRateLimit("login:1.2.3.4", 5, 60_000, now);
    }
    expect(checkRateLimit("login:1.2.3.4", 5, 60_000, now).allowed).toBe(false);
    // Um IP diferente começa com a sua própria contagem, do zero.
    expect(checkRateLimit("login:9.9.9.9", 5, 60_000, now).allowed).toBe(true);
  });

  it("mantém contagens independentes por rota (a mesma chave lógica de IP, rotas diferentes)", () => {
    const now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      checkRateLimit("login:1.2.3.4", 5, 60_000, now);
    }
    expect(checkRateLimit("login:1.2.3.4", 5, 60_000, now).allowed).toBe(false);
    // "register:" é uma chave completamente diferente do Map, mesmo para o mesmo IP.
    expect(checkRateLimit("register:1.2.3.4", 5, 60_000, now).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("usa o primeiro IP de x-forwarded-for quando presente", () => {
    const request = new Request("http://localhost/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("usa x-real-ip quando x-forwarded-for não está presente", () => {
    const request = new Request("http://localhost/api/auth/login", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("devolve 'unknown' quando nenhum cabeçalho de proxy está presente", () => {
    const request = new Request("http://localhost/api/auth/login");
    expect(getClientIp(request)).toBe("unknown");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
}));

describe("normalizeEmail", () => {
  it("converte para minúsculas e remove espaços à volta", async () => {
    const { normalizeEmail } = await import("./users");
    expect(normalizeEmail("Test@Example.com")).toBe("test@example.com");
    expect(normalizeEmail("  User@Konta.CV  ")).toBe("user@konta.cv");
    expect(normalizeEmail("already@lower.com")).toBe("already@lower.com");
  });
});

describe("bug corrigido na auditoria Go-to-Beta: Test@Example.com e test@example.com são a mesma conta", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("findUserByEmail consulta sempre com o email normalizado, seja qual for a capitalização recebida", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { findUserByEmail } = await import("./users");

    await findUserByEmail("Test@Example.com");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("WHERE email = $1"), ["test@example.com"]);
  });

  it("createUser grava sempre o email normalizado, mesmo que o utilizador tenha escrito maiúsculas", async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: "u1", email: "test@example.com", passwordHash: "hash", name: null, timezone: "Atlantic/Cape_Verde", locale: "pt-CV", defaultCurrency: "CVE" }],
    });
    const { createUser } = await import("./users");

    await createUser({ email: "Test@Example.com", passwordHash: "hash" });

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe("test@example.com");
  });

  it("uma tentativa de registo com capitalização diferente da já existente é encontrada por findUserByEmail (evitando duas contas para o mesmo endereço)", async () => {
    // Simula a conta já existir, gravada em minúsculas (comportamento
    // esperado depois desta correção).
    queryMock.mockResolvedValue({
      rows: [{ id: "u1", email: "test@example.com", passwordHash: "hash", name: null, timezone: "Atlantic/Cape_Verde", locale: "pt-CV", defaultCurrency: "CVE" }],
    });
    const { findUserByEmail } = await import("./users");

    const found = await findUserByEmail("TEST@EXAMPLE.COM");

    expect(found).not.toBeNull();
    expect(found?.email).toBe("test@example.com");
  });
});

describe("touchLastLogin", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("atualiza lastLoginAt para agora, filtrando pelo id do utilizador", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { touchLastLogin } = await import("./users");

    await touchLastLogin("u1");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('SET "lastLoginAt" = now()'), ["u1"]);
  });
});

// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] isAiEnabled é a verificação que POST /api/ai/chat usa
// para bloquear ou não um pedido — tem de falhar fechado (false) sempre
// que não houver uma linha "aiEnabled = true" clara, nunca assumir acesso
// ativo por omissão.
describe("isAiEnabled", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("devolve true quando aiEnabled é true na base de dados", async () => {
    queryMock.mockResolvedValue({ rows: [{ aiEnabled: true }] });
    const { isAiEnabled } = await import("./users");

    expect(await isAiEnabled("u1")).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('SELECT "aiEnabled"'), ["u1"]);
  });

  it("devolve false quando aiEnabled é false na base de dados", async () => {
    queryMock.mockResolvedValue({ rows: [{ aiEnabled: false }] });
    const { isAiEnabled } = await import("./users");

    expect(await isAiEnabled("u1")).toBe(false);
  });

  it("fail-closed: devolve false (nunca true) quando a query não encontra nenhuma linha", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { isAiEnabled } = await import("./users");

    expect(await isAiEnabled("utilizador-inexistente")).toBe(false);
  });
});

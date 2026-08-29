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

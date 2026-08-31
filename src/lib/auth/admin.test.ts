import { afterEach, describe, expect, it, vi } from "vitest";

// [Sugestão do utilizador — painel de estatísticas do dono do projeto]
// ADMIN_EMAILS é lido a cada chamada (nunca cacheado num módulo-level
// constant), precisamente para que testes como estes possam mudar o valor
// entre casos sem ter de reiniciar o processo — ver src/lib/auth/admin.ts.
describe("isAdminEmail", () => {
  const ORIGINAL_ENV = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = ORIGINAL_ENV;
    vi.resetModules();
  });

  it("devolve false quando ADMIN_EMAILS não está definida", async () => {
    delete process.env.ADMIN_EMAILS;
    vi.resetModules();
    const { isAdminEmail } = await import("./admin");

    expect(isAdminEmail("dono@konta.cv")).toBe(false);
  });

  it("reconhece um email presente na lista, ignorando maiúsculas/minúsculas e espaços", async () => {
    process.env.ADMIN_EMAILS = " Dono@Konta.cv , outro@konta.cv";
    vi.resetModules();
    const { isAdminEmail } = await import("./admin");

    expect(isAdminEmail("dono@konta.cv")).toBe(true);
    expect(isAdminEmail("DONO@KONTA.CV")).toBe(true);
    expect(isAdminEmail("outro@konta.cv")).toBe(true);
  });

  it("devolve false para um email fora da lista (fail-closed)", async () => {
    process.env.ADMIN_EMAILS = "dono@konta.cv";
    vi.resetModules();
    const { isAdminEmail } = await import("./admin");

    expect(isAdminEmail("atacante@example.com")).toBe(false);
  });

  it("devolve false para null/undefined/string vazia", async () => {
    process.env.ADMIN_EMAILS = "dono@konta.cv";
    vi.resetModules();
    const { isAdminEmail } = await import("./admin");

    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});

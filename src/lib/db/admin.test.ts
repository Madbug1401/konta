import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
}));

describe("getPlatformTotals", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("converte todas as contagens (devolvidas como string pelo pg) para number", async () => {
    queryMock.mockResolvedValue({
      rows: [{ users: "3", accounts: "7", transactions: "120", debts: "1", goals: "2", feedback: "4" }],
    });
    const { getPlatformTotals } = await import("./admin");

    const totals = await getPlatformTotals();

    expect(totals).toEqual({ users: 3, accounts: 7, transactions: 120, debts: 1, goals: 2, feedback: 4 });
  });
});

describe("listUsersWithActivity", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("mapeia lastLoginAt nulo (nunca fez login) sem o confundir com omitido", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "u1",
          email: "a@b.com",
          name: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          lastLoginAt: null,
          accountsCount: "2",
          transactionsCount: "10",
          aiEnabled: true,
        },
      ],
    });
    const { listUsersWithActivity } = await import("./admin");

    const [row] = await listUsersWithActivity();

    expect(row.lastLoginAt).toBeNull();
    expect(row.accountsCount).toBe(2);
    expect(row.transactionsCount).toBe(10);
  });

  it("preserva lastLoginAt quando presente", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "u1",
          email: "a@b.com",
          name: "A",
          createdAt: "2026-01-01T00:00:00.000Z",
          lastLoginAt: "2026-08-30T12:00:00.000Z",
          accountsCount: "0",
          transactionsCount: "0",
          aiEnabled: true,
        },
      ],
    });
    const { listUsersWithActivity } = await import("./admin");

    const [row] = await listUsersWithActivity();

    expect(row.lastLoginAt).toBe("2026-08-30T12:00:00.000Z");
  });

  // [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao
  // Konta AI por utilizador"] O Postgres devolve boolean já como boolean
  // JS (ao contrário das contagens, que vêm como string) — mesmo assim
  // passa por Boolean(...) em vez de confiar cegamente no valor, coerente
  // com o resto deste mapeamento.
  it("mapeia aiEnabled true/false corretamente", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "u1",
          email: "a@b.com",
          name: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          lastLoginAt: null,
          accountsCount: "0",
          transactionsCount: "0",
          aiEnabled: false,
        },
      ],
    });
    const { listUsersWithActivity } = await import("./admin");

    const [row] = await listUsersWithActivity();

    expect(row.aiEnabled).toBe(false);
  });
});

describe("setAiEnabledForUser", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("devolve true e grava o novo valor quando o utilizador existe", async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    const { setAiEnabledForUser } = await import("./admin");

    const result = await setAiEnabledForUser("u1", false);

    expect(result).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('SET "aiEnabled" = $2'), ["u1", false]);
  });

  it("devolve false sem lançar quando o userId não corresponde a ninguém", async () => {
    queryMock.mockResolvedValue({ rowCount: 0 });
    const { setAiEnabledForUser } = await import("./admin");

    expect(await setAiEnabledForUser("nao-existe", true)).toBe(false);
  });
});

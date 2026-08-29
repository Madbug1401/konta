import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionUserMock = vi.fn();
const getAccountByIdMock = vi.fn();
const getCategoryByIdMock = vi.fn();
const createTransactionMock = vi.fn();
const listTransactionsMock = vi.fn();
const findUserByIdMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/categories", () => ({ getCategoryById: getCategoryByIdMock }));
vi.mock("@/lib/db/transactions", () => ({
  createTransaction: createTransactionMock,
  listTransactions: listTransactionsMock,
}));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));

const SESSION = { userId: "user-1", email: "user1@konta.cv" };
const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Banco", type: "BANK", currency: "CVE" };

describe("GET /api/transactions — validação de limit/offset (Prioridade 8)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("bug que isto corrige: rejeita limit=abc (NaN) com 400, sem chamar listTransactions", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/transactions?limit=abc"));

    expect(response.status).toBe(400);
    expect(listTransactionsMock).not.toHaveBeenCalled();
  });

  it("rejeita offset negativo com 400", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/transactions?offset=-5"));

    expect(response.status).toBe(400);
    expect(listTransactionsMock).not.toHaveBeenCalled();
  });

  it("aceita limit/offset válidos e passa-os a listTransactions", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    listTransactionsMock.mockResolvedValue([]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/transactions?limit=10&offset=20"));

    expect(response.status).toBe(200);
    expect(listTransactionsMock).toHaveBeenCalledWith("user-1", expect.objectContaining({ limit: 10, offset: 20 }));
  });
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/transactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/transactions — ownership de categoryId (Prioridade 7)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("bug que isto corrige: rejeita uma categoria que pertence a outro utilizador (getCategoryById devolve null)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    // getCategoryById já filtra por dono/sistema — devolver null é o mesmo
    // resultado que aconteceria com uma categoria de outro utilizador.
    getCategoryByIdMock.mockResolvedValue(null);

    const { POST } = await import("./route");
    const response = await POST(
      postRequest({
        type: "EXPENSE",
        accountId: "acc-1",
        categoryId: "categoria-de-outro-utilizador",
        amountMinor: 1000,
        description: "Compras",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Categoria não encontrada." });
    // A defesa tem de acontecer ANTES de persistir — nunca criar a
    // transação com uma categoria não validada.
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("aceita uma categoria de sistema ou do próprio utilizador", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    getCategoryByIdMock.mockResolvedValue({ id: "cat-1", name: "Compras", kind: "EXPENSE", isSystem: true });
    createTransactionMock.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      type: "EXPENSE",
      status: "COMPLETED",
      accountId: "acc-1",
      destinationAccountId: null,
      amountMinor: 1000n,
      currency: "CVE",
      categoryId: "cat-1",
      description: "Compras",
      date: "2026-08-29",
      debtId: null,
      debtInstallmentId: null,
      goalId: null,
      recurringTransactionId: null,
    });

    const { POST } = await import("./route");
    const response = await POST(
      postRequest({
        type: "EXPENSE",
        accountId: "acc-1",
        categoryId: "cat-1",
        amountMinor: 1000,
        description: "Compras",
      }),
    );

    expect(response.status).toBe(201);
    expect(createTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-1" }));
  });

  it("não chama getCategoryById quando a transação não tem categoryId (ex: TRANSFER)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    createTransactionMock.mockResolvedValue({
      id: "tx-2",
      userId: "user-1",
      type: "TRANSFER",
      status: "COMPLETED",
      accountId: "acc-1",
      destinationAccountId: "acc-2",
      amountMinor: 1000n,
      currency: "CVE",
      categoryId: null,
      description: "Transferência",
      date: "2026-08-29",
      debtId: null,
      debtInstallmentId: null,
      goalId: null,
      recurringTransactionId: null,
    });
    getAccountByIdMock.mockImplementation(async (_userId: string, accountId: string) =>
      accountId === "acc-1" || accountId === "acc-2" ? { ...ACCOUNT, id: accountId } : null,
    );

    const { POST } = await import("./route");
    const response = await POST(
      postRequest({
        type: "TRANSFER",
        accountId: "acc-1",
        destinationAccountId: "acc-2",
        amountMinor: 1000,
        description: "Transferência",
      }),
    );

    expect(response.status).toBe(201);
    expect(getCategoryByIdMock).not.toHaveBeenCalled();
  });
});

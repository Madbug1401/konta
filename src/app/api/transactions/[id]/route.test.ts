import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionUserMock = vi.fn();
const getCategoryByIdMock = vi.fn();
const updateTransactionMock = vi.fn();
const getTransactionByIdMock = vi.fn();
const deleteTransactionMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/categories", () => ({ getCategoryById: getCategoryByIdMock }));
vi.mock("@/lib/db/transactions", () => ({
  getTransactionById: getTransactionByIdMock,
  updateTransaction: updateTransactionMock,
  deleteTransaction: deleteTransactionMock,
}));

const SESSION = { userId: "user-1", email: "user1@konta.cv" };

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/transactions/tx-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/transactions/[id] — ownership de categoryId (Prioridade 7)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("bug que isto corrige: rejeita atualizar para uma categoria que pertence a outro utilizador", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getCategoryByIdMock.mockResolvedValue(null);

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ categoryId: "categoria-de-outro-utilizador" }), {
      params: Promise.resolve({ id: "tx-1" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Categoria não encontrada." });
    expect(updateTransactionMock).not.toHaveBeenCalled();
  });

  it("aceita atualizar para uma categoria válida (de sistema ou do próprio utilizador)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getCategoryByIdMock.mockResolvedValue({ id: "cat-2", name: "Lazer", kind: "EXPENSE", isSystem: false });
    updateTransactionMock.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      type: "EXPENSE",
      status: "COMPLETED",
      accountId: "acc-1",
      destinationAccountId: null,
      amountMinor: 500n,
      currency: "CVE",
      categoryId: "cat-2",
      description: "Cinema",
      date: "2026-08-29",
      debtId: null,
      debtInstallmentId: null,
      goalId: null,
      recurringTransactionId: null,
    });

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ categoryId: "cat-2" }), {
      params: Promise.resolve({ id: "tx-1" }),
    });

    expect(response.status).toBe(200);
    expect(updateTransactionMock).toHaveBeenCalledWith(
      "user-1",
      "tx-1",
      expect.objectContaining({ categoryId: "cat-2" }),
    );
  });

  it("não valida categoria quando o PATCH não altera categoryId", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    updateTransactionMock.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      type: "EXPENSE",
      status: "COMPLETED",
      accountId: "acc-1",
      destinationAccountId: null,
      amountMinor: 700n,
      currency: "CVE",
      categoryId: null,
      description: "Compras atualizadas",
      date: "2026-08-29",
      debtId: null,
      debtInstallmentId: null,
      goalId: null,
      recurringTransactionId: null,
    });

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ description: "Compras atualizadas" }), {
      params: Promise.resolve({ id: "tx-1" }),
    });

    expect(response.status).toBe(200);
    expect(getCategoryByIdMock).not.toHaveBeenCalled();
  });
});

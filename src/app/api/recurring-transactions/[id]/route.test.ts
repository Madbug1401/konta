import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionUserMock = vi.fn();
const getAccountByIdMock = vi.fn();
const getCategoryByIdMock = vi.fn();
const getRecurringTransactionByIdMock = vi.fn();
const setRecurringTransactionActiveMock = vi.fn();
const updateRecurringTransactionMock = vi.fn();
const deleteRecurringTransactionMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/categories", () => ({ getCategoryById: getCategoryByIdMock }));
vi.mock("@/lib/db/recurring-transactions", () => ({
  getRecurringTransactionById: getRecurringTransactionByIdMock,
  setRecurringTransactionActive: setRecurringTransactionActiveMock,
  updateRecurringTransaction: updateRecurringTransactionMock,
  deleteRecurringTransaction: deleteRecurringTransactionMock,
}));

const SESSION = { userId: "user-1", email: "user1@konta.cv" };
const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET", currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

const SERIES = {
  id: "series-1",
  userId: "user-1",
  type: "EXPENSE",
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: 1500n,
  currency: "CVE",
  categoryId: null,
  description: "Spotify",
  frequency: "MONTHLY",
  interval: 1,
  startDate: "2026-06-30",
  endDate: null,
  occurrencesTotal: null,
  occurrencesGenerated: 0,
  nextRunDate: "2026-06-30",
  isActive: true,
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/recurring-transactions/series-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/recurring-transactions/[id]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("{isActive} sozinho continua a usar setRecurringTransactionActive (comportamento já existente preservado)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES);
    setRecurringTransactionActiveMock.mockResolvedValue({ ...SERIES, isActive: false });

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ isActive: false }), { params: Promise.resolve({ id: "series-1" }) });

    expect(response.status).toBe(200);
    expect(setRecurringTransactionActiveMock).toHaveBeenCalledWith("user-1", "series-1", false);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("edita description/amountMinor via updateRecurringTransaction", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES);
    updateRecurringTransactionMock.mockResolvedValue(undefined);

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ description: "Spotify Família", amountMinor: 2500 }), {
      params: Promise.resolve({ id: "series-1" }),
    });

    expect(response.status).toBe(200);
    expect(updateRecurringTransactionMock).toHaveBeenCalledWith(
      "user-1",
      "series-1",
      expect.objectContaining({ description: "Spotify Família", amountMinor: 2500n }),
    );
  });

  it("rejeita destinationAccountId numa série que não é TRANSFER", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES); // type: EXPENSE

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ destinationAccountId: "acc-2" }), { params: Promise.resolve({ id: "series-1" }) });

    expect(response.status).toBe(400);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("rejeita mudar a conta de origem para a mesma que já é o destino (self-transfer)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue({ ...SERIES, type: "TRANSFER", destinationAccountId: "acc-2" });
    getAccountByIdMock.mockImplementation(async (_u: string, id: string) => ({ ...ACCOUNT, id }));

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ accountId: "acc-2" }), { params: Promise.resolve({ id: "series-1" }) });

    expect(response.status).toBe(400);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("[Task 2] rejeita mudar para uma conta de destino com moeda diferente da origem", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue({ ...SERIES, type: "TRANSFER", accountId: "acc-1", destinationAccountId: "acc-2" });
    getAccountByIdMock.mockImplementation(async (_u: string, id: string) =>
      id === "acc-1" ? { ...ACCOUNT, id: "acc-1", currency: "CVE" } : { ...ACCOUNT, id: "acc-3", currency: "EUR" },
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ destinationAccountId: "acc-3" }), { params: Promise.resolve({ id: "series-1" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Transferências entre contas de moedas diferentes ainda não são suportadas." });
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("rejeita um categoryId que não pertence ao utilizador", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue(SERIES);
    getCategoryByIdMock.mockResolvedValue(null);

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ categoryId: "categoria-de-outro-utilizador" }), { params: Promise.resolve({ id: "series-1" }) });

    expect(response.status).toBe(404);
    expect(updateRecurringTransactionMock).not.toHaveBeenCalled();
  });

  it("404 quando a série não existe/não pertence ao utilizador", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    getRecurringTransactionByIdMock.mockResolvedValue(null);

    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ description: "X" }), { params: Promise.resolve({ id: "series-inexistente" }) });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/recurring-transactions/[id]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("elimina a série e devolve ok:true", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    deleteRecurringTransactionMock.mockResolvedValue(true);

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/recurring-transactions/series-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "series-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deleteRecurringTransactionMock).toHaveBeenCalledWith("user-1", "series-1");
  });

  it("404 quando a série não existe/não pertence ao utilizador — nunca apaga a de outro utilizador", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    deleteRecurringTransactionMock.mockResolvedValue(false);

    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost/api/recurring-transactions/series-2", { method: "DELETE" }), {
      params: Promise.resolve({ id: "series-2" }),
    });

    expect(response.status).toBe(404);
  });
});

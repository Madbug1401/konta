import { afterEach, describe, expect, it, vi } from "vitest";

// [Correção — implementação da interface de Dívidas] `payInstallment` é a
// primeira função do projeto a usar uma transação SQL explícita
// (BEGIN/COMMIT/ROLLBACK). Estes testes mockam o `PoolClient` devolvido por
// `pool.connect()` para confirmar o comportamento que mais importa: nunca
// fechar a dívida cedo demais, e nunca deixar uma escrita parcial (parcela
// paga sem o pagamento registado, ou vice-versa) quando algo falha a meio.
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: clientQueryMock, release: releaseMock }));

vi.mock("./client", () => ({
  getPool: () => ({ connect: connectMock, query: clientQueryMock }),
  toBigInt: (value: string | number | bigint | null) => (value === null ? 0n : BigInt(value)),
  toISODateString: (value: Date | string) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)),
}));

const BASE_ROW = {
  debtId: "debt-1",
  userId: "user-1",
  creditorName: "Banco BCA",
  description: null,
  originalAmountMinor: "120000",
  currency: "CVE",
  interestRate: null,
  debtStatus: "ACTIVE",
  startDate: "2026-01-01",
  finalDueDate: "2026-12-01",
  installmentId: "installment-1",
  sequence: 1,
  dueDate: "2026-01-01",
  amountMinor: "10000",
  installmentStatus: "PENDING",
  totalInstallments: 12,
};

const FAKE_TRANSACTION_ROW = {
  id: "tx-1",
  userId: "user-1",
  type: "EXPENSE",
  status: "COMPLETED",
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: "10000",
  currency: "CVE",
  categoryId: null,
  description: "Parcela 1/12 — Banco BCA",
  date: "2026-01-05",
  debtId: "debt-1",
  debtInstallmentId: "installment-1",
  goalId: null,
  recurringTransactionId: null,
};

describe("payInstallment", () => {
  afterEach(() => {
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  it("fecha a dívida (PAID_OFF) quando a parcela paga era a última por pagar", async () => {
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [BASE_ROW] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [FAKE_TRANSACTION_ROW] }) // INSERT Transaction (via createTransaction)
      .mockResolvedValueOnce({ rows: [{ ...BASE_ROW, status: "PAID" }] }) // UPDATE DebtInstallment RETURNING
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // SELECT COUNT restantes
      .mockResolvedValueOnce(undefined) // UPDATE Debt SET status = PAID_OFF
      .mockResolvedValueOnce(undefined); // COMMIT

    const { payInstallment } = await import("./debts");
    const result = await payInstallment("user-1", "debt-1", "installment-1", { accountId: "acc-1", date: "2026-01-05" });

    expect(result.debt.status).toBe("PAID_OFF");
    // A query de fecho da dívida tem de ter corrido — sem ela a dívida
    // ficaria com todas as parcelas pagas mas o status ainda ACTIVE.
    expect(clientQueryMock.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes(`UPDATE "Debt"`))).toBe(true);
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("mantém a dívida ACTIVE quando ainda há parcelas por pagar", async () => {
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [BASE_ROW] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [FAKE_TRANSACTION_ROW] }) // INSERT Transaction
      .mockResolvedValueOnce({ rows: [{ ...BASE_ROW, status: "PAID" }] }) // UPDATE DebtInstallment RETURNING
      .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // SELECT COUNT restantes — ainda há 2
      .mockResolvedValueOnce(undefined); // COMMIT

    const { payInstallment } = await import("./debts");
    const result = await payInstallment("user-1", "debt-1", "installment-1", { accountId: "acc-1", date: "2026-01-05" });

    expect(result.debt.status).toBe("ACTIVE");
    expect(clientQueryMock.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes(`UPDATE "Debt"`))).toBe(false);
  });

  it("rejeita pagar uma parcela que já está paga, sem escrever nada", async () => {
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...BASE_ROW, installmentStatus: "PAID" }] }) // já paga
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const { payInstallment, InstallmentNotPayableError } = await import("./debts");

    await expect(payInstallment("user-1", "debt-1", "installment-1", { accountId: "acc-1", date: "2026-01-05" })).rejects.toBeInstanceOf(
      InstallmentNotPayableError,
    );
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("faz ROLLBACK e propaga o erro se a escrita falhar a meio da transação (nunca fica parcialmente aplicada)", async () => {
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [BASE_ROW] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [FAKE_TRANSACTION_ROW] }) // INSERT Transaction ok
      .mockRejectedValueOnce(new Error("ligação perdida a meio")) // UPDATE DebtInstallment falha
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const { payInstallment } = await import("./debts");

    await expect(payInstallment("user-1", "debt-1", "installment-1", { accountId: "acc-1", date: "2026-01-05" })).rejects.toThrow(
      "ligação perdida a meio",
    );
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    // Nunca chega a COMMIT quando algo falhou antes.
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});

describe("createDebtWithInstallments", () => {
  afterEach(() => {
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  it("deriva finalDueDate da última parcela gerada, nunca de um valor à parte", async () => {
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: "debt-1",
            userId: "user-1",
            creditorName: "Banco BCA",
            description: null,
            originalAmountMinor: "30000",
            currency: "CVE",
            interestRate: null,
            status: "ACTIVE",
            startDate: "2026-01-01",
            finalDueDate: "2026-03-01",
          },
        ],
      }) // INSERT Debt RETURNING
      // 3 parcelas mensais -> 3 INSERT DebtInstallment
      .mockResolvedValueOnce({ rows: [{ id: "i1", debtId: "debt-1", sequence: 1, dueDate: "2026-01-01", amountMinor: "10000", status: "PENDING" }] })
      .mockResolvedValueOnce({ rows: [{ id: "i2", debtId: "debt-1", sequence: 2, dueDate: "2026-02-01", amountMinor: "10000", status: "PENDING" }] })
      .mockResolvedValueOnce({ rows: [{ id: "i3", debtId: "debt-1", sequence: 3, dueDate: "2026-03-01", amountMinor: "10000", status: "PENDING" }] })
      .mockResolvedValueOnce(undefined); // COMMIT

    const { createDebtWithInstallments } = await import("./debts");
    const result = await createDebtWithInstallments({
      userId: "user-1",
      creditorName: "Banco BCA",
      originalAmountMinor: 30000n,
      startDate: "2026-01-01",
      installmentCount: 3,
    });

    expect(result.installments).toHaveLength(3);
    expect(result.finalDueDate).toBe("2026-03-01");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });
});

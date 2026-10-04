import { afterEach, describe, expect, it, vi } from "vitest";

// [Correção — auditoria de prontidão para Beta] `materializeDueOccurrences`/
// `materializeSeries` eram a única peça de lógica com transação SQL própria
// (mesmo padrão de `payInstallment`, ver debts.test.ts) sem nenhum teste —
// apesar de ser o código mais novo e mais arriscado do pacote (gera dinheiro
// real, uma Transaction, sem nenhum pedido HTTP direto do utilizador por
// trás). Estes testes mockam o `PoolClient` devolvido por `pool.connect()`,
// tal como debts.test.ts, para confirmar: (1) o caminho feliz gera as
// ocorrências certas e avança o cursor tudo no mesmo commit; (2) uma conta
// entretanto arquivada pausa a série em vez de continuar a gerar Transactions
// contra ela para sempre; (3) uma falha a meio nunca deixa Transactions
// geradas sem o cursor avançado (ROLLBACK).
const poolQueryMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: clientQueryMock, release: releaseMock }));

vi.mock("./client", () => ({
  getPool: () => ({ connect: connectMock, query: poolQueryMock }),
  toBigInt: (value: string | number | bigint | null) => (value === null ? 0n : BigInt(value)),
  toISODateString: (value: Date | string) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)),
}));

const BASE_SERIES_ROW = {
  id: "series-1",
  userId: "user-1",
  type: "EXPENSE",
  accountId: "acc-1",
  destinationAccountId: null,
  amountMinor: "1500",
  currency: "CVE",
  destinationCurrency: null,
  destinationAmountMinor: null,
  exchangeRate: null,
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

function fakeTransactionRow(date: string) {
  return {
    id: `tx-${date}`,
    userId: "user-1",
    type: "EXPENSE",
    status: "COMPLETED",
    accountId: "acc-1",
    destinationAccountId: null,
    amountMinor: "1500",
    currency: "CVE",
    destinationCurrency: null,
    destinationAmountMinor: null,
    exchangeRate: null,
    categoryId: null,
    description: "Spotify",
    date,
    debtId: null,
    debtInstallmentId: null,
    goalId: null,
    recurringTransactionId: "series-1",
  };
}

describe("materializeDueOccurrences", () => {
  afterEach(() => {
    poolQueryMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
  });

  it("gera todas as ocorrências em atraso e avança o cursor num único commit", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "series-1" }] }); // SELECT séries ativas devidas

    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [BASE_SERIES_ROW] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // SELECT contas arquivadas — nenhuma
      .mockResolvedValueOnce({ rows: [fakeTransactionRow("2026-06-30")] }) // INSERT Transaction #1
      .mockResolvedValueOnce({ rows: [fakeTransactionRow("2026-07-30")] }) // INSERT Transaction #2
      .mockResolvedValueOnce({ rows: [fakeTransactionRow("2026-08-30")] }) // INSERT Transaction #3
      .mockResolvedValueOnce(undefined) // UPDATE RecurringTransaction (cursor)
      .mockResolvedValueOnce(undefined); // COMMIT

    const { materializeDueOccurrences } = await import("./recurring-transactions");
    await materializeDueOccurrences("user-1", "2026-08-30");

    // Exatamente 3 ocorrências geradas (30/06, 30/07, 30/08) — a 4ª (30/09)
    // fica para o próximo pedido, nunca gerada antecipadamente.
    const insertCalls = clientQueryMock.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes(`INSERT INTO "Transaction"`));
    expect(insertCalls).toHaveLength(3);

    const cursorUpdate = clientQueryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes(`UPDATE "RecurringTransaction"`) && sql.includes("nextRunDate"),
    );
    expect(cursorUpdate?.[1]).toEqual(["series-1", "2026-09-30", 3]);
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("[Task 3] copia destinationCurrency/destinationAmountMinor/exchangeRate do template para cada ocorrência gerada, nunca recalcula", async () => {
    const fxSeriesRow = {
      ...BASE_SERIES_ROW,
      currency: "EUR",
      destinationCurrency: "CVE",
      destinationAmountMinor: "1100000",
      exchangeRate: "110",
      endDate: "2026-06-30", // só 1 ocorrência, para simplificar o mock
    };
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "series-1" }] });
    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [fxSeriesRow] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // SELECT contas arquivadas — nenhuma
      .mockResolvedValueOnce({ rows: [fakeTransactionRow("2026-06-30")] }) // INSERT Transaction #1
      .mockResolvedValueOnce(undefined) // UPDATE RecurringTransaction (cursor)
      .mockResolvedValueOnce(undefined); // COMMIT

    const { materializeDueOccurrences } = await import("./recurring-transactions");
    await materializeDueOccurrences("user-1", "2026-08-30");

    const insertCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes(`INSERT INTO "Transaction"`));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // índices 6/7/8 do array de parâmetros: destinationCurrency, destinationAmountMinor, exchangeRate.
    expect(params[6]).toBe("CVE");
    expect(params[7]).toBe("1100000");
    expect(params[8]).toBe("110");
  });

  it("pausa a série (isActive=false) e nunca gera Transactions quando a conta está arquivada", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "series-1" }] });

    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [BASE_SERIES_ROW] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: "acc-1" }] }) // SELECT contas arquivadas — encontrou a conta
      .mockResolvedValueOnce(undefined) // UPDATE RecurringTransaction SET isActive = false
      .mockResolvedValueOnce(undefined); // COMMIT

    const { materializeDueOccurrences } = await import("./recurring-transactions");
    await materializeDueOccurrences("user-1", "2026-08-30");

    // Nenhuma Transaction chega a ser criada contra a conta arquivada.
    expect(clientQueryMock.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes(`INSERT INTO "Transaction"`))).toBe(false);

    const pauseUpdate = clientQueryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes(`UPDATE "RecurringTransaction"`) && sql.includes(`"isActive" = false`),
    );
    expect(pauseUpdate).toBeDefined();
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("faz ROLLBACK e nunca avança o cursor se uma escrita falhar a meio (erro fica só registado, não propaga)", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "series-1" }] });

    clientQueryMock
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [BASE_SERIES_ROW] }) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // SELECT contas arquivadas — nenhuma
      .mockRejectedValueOnce(new Error("ligação perdida a meio")) // INSERT Transaction #1 falha
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const { materializeDueOccurrences } = await import("./recurring-transactions");

    // materializeDueOccurrences nunca deixa o erro de UMA série derrubar o
    // pedido inteiro (outras séries do utilizador continuam a ser
    // processadas) — por isso não rejeita, só regista o erro internamente.
    await expect(materializeDueOccurrences("user-1", "2026-08-30")).resolves.toBeUndefined();

    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQueryMock).not.toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("não faz nenhuma escrita quando não há séries ativas devidas (custo zero)", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const { materializeDueOccurrences } = await import("./recurring-transactions");
    await materializeDueOccurrences("user-1", "2026-08-30");

    expect(connectMock).not.toHaveBeenCalled();
    expect(clientQueryMock).not.toHaveBeenCalled();
  });
});

// [Task 1 — editar/eliminar recorrências] updateRecurringTransaction lê a
// série existente (getRecurringTransactionById) e só depois faz o UPDATE —
// por isso cada teste mocka as DUAS chamadas a poolQueryMock, por ordem.
describe("updateRecurringTransaction", () => {
  afterEach(() => {
    poolQueryMock.mockReset();
  });

  it("atualiza os campos dados e mantém nextRunDate quando startDate não avança para além do cursor", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [BASE_SERIES_ROW] }); // getRecurringTransactionById
    poolQueryMock.mockResolvedValueOnce({ rows: [{ ...BASE_SERIES_ROW, description: "Spotify Família", amountMinor: "2000" }] }); // UPDATE

    const { updateRecurringTransaction } = await import("./recurring-transactions");
    const result = await updateRecurringTransaction("user-1", "series-1", { description: "Spotify Família", amountMinor: 2000n });

    expect(result?.description).toBe("Spotify Família");
    const updateCall = poolQueryMock.mock.calls[1];
    // Índice 12 do array de parâmetros é sempre o nextRunDate calculado —
    // igual ao existente (startDate não mudou nesta edição).
    expect(updateCall[1][12]).toBe(BASE_SERIES_ROW.nextRunDate);
  });

  it("avança nextRunDate quando a nova startDate é depois do cursor atual", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [BASE_SERIES_ROW] }); // nextRunDate/startDate = 2026-06-30
    poolQueryMock.mockResolvedValueOnce({ rows: [{ ...BASE_SERIES_ROW, startDate: "2026-09-01", nextRunDate: "2026-09-01" }] });

    const { updateRecurringTransaction } = await import("./recurring-transactions");
    await updateRecurringTransaction("user-1", "series-1", { startDate: "2026-09-01" });

    const updateCall = poolQueryMock.mock.calls[1];
    expect(updateCall[1][12]).toBe("2026-09-01");
  });

  it("devolve null sem tentar o UPDATE quando a série não existe/não pertence ao utilizador", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] }); // getRecurringTransactionById não encontra nada

    const { updateRecurringTransaction } = await import("./recurring-transactions");
    const result = await updateRecurringTransaction("user-1", "series-inexistente", { description: "X" });

    expect(result).toBeNull();
    expect(poolQueryMock).toHaveBeenCalledTimes(1); // nunca chega a tentar o UPDATE
  });
});

describe("deleteRecurringTransaction", () => {
  afterEach(() => {
    poolQueryMock.mockReset();
  });

  it("devolve true quando a série é eliminada", async () => {
    poolQueryMock.mockResolvedValueOnce({ rowCount: 1 });
    const { deleteRecurringTransaction } = await import("./recurring-transactions");
    expect(await deleteRecurringTransaction("user-1", "series-1")).toBe(true);
  });

  it("devolve false quando a série não existe/não pertence ao utilizador, nunca lança", async () => {
    poolQueryMock.mockResolvedValueOnce({ rowCount: 0 });
    const { deleteRecurringTransaction } = await import("./recurring-transactions");
    expect(await deleteRecurringTransaction("user-1", "series-inexistente")).toBe(false);
  });
});

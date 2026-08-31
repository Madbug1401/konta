import { afterEach, describe, expect, it, vi } from "vitest";

// [Correção — pedido explícito do utilizador] `deleteAccount` é a primeira
// (e única) operação de DELETE físico de uma Account que este projeto
// implementa — deliberadamente estreita, ver DELETE_POLICY.md:
// `Transaction.accountId` tem `ON DELETE CASCADE`, por isso um DELETE sem
// nenhuma verificação apagaria em cascata todo o histórico de transações da
// conta em silêncio. Estes testes confirmam a única coisa que realmente
// importa aqui: uma conta com qualquer histórico (transação, meta,
// recorrência ou investimento) nunca chega a ser apagada.
const queryMock = vi.fn();

vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
  toBigInt: (value: string | number | bigint | null) => (value === null ? 0n : BigInt(value)),
}));

const ACCOUNT_ROW = {
  id: "acc-1",
  userId: "user-1",
  name: "Carteira",
  type: "WALLET",
  currency: "CVE",
  initialBalanceMinor: "0",
  isArchived: false,
  color: null,
};

describe("deleteAccount", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("devolve false sem tentar apagar nada quando a conta não existe (ou não é do utilizador)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // getAccountById

    const { deleteAccount } = await import("./accounts");
    const result = await deleteAccount("user-1", "acc-1");

    expect(result).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("rejeita apagar (AccountNotEmptyError) quando a conta tem histórico, e nunca chega a fazer DELETE", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [ACCOUNT_ROW] }) // getAccountById
      .mockResolvedValueOnce({ rows: [{ hasTransactions: true, hasGoals: false, hasRecurring: false, hasInvestmentDetail: false }] }); // SELECT EXISTS

    const { deleteAccount, AccountNotEmptyError } = await import("./accounts");

    await expect(deleteAccount("user-1", "acc-1")).rejects.toBeInstanceOf(AccountNotEmptyError);
    expect(queryMock.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes(`DELETE FROM "Account"`))).toBe(false);
  });

  it("apaga a conta a sério só quando não há nenhum histórico associado", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [ACCOUNT_ROW] }) // getAccountById
      .mockResolvedValueOnce({ rows: [{ hasTransactions: false, hasGoals: false, hasRecurring: false, hasInvestmentDetail: false }] }) // SELECT EXISTS
      .mockResolvedValueOnce({ rowCount: 1 }); // DELETE

    const { deleteAccount } = await import("./accounts");
    const result = await deleteAccount("user-1", "acc-1");

    expect(result).toBe(true);
    const deleteCall = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes(`DELETE FROM "Account"`));
    expect(deleteCall?.[1]).toEqual(["user-1", "acc-1"]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const payInstallmentMock = vi.fn();
const findUserByIdMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));
vi.mock("@/lib/db/debts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/debts")>("@/lib/db/debts");
  return { ...actual, payInstallment: payInstallmentMock };
});

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Carteira", type: "WALLET" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("pay_debt_installment tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; exige debtId, installmentId e accountId reais", async () => {
    const { payDebtInstallmentTool } = await import("./pay-debt-installment");
    expect(payDebtInstallmentTool.riskTier).toBe("HIGH");
    expect(payDebtInstallmentTool.paramsSchema.safeParse({ debtId: "d1", installmentId: "i1", accountId: "a1" }).success).toBe(true);
    expect(payDebtInstallmentTool.paramsSchema.safeParse({ debtId: "d1", installmentId: "i1" }).success).toBe(false);
  });

  it("nunca paga contra uma conta arquivada", async () => {
    getAccountByIdMock.mockResolvedValue({ ...ACCOUNT, isArchived: true });
    const { payDebtInstallmentTool } = await import("./pay-debt-installment");

    await expect(payDebtInstallmentTool.execute("user-1", { debtId: "d1", installmentId: "i1", accountId: "acc-1" })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(payInstallmentMock).not.toHaveBeenCalled();
  });

  it("uma parcela de outro utilizador (ou já paga) é rejeitada com mensagem clara — payInstallment já verifica ownership internamente", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    const { InstallmentNotPayableError } = await import("@/lib/db/debts");
    payInstallmentMock.mockRejectedValue(new InstallmentNotPayableError("Parcela não encontrada."));
    const { payDebtInstallmentTool } = await import("./pay-debt-installment");

    await expect(
      payDebtInstallmentTool.execute("user-1", { debtId: "d1", installmentId: "i-de-outro", accountId: "acc-1" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("paga via payInstallment() existente — cria a Transaction e fecha a dívida se for a última parcela", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    payInstallmentMock.mockResolvedValue({
      debt: { id: "d1", status: "PAID_OFF" },
      installment: { id: "i1", status: "PAID" },
    });
    const { payDebtInstallmentTool } = await import("./pay-debt-installment");

    const result = await payDebtInstallmentTool.execute("user-1", { debtId: "d1", installmentId: "i1", accountId: "acc-1", date: "2026-02-01" });

    expect(payInstallmentMock).toHaveBeenCalledWith("user-1", "d1", "i1", { accountId: "acc-1", date: "2026-02-01" });
    expect(result).toEqual({ debtStatus: "PAID_OFF", installmentStatus: "PAID" });
  });
});

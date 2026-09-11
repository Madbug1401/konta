import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getDebtByIdMock = vi.fn();
const markDebtDefaultedMock = vi.fn();

vi.mock("@/lib/db/debts", () => ({ getDebtById: getDebtByIdMock, markDebtDefaulted: markDebtDefaultedMock }));

const ACTIVE_DEBT = { id: "debt-1", userId: "user-1", creditorName: "João", description: null, currency: "CVE", status: "ACTIVE" as const, startDate: "2026-01-01", finalDueDate: null };

describe("mark_debt_defaulted tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH (nunca CRITICAL, mesmo sendo irreversível — mesmo nível de update_goal_status)", async () => {
    const { markDebtDefaultedTool } = await import("./mark-debt-defaulted");
    expect(markDebtDefaultedTool.riskTier).toBe("HIGH");
  });

  it("uma dívida de outro utilizador (ou inexistente) nunca é marcada", async () => {
    getDebtByIdMock.mockResolvedValue(null);
    const { markDebtDefaultedTool } = await import("./mark-debt-defaulted");

    await expect(markDebtDefaultedTool.execute("user-1", { debtId: "debt-de-outro" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(markDebtDefaultedMock).not.toHaveBeenCalled();
  });

  it("uma dívida já paga/incumprida não pode ser marcada outra vez — rejeita antes de chamar markDebtDefaulted", async () => {
    getDebtByIdMock.mockResolvedValue({ ...ACTIVE_DEBT, status: "PAID_OFF" });
    const { markDebtDefaultedTool } = await import("./mark-debt-defaulted");

    await expect(markDebtDefaultedTool.execute("user-1", { debtId: "debt-1" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(markDebtDefaultedMock).not.toHaveBeenCalled();
  });

  it("marca via markDebtDefaulted() existente quando a dívida está ACTIVE", async () => {
    getDebtByIdMock.mockResolvedValue(ACTIVE_DEBT);
    markDebtDefaultedMock.mockResolvedValue({ ...ACTIVE_DEBT, status: "DEFAULTED" });
    const { markDebtDefaultedTool } = await import("./mark-debt-defaulted");

    const result = await markDebtDefaultedTool.execute("user-1", { debtId: "debt-1" });

    expect(markDebtDefaultedMock).toHaveBeenCalledWith("user-1", "debt-1");
    expect(result).toEqual({ status: "DEFAULTED" });
  });

  it("summarize nunca confunde 'incumprida' com 'paga', e avisa que é irreversível", async () => {
    const { markDebtDefaultedTool } = await import("./mark-debt-defaulted");
    const summary = markDebtDefaultedTool.summarize({ debtId: "debt-1", creditorName: "João" }).toLowerCase();
    expect(summary).toContain("incumprida");
    expect(summary).not.toContain("paga");
    expect(summary).toContain("irrevers");
  });
});

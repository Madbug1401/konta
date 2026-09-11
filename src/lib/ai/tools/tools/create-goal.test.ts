import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getAccountByIdMock = vi.fn();
const createGoalMock = vi.fn();

vi.mock("@/lib/db/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("@/lib/db/goals", () => ({ createGoal: createGoalMock }));

const ACCOUNT = { id: "acc-1", userId: "user-1", name: "Poupança", type: "SAVINGS" as const, currency: "CVE", initialBalanceMinor: 0n, isArchived: false, color: null };

describe("create_goal tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; linkedAccountId é obrigatório", async () => {
    const { createGoalTool } = await import("./create-goal");
    expect(createGoalTool.riskTier).toBe("HIGH");
    expect(createGoalTool.paramsSchema.safeParse({ name: "Laptop", targetAmountMinor: 120000 }).success).toBe(false);
    expect(createGoalTool.paramsSchema.safeParse({ name: "Laptop", targetAmountMinor: 120000, linkedAccountId: "acc-1" }).success).toBe(true);
  });

  it("nunca cria uma meta ligada a uma conta de outro utilizador (ou inexistente)", async () => {
    getAccountByIdMock.mockResolvedValue(null);
    const { createGoalTool } = await import("./create-goal");

    await expect(
      createGoalTool.execute("user-1", { name: "Laptop", targetAmountMinor: 120000, linkedAccountId: "acc-de-outro" }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
    expect(createGoalMock).not.toHaveBeenCalled();
  });

  it("cria via createGoal() existente, herdando a moeda da conta quando não especificada", async () => {
    getAccountByIdMock.mockResolvedValue(ACCOUNT);
    createGoalMock.mockResolvedValue({ id: "goal-1", name: "Laptop" });
    const { createGoalTool } = await import("./create-goal");

    const result = await createGoalTool.execute("user-1", { name: "Laptop", targetAmountMinor: 120000, linkedAccountId: "acc-1" });

    expect(createGoalMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", name: "Laptop", currency: "CVE", linkedAccountId: "acc-1" }));
    expect(result).toEqual({ id: "goal-1", name: "Laptop" });
  });
});

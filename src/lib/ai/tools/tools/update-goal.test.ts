import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getGoalByIdMock = vi.fn();
const updateGoalMock = vi.fn();

vi.mock("@/lib/db/goals", () => ({ getGoalById: getGoalByIdMock, updateGoal: updateGoalMock }));

const GOAL = { id: "goal-1", userId: "user-1", name: "Laptop", description: null, currency: "CVE", targetAmountMinor: 120000n, targetDate: null, linkedAccountId: "acc-1", status: "ACTIVE" as const };

describe("update_goal tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; nunca aceita linkedAccountId", async () => {
    const { updateGoalTool } = await import("./update-goal");
    expect(updateGoalTool.riskTier).toBe("HIGH");
    expect(updateGoalTool.paramsSchema.safeParse({ goalId: "goal-1", linkedAccountId: "acc-2" }).success).toBe(false);
    expect(updateGoalTool.paramsSchema.safeParse({ goalId: "goal-1", name: "Computador" }).success).toBe(true);
  });

  it("uma meta de outro utilizador nunca é editada", async () => {
    getGoalByIdMock.mockResolvedValue(null);
    const { updateGoalTool } = await import("./update-goal");

    await expect(updateGoalTool.execute("user-1", { goalId: "goal-de-outro" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateGoalMock).not.toHaveBeenCalled();
  });

  it("atualiza via updateGoal() existente", async () => {
    getGoalByIdMock.mockResolvedValue(GOAL);
    updateGoalMock.mockResolvedValue({ ...GOAL, name: "Computador" });
    const { updateGoalTool } = await import("./update-goal");

    const result = await updateGoalTool.execute("user-1", { goalId: "goal-1", name: "Computador" });

    expect(updateGoalMock).toHaveBeenCalledWith("user-1", "goal-1", { name: "Computador", description: undefined, targetAmountMinor: undefined, targetDate: undefined });
    expect(result.name).toBe("Computador");
  });
});

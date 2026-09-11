import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionError } from "../types";

const getGoalByIdMock = vi.fn();
const updateGoalStatusMock = vi.fn();

vi.mock("@/lib/db/goals", () => ({ getGoalById: getGoalByIdMock, updateGoalStatus: updateGoalStatusMock }));

const ACTIVE_GOAL = { id: "goal-1", userId: "user-1", name: "Laptop", description: null, currency: "CVE", targetAmountMinor: 120000n, targetDate: null, linkedAccountId: "acc-1", status: "ACTIVE" as const };

describe("update_goal_status tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é HIGH; só aceita ACHIEVED/ABANDONED, nunca ACTIVE (não existe forma de reabrir)", async () => {
    const { updateGoalStatusTool } = await import("./update-goal-status");
    expect(updateGoalStatusTool.riskTier).toBe("HIGH");
    expect(updateGoalStatusTool.paramsSchema.safeParse({ goalId: "goal-1", status: "ACTIVE" }).success).toBe(false);
    expect(updateGoalStatusTool.paramsSchema.safeParse({ goalId: "goal-1", status: "ACHIEVED" }).success).toBe(true);
  });

  it("uma meta já concluída/abandonada não muda de estado outra vez", async () => {
    getGoalByIdMock.mockResolvedValue({ ...ACTIVE_GOAL, status: "ACHIEVED" });
    const { updateGoalStatusTool } = await import("./update-goal-status");

    await expect(updateGoalStatusTool.execute("user-1", { goalId: "goal-1", status: "ABANDONED" })).rejects.toBeInstanceOf(ToolExecutionError);
    expect(updateGoalStatusMock).not.toHaveBeenCalled();
  });

  it("marca via updateGoalStatus() existente quando a meta está ACTIVE", async () => {
    getGoalByIdMock.mockResolvedValue(ACTIVE_GOAL);
    updateGoalStatusMock.mockResolvedValue({ ...ACTIVE_GOAL, status: "ACHIEVED" });
    const { updateGoalStatusTool } = await import("./update-goal-status");

    const result = await updateGoalStatusTool.execute("user-1", { goalId: "goal-1", status: "ACHIEVED" });

    expect(updateGoalStatusMock).toHaveBeenCalledWith("user-1", "goal-1", "ACHIEVED");
    expect(result).toEqual({ status: "ACHIEVED" });
  });

  it("summarize avisa que é irreversível", async () => {
    const { updateGoalStatusTool } = await import("./update-goal-status");
    expect(updateGoalStatusTool.summarize({ goalId: "goal-1", status: "ACHIEVED" }).toLowerCase()).toContain("irrevers");
  });
});

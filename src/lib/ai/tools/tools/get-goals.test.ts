import { afterEach, describe, expect, it, vi } from "vitest";

const findUserByIdMock = vi.fn();
const listGoalsMock = vi.fn();
const listAccountsMock = vi.fn();
const listAllTransactionsForBalancesMock = vi.fn();

vi.mock("@/lib/db/users", () => ({ findUserById: findUserByIdMock }));
vi.mock("@/lib/db/goals", () => ({ listGoals: listGoalsMock }));
vi.mock("@/lib/db/accounts", () => ({ listAccounts: listAccountsMock }));
vi.mock("@/lib/db/transactions", () => ({ listAllTransactionsForBalances: listAllTransactionsForBalancesMock }));

const GOAL = {
  id: "goal-1",
  userId: "user-1",
  name: "Computador",
  description: null,
  currency: "CVE",
  targetAmountMinor: 120000n,
  targetDate: "2027-03-01",
  linkedAccountId: null,
  status: "ACTIVE" as const,
};

describe("get_goals tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("paramsSchema não aceita nenhum campo, incluindo userId", async () => {
    const { getGoalsTool } = await import("./get-goals");
    expect(getGoalsTool.paramsSchema.safeParse({}).success).toBe(true);
    expect(getGoalsTool.paramsSchema.safeParse({ userId: "outro" }).success).toBe(false);
  });

  it("devolve um DTO sem id da meta nem linkedAccountId/userId (reutiliza buildGoalSummaries do Milestone 2)", async () => {
    findUserByIdMock.mockResolvedValue({ timezone: "Atlantic/Cape_Verde" });
    listGoalsMock.mockResolvedValue([GOAL]);
    listAccountsMock.mockResolvedValue([]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getGoalsTool } = await import("./get-goals");
    const [goal] = await getGoalsTool.execute("user-1", {});

    expect(goal.name).toBe("Computador");
    const serialized = JSON.stringify(goal);
    expect(serialized).not.toContain("\"id\"");
    expect(serialized).not.toContain("linkedAccountId");
    expect(serialized).not.toContain("userId");
  });

  it("preserva o isolamento por utilizador", async () => {
    findUserByIdMock.mockResolvedValue(null);
    listGoalsMock.mockResolvedValue([]);
    listAccountsMock.mockResolvedValue([]);
    listAllTransactionsForBalancesMock.mockResolvedValue([]);

    const { getGoalsTool } = await import("./get-goals");
    await getGoalsTool.execute("user-55", {});

    expect(listGoalsMock).toHaveBeenCalledWith("user-55");
    expect(listAccountsMock).toHaveBeenCalledWith("user-55");
    expect(listAllTransactionsForBalancesMock).toHaveBeenCalledWith("user-55");
  });
});

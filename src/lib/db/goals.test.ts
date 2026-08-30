import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
  toBigInt: (value: string | number | bigint | null) => (value === null ? 0n : BigInt(value)),
  toISODateString: (value: Date | string) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)),
}));

describe("createGoal", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("grava sempre linkedAccountId — nunca cria uma meta sem conta associada", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "goal-1",
          userId: "user-1",
          name: "Fundo de emergência",
          description: null,
          targetAmountMinor: "300000",
          currency: "CVE",
          targetDate: null,
          linkedAccountId: "acc-1",
          status: "ACTIVE",
        },
      ],
    });
    const { createGoal } = await import("./goals");

    const goal = await createGoal({
      userId: "user-1",
      name: "Fundo de emergência",
      targetAmountMinor: 300000n,
      linkedAccountId: "acc-1",
    });

    expect(goal.linkedAccountId).toBe("acc-1");
    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    // linkedAccountId é o último parâmetro do INSERT (ver src/lib/db/goals.ts).
    expect(params[params.length - 1]).toBe("acc-1");
  });
});

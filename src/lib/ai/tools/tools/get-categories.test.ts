import { afterEach, describe, expect, it, vi } from "vitest";

const listCategoriesMock = vi.fn();
vi.mock("@/lib/db/categories", () => ({ listCategories: listCategoriesMock }));

describe("get_categories tool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("riskTier é LOW", async () => {
    const { getCategoriesTool } = await import("./get-categories");
    expect(getCategoriesTool.riskTier).toBe("LOW");
  });

  it("paramsSchema não aceita nenhum campo, incluindo userId", async () => {
    const { getCategoriesTool } = await import("./get-categories");
    expect(getCategoriesTool.paramsSchema.safeParse({}).success).toBe(true);
    expect(getCategoriesTool.paramsSchema.safeParse({ userId: "outro" }).success).toBe(false);
  });

  it("devolve id/name/kind, nunca userId nem isSystem cru sem necessidade", async () => {
    listCategoriesMock.mockResolvedValue([
      { id: "cat-1", name: "Alimentação", kind: "EXPENSE", isSystem: true },
      { id: "cat-2", name: "Freelance", kind: "INCOME", isSystem: false },
    ]);
    const { getCategoriesTool } = await import("./get-categories");

    const result = await getCategoriesTool.execute("user-1", {});

    expect(result).toEqual([
      { id: "cat-1", name: "Alimentação", kind: "EXPENSE" },
      { id: "cat-2", name: "Freelance", kind: "INCOME" },
    ]);
    expect(listCategoriesMock).toHaveBeenCalledWith("user-1");
  });
});

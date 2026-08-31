import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
}));

describe("createFeedback", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("grava sempre com o userId recebido, nunca anónimo", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { createFeedback } = await import("./feedback");

    await createFeedback("u1", "Adorava um gráfico de despesas por mês.");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "Feedback"'), [
      "u1",
      "Adorava um gráfico de despesas por mês.",
    ]);
  });
});

describe("listFeedback", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("mapeia userName nulo sem o confundir com omitido", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: "f1",
          message: "Faltava um botão de exportar.",
          createdAt: "2026-08-30T12:00:00.000Z",
          userEmail: "a@b.com",
          userName: null,
        },
      ],
    });
    const { listFeedback } = await import("./feedback");

    const [row] = await listFeedback();

    expect(row.userName).toBeNull();
    expect(row.userEmail).toBe("a@b.com");
    expect(row.message).toBe("Faltava um botão de exportar.");
  });

  it("preserva userName quando presente", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { id: "f1", message: "Ótima app!", createdAt: "2026-08-30T12:00:00.000Z", userEmail: "a@b.com", userName: "Ana" },
      ],
    });
    const { listFeedback } = await import("./feedback");

    const [row] = await listFeedback();

    expect(row.userName).toBe("Ana");
  });
});

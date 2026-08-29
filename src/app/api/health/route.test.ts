import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db/client", () => ({
  getPool: () => ({ query: queryMock }),
}));

describe("GET /api/health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryMock.mockReset();
  });

  it("devolve 200 'healthy' quando a base de dados responde", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "healthy" });
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
  });

  it("devolve 503 'unhealthy' quando a base de dados não responde, sem vazar detalhes do erro", async () => {
    queryMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ status: "unhealthy" });
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });
});

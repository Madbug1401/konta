import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/rate-limit";

const getSessionUserMock = vi.fn();
const isAiEnabledMock = vi.fn().mockResolvedValue(true);
const collectAnalyticsDatasetMock = vi.fn();
const runFinancialSimulationMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/users", () => ({ isAiEnabled: isAiEnabledMock }));
vi.mock("@/lib/analytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics")>("@/lib/analytics");
  return { ...actual, collectAnalyticsDataset: collectAnalyticsDatasetMock, runFinancialSimulation: runFinancialSimulationMock };
});

const SESSION = { userId: "user-1", email: "user1@konta.cv" };
const DATASET = { userId: "user-1", timezone: "Atlantic/Cape_Verde", defaultCurrency: "CVE", accounts: [], transactions: [], categories: [], debts: [], goals: [], recurring: [], investmentAccounts: [] };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/analytics/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/analytics/simulate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    isAiEnabledMock.mockResolvedValue(true);
    _resetRateLimitState();
  });

  it("rejeita sem sessão com 401", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(postRequest({ input: { type: "reduce_category", categoryName: "X", percent: 10 } }));
    expect(response.status).toBe(401);
  });

  it("bloqueia com 403 quando o acesso ao Konta AI está desativado", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    isAiEnabledMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const response = await POST(postRequest({ input: { type: "reduce_category", categoryName: "X", percent: 10 } }));
    expect(response.status).toBe(403);
  });

  it("rejeita um input com 'type' desconhecido", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");
    const response = await POST(postRequest({ input: { type: "delete_everything" } }));
    expect(response.status).toBe(400);
  });

  it("executa a simulação via runFinancialSimulation() e devolve o resultado — nunca escreve nada", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    collectAnalyticsDatasetMock.mockResolvedValue(DATASET);
    runFinancialSimulationMock.mockReturnValue({ currency: "CVE", periodLabel: "x", real: {}, simulated: {}, assumptions: [] });
    const { POST } = await import("./route");

    const response = await POST(postRequest({ input: { type: "reduce_category", categoryName: "Alimentação", percent: 10 } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(collectAnalyticsDatasetMock).toHaveBeenCalledWith("user-1");
    expect(body.assumptions).toEqual([]);
  });

  it("SimulationInputError vira 400 com a mensagem, nunca um 500 cru", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    collectAnalyticsDatasetMock.mockResolvedValue(DATASET);
    const { SimulationInputError } = await import("@/lib/analytics");
    runFinancialSimulationMock.mockImplementation(() => {
      throw new SimulationInputError("Categoria não encontrada.");
    });
    const { POST } = await import("./route");

    const response = await POST(postRequest({ input: { type: "reduce_category", categoryName: "Inexistente", percent: 10 } }));

    expect(response.status).toBe(400);
  });

  it("respeita o rate limit próprio", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    collectAnalyticsDatasetMock.mockResolvedValue(DATASET);
    runFinancialSimulationMock.mockReturnValue({ currency: "CVE", periodLabel: "x", real: {}, simulated: {}, assumptions: [] });
    const { POST } = await import("./route");

    for (let i = 0; i < 20; i++) {
      const response = await POST(postRequest({ input: { type: "reduce_category", categoryName: "X", percent: 10 } }));
      expect(response.status).toBe(200);
    }
    const blocked = await POST(postRequest({ input: { type: "reduce_category", categoryName: "X", percent: 10 } }));
    expect(blocked.status).toBe(429);
  });
});

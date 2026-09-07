import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionUserMock = vi.fn();
const isAdminEmailMock = vi.fn();
const setAiEnabledForUserMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/auth/admin", () => ({ isAdminEmail: isAdminEmailMock }));
vi.mock("@/lib/db/admin", () => ({ setAiEnabledForUser: setAiEnabledForUserMock }));

const ADMIN_SESSION = { userId: "admin-1", email: "dono@konta.cv" };
const NON_ADMIN_SESSION = { userId: "user-1", email: "user1@konta.cv" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/user-2/ai-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// [Sugestão do utilizador — "quero poder ativar/desativar o acesso ao Konta
// AI por utilizador"] Mesma filosofia de autorização da página /admin
// (src/app/(app)/admin/page.tsx): 404 genérico para quem não é admin,
// nunca 401/403 — não confirma sequer que esta rota existe.
describe("POST /api/admin/users/[userId]/ai-access", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("devolve 404 genérico sem sessão, sem chamar setAiEnabledForUser", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ enabled: false }), { params: Promise.resolve({ userId: "user-2" }) });

    expect(response.status).toBe(404);
    expect(setAiEnabledForUserMock).not.toHaveBeenCalled();
  });

  it("devolve 404 genérico (nunca 401/403) para um utilizador autenticado que não é admin", async () => {
    getSessionUserMock.mockResolvedValue(NON_ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(false);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ enabled: false }), { params: Promise.resolve({ userId: "user-2" }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Não encontrado." });
    expect(setAiEnabledForUserMock).not.toHaveBeenCalled();
  });

  it("rejeita um corpo sem 'enabled' booleano com 400", async () => {
    getSessionUserMock.mockResolvedValue(ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(true);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ enabled: "sim" }), { params: Promise.resolve({ userId: "user-2" }) });

    expect(response.status).toBe(400);
    expect(setAiEnabledForUserMock).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o userId do URL não corresponde a nenhum utilizador", async () => {
    getSessionUserMock.mockResolvedValue(ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(true);
    setAiEnabledForUserMock.mockResolvedValue(false);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ enabled: false }), { params: Promise.resolve({ userId: "nao-existe" }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Utilizador não encontrado." });
  });

  it("admin: desativa o acesso de outro utilizador com sucesso", async () => {
    getSessionUserMock.mockResolvedValue(ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(true);
    setAiEnabledForUserMock.mockResolvedValue(true);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ enabled: false }), { params: Promise.resolve({ userId: "user-2" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, aiEnabled: false });
    expect(setAiEnabledForUserMock).toHaveBeenCalledWith("user-2", false);
  });

  it("admin: reativa o acesso de outro utilizador com sucesso", async () => {
    getSessionUserMock.mockResolvedValue(ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(true);
    setAiEnabledForUserMock.mockResolvedValue(true);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ enabled: true }), { params: Promise.resolve({ userId: "user-2" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, aiEnabled: true });
  });
});

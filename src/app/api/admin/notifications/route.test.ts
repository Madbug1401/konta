import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionUserMock = vi.fn();
const isAdminEmailMock = vi.fn();
const createNotificationMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/auth/admin", () => ({ isAdminEmail: isAdminEmailMock }));
vi.mock("@/lib/db/notifications", () => ({ createNotification: createNotificationMock }));

const ADMIN_SESSION = { userId: "admin-1", email: "dono@konta.cv" };
const NON_ADMIN_SESSION = { userId: "user-1", email: "user1@konta.cv" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/admin/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// [Sugestão do utilizador — "quero enviar mensagens aos meus users, como
// notificação"] Mesma filosofia de autorização de
// src/app/api/admin/users/[userId]/ai-access/route.test.ts: 404 genérico
// para quem não é admin, nunca 401/403.
describe("POST /api/admin/notifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("devolve 404 genérico sem sessão, sem chamar createNotification", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Olá" }));

    expect(response.status).toBe(404);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("devolve 404 genérico para um utilizador autenticado que não é admin", async () => {
    getSessionUserMock.mockResolvedValue(NON_ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(false);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Olá" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Não encontrado." });
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("rejeita uma mensagem vazia com 400", async () => {
    getSessionUserMock.mockResolvedValue(ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(true);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "   " }));

    expect(response.status).toBe(400);
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("admin: cria a notificação com sucesso", async () => {
    getSessionUserMock.mockResolvedValue(ADMIN_SESSION);
    isAdminEmailMock.mockReturnValue(true);
    createNotificationMock.mockResolvedValue(undefined);

    const { POST } = await import("./route");
    const response = await POST(postRequest({ message: "Atualizámos a precisão monetária." }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(createNotificationMock).toHaveBeenCalledWith("Atualizámos a precisão monetária.");
  });
});

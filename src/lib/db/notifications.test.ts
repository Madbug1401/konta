import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("./client", () => ({
  getPool: () => ({ query: queryMock }),
}));

describe("createNotification", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("grava a mensagem como broadcast, sem destinatário", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { createNotification } = await import("./notifications");

    await createNotification("Atualizámos a precisão monetária.");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "Notification"'), [
      "Atualizámos a precisão monetária.",
    ]);
  });
});

describe("listNotificationsForUser", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("mapeia 'read' para boolean a partir do LEFT JOIN", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { id: "n1", message: "Lida por este utilizador", createdAt: "2026-10-04T12:00:00.000Z", read: true },
        { id: "n2", message: "Ainda não lida", createdAt: "2026-10-04T11:00:00.000Z", read: false },
      ],
    });
    const { listNotificationsForUser } = await import("./notifications");

    const rows = await listNotificationsForUser("u1");

    expect(rows[0].read).toBe(true);
    expect(rows[1].read).toBe(false);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["u1"]);
  });
});

describe("countUnreadNotifications", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("converte a contagem de string para número", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: "3" }] });
    const { countUnreadNotifications } = await import("./notifications");

    const count = await countUnreadNotifications("u1");

    expect(count).toBe(3);
  });
});

describe("markAllNotificationsRead", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("insere NotificationRead só para notificações ainda não lidas deste utilizador", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { markAllNotificationsRead } = await import("./notifications");

    await markAllNotificationsRead("u1");

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "NotificationRead"'), ["u1"]);
  });
});

describe("listRecentNotifications", () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it("devolve o histórico sem estado de leitura", async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: "n1", message: "Aviso de manutenção", createdAt: "2026-10-04T12:00:00.000Z" }],
    });
    const { listRecentNotifications } = await import("./notifications");

    const [row] = await listRecentNotifications();

    expect(row).toEqual({ id: "n1", message: "Aviso de manutenção", createdAt: "2026-10-04T12:00:00.000Z" });
  });
});

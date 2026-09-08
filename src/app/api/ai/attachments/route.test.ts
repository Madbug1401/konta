import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetAttachmentStoreForTests } from "@/lib/ai/attachments/store";
import { _resetRateLimitState } from "@/lib/rate-limit";

const getSessionUserMock = vi.fn();
const isAiEnabledMock = vi.fn().mockResolvedValue(true);
const uploadFileToAnthropicMock = vi.fn().mockResolvedValue("file_mock123");

vi.mock("@/lib/auth/session", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/db/users", () => ({ isAiEnabled: isAiEnabledMock }));
vi.mock("@/lib/ai/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/gateway")>("@/lib/ai/gateway");
  return { ...actual, uploadFileToAnthropic: uploadFileToAnthropicMock };
});

const SESSION = { userId: "user-1", email: "user1@konta.cv" };

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function postRequest(form: FormData) {
  return new Request("http://localhost/api/ai/attachments", { method: "POST", body: form });
}

function formWithFile(bytes: Uint8Array<ArrayBuffer>, filename: string, kind?: string): FormData {
  const form = new FormData();
  form.set("file", new File([bytes], filename));
  if (kind) form.set("kind", kind);
  return form;
}

describe("POST /api/ai/attachments", () => {
  afterEach(() => {
    vi.clearAllMocks();
    isAiEnabledMock.mockResolvedValue(true);
    _resetRateLimitState();
    _resetAttachmentStoreForTests();
  });

  it("rejeita um pedido sem sessão com 401, sem tocar no Attachment Store", async () => {
    getSessionUserMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(formWithFile(PNG_BYTES, "recibo.png")));

    expect(response.status).toBe(401);
    expect(uploadFileToAnthropicMock).not.toHaveBeenCalled();
  });

  it("bloqueia com 403 quando o acesso ao Konta AI está desativado", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    isAiEnabledMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");

    const response = await POST(postRequest(formWithFile(PNG_BYTES, "recibo.png")));

    expect(response.status).toBe(403);
    expect(uploadFileToAnthropicMock).not.toHaveBeenCalled();
  });

  it("rejeita um pedido sem ficheiro com 400", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const response = await POST(postRequest(new FormData()));

    expect(response.status).toBe(400);
  });

  it("uma imagem válida é carregada para a Files API e devolve o resumo seguro (nunca o fileId real)", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const response = await POST(postRequest(formWithFile(PNG_BYTES, "recibo.png")));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ attachmentId: expect.any(String), kind: "image", filename: "recibo.png", sizeBytes: PNG_BYTES.length });
    expect(body.fileId).toBeUndefined();
    expect(uploadFileToAnthropicMock).toHaveBeenCalledWith(expect.any(Uint8Array), "recibo.png", "image/png", 3600);
  });

  it("um ficheiro de tipo não suportado devolve 400 com AttachmentError, nunca chega à Files API", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const response = await POST(postRequest(formWithFile(garbage, "misterio.bin")));

    expect(response.status).toBe(400);
    expect(uploadFileToAnthropicMock).not.toHaveBeenCalled();
  });

  it("um TXT/CSV nunca é enviado à Files API — fica como texto inline no Attachment Store", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const csvBytes = new TextEncoder().encode("data,valor\n2026-09-08,2000");
    const response = await POST(postRequest(formWithFile(csvBytes, "gastos.csv", "csv")));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.kind).toBe("csv");
    expect(uploadFileToAnthropicMock).not.toHaveBeenCalled();
  });

  it("quando a Files API falha, devolve 502 sem expor o erro técnico do SDK", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    uploadFileToAnthropicMock.mockRejectedValueOnce(new Error("connection reset by peer, upstream 10.0.4.2"));
    const { POST } = await import("./route");

    const response = await POST(postRequest(formWithFile(PNG_BYTES, "recibo.png")));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("10.0.4.2");
  });

  it("bloqueia depois do limite de uploads por utilizador, com Retry-After", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    for (let i = 0; i < 20; i++) {
      const response = await POST(postRequest(formWithFile(PNG_BYTES, `recibo-${i}.png`)));
      expect(response.status).toBe(201);
    }
    const blocked = await POST(postRequest(formWithFile(PNG_BYTES, "recibo-extra.png")));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("attachments de utilizadores diferentes nunca colidem — cada upload cria um id novo e próprio", async () => {
    getSessionUserMock.mockResolvedValue(SESSION);
    const { POST } = await import("./route");

    const first = await (await POST(postRequest(formWithFile(PNG_BYTES, "a.png")))).json();

    getSessionUserMock.mockResolvedValue({ userId: "user-2", email: "user2@konta.cv" });
    const second = await (await POST(postRequest(formWithFile(PNG_BYTES, "b.png")))).json();

    expect(first.attachmentId).not.toBe(second.attachmentId);
  });
});
